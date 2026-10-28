import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import { components } from "../../../_generated/api"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../../lib/functions"
import { maxImageBytes, maxResumeBytes, Preferences, Profile, resumeTypes } from "./validators"

const me = authedQuery({
  args: {},
  returns: v.object({
    name: v.string(),
    email: v.string(),
    userName: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    onboarded: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get("users", ctx.userId)
    return {
      name: user?.name ?? "",
      email: user?.email ?? "",
      userName: user?.userName ?? "",
      imageUrl: user?.imageId ? await ctx.storage.getUrl(user.imageId) : null,
      onboarded: user?.onboardedAt !== undefined,
    }
  },
})

const updateProfile = arkMutation({
  args: Profile,
  returns: v.null(),
  handler: async (ctx, { name, email, userName }) => {
    if (userName) {
      const owner = await ctx.db
        .query("users")
        .withIndex("by_userName", (q) => q.eq("userName", userName))
        .unique()
      if (owner && owner._id !== ctx.userId) throw new ConvexError("That username is taken.")
    }
    await ctx.db.patch("users", ctx.userId, {
      name: name || undefined,
      email: email || undefined,
      userName: userName || undefined,
    })
    return null
  },
})

const generateUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.storage.generateUploadUrl(),
})

const setImage = arkMutation({
  args: type({ "imageId?": arkId("_storage") }),
  returns: v.null(),
  handler: async (ctx, { imageId }) => {
    if (imageId) {
      const file = await ctx.db.system.get("_storage", imageId)
      if (!file?.contentType?.startsWith("image/")) throw new ConvexError("Upload an image file.")
      if (file.size > maxImageBytes) throw new ConvexError("Images must be 5 MB or smaller.")
      const owner = await ctx.db
        .query("users")
        .withIndex("by_imageId", (q) => q.eq("imageId", imageId))
        .first()
      if (owner && owner._id !== ctx.userId)
        throw new ConvexError("That image belongs to someone else.")
    }
    const user = await ctx.db.get("users", ctx.userId)
    if (user?.imageId && user.imageId !== imageId) await ctx.storage.delete(user.imageId)
    await ctx.db.patch("users", ctx.userId, { imageId })
    return null
  },
})

const preferences = authedQuery({
  args: {},
  returns: v.object({
    preferences: v.union(arkOutputToConvex(Preferences), v.null()),
    resume: v.union(v.object({ name: v.string(), url: v.union(v.string(), v.null()) }), v.null()),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get("users", ctx.userId)
    return {
      preferences: user?.preferences ?? null,
      resume: user?.resumeId
        ? { name: user.resumeName ?? "Resume", url: await ctx.storage.getUrl(user.resumeId) }
        : null,
    }
  },
})

const savePreferences = arkMutation({
  args: Preferences,
  returns: v.null(),
  handler: async (ctx, preferences) => {
    const user = await ctx.db.get("users", ctx.userId)
    await ctx.db.patch("users", ctx.userId, {
      preferences,
      onboardedAt: user?.onboardedAt ?? Date.now(),
    })
    return null
  },
})

// "Skip for now" on first run: stop sending this user to Preferences.
const skipPreferences = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await ctx.db.get("users", ctx.userId)
    if (user?.onboardedAt === undefined) {
      await ctx.db.patch("users", ctx.userId, { onboardedAt: Date.now() })
    }
    return null
  },
})

// One resume at a time: a new upload replaces the old file, and no args removes it.
const setResume = arkMutation({
  args: type({ "resumeId?": arkId("_storage"), "name?": "string <= 200" }),
  returns: v.null(),
  handler: async (ctx, { resumeId, name }) => {
    if (resumeId) {
      const file = await ctx.db.system.get("_storage", resumeId)
      if (!file?.contentType || !resumeTypes.includes(file.contentType))
        throw new ConvexError("Upload a PDF, Word or plain text file.")
      if (file.size > maxResumeBytes) throw new ConvexError("Resumes must be 10 MB or smaller.")
      const owner = await ctx.db
        .query("users")
        .withIndex("by_resumeId", (q) => q.eq("resumeId", resumeId))
        .first()
      if (owner && owner._id !== ctx.userId)
        throw new ConvexError("That file belongs to someone else.")
    }
    const user = await ctx.db.get("users", ctx.userId)
    if (user?.resumeId && user.resumeId !== resumeId) await ctx.storage.delete(user.resumeId)
    await ctx.db.patch("users", ctx.userId, {
      resumeId,
      resumeName: resumeId ? name : undefined,
    })
    return null
  },
})

// Convex Auth 2.0.0-beta.0 has no API to delete a user's sign-in records, and it
// reuses their user id on the next sign-in. So the users row stays, emptied, and
// everything that belongs to the user goes.
const deleteAccount = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for await (const application of ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))) {
      await ctx.db.delete("applications", application._id)
    }
    const user = await ctx.db.get("users", ctx.userId)
    if (user?.imageId) await ctx.storage.delete(user.imageId)
    if (user?.resumeId) await ctx.storage.delete(user.resumeId)
    await ctx.runMutation(components.authUsername.public.deleteUsername, { userId: ctx.userId })
    await ctx.db.replace("users", ctx.userId, {})
    return null
  },
})

export const publicApi = {
  me,
  updateProfile,
  generateUploadUrl,
  setImage,
  deleteAccount,
  preferences,
  savePreferences,
  skipPreferences,
  setResume,
}

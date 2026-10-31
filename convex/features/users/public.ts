import { ConvexError, v } from "convex/values"
import { components } from "../../_generated/api"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { deleteEmail } from "../email/utils"
import { deleteNotifications } from "../notifications/utils"
import { logEdit } from "../activity/utils"
import { startDelete } from "../deletes/utils"
import { deleteResumeFile } from "../preferences/utils"
import { maxImageBytes, Profile, vMe } from "./validators"

const me = authedQuery({
  args: {},
  returns: vMe,
  handler: async (ctx) => {
    const user = await ctx.db.get("users", ctx.userId)
    return {
      name: user?.name ?? "",
      email: user?.email ?? "",
      userName: user?.userName ?? "",
      preferredName: user?.preferredName ?? "",
      linkedin: user?.linkedin ?? "",
      github: user?.github ?? "",
      x: user?.x ?? "",
      imageUrl: user?.imageId ? await ctx.storage.getUrl(user.imageId) : null,
      onboarded: user?.onboardedAt !== undefined,
    }
  },
})

const updateProfile = arkMutation({
  args: Profile,
  returns: v.null(),
  handler: async (ctx, { name, email, userName, preferredName, linkedin, github, x }) => {
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
      preferredName: preferredName || undefined,
      linkedin: linkedin || undefined,
      github: github || undefined,
      x: x || undefined,
    })
    await logEdit(ctx, ctx.userId, "account.profile", "Updated your profile")
    return null
  },
})

const generateUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.storage.generateUploadUrl(),
})

const setImage = authedMutation({
  args: { imageId: v.optional(v.id("_storage")) },
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
    await logEdit(
      ctx,
      ctx.userId,
      "account.photo",
      imageId ? "Changed your photo" : "Removed your photo"
    )
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
    const user = await ctx.db.get("users", ctx.userId)
    if (user?.imageId) await ctx.storage.delete(user.imageId)
    await deleteResumeFile(ctx, ctx.userId)
    await deleteEmail(ctx, ctx.userId)
    await deleteNotifications(ctx, ctx.userId)
    await ctx.runMutation(components.authUsername.public.deleteUsername, { userId: ctx.userId })
    await ctx.db.replace("users", ctx.userId, {})
    await startDelete(ctx, { kind: "account", userId: ctx.userId, before: Date.now() })
    return null
  },
})

export const publicApi = {
  me,
  updateProfile,
  generateUploadUrl,
  setImage,
  deleteAccount,
}

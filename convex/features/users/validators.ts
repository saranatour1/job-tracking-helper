import { type } from "arktype"
import { arkId } from "../../lib/ark"
import { v } from "convex/values"

export const maxImageBytes = 5 * 1024 * 1024

export const maxNameLength = 80

const trimmed = type("string.trim")

// Long enough, and with hyphens, so a GitHub username fits.
export const UserName = type("/^[a-zA-Z0-9_-]{3,39}$/")

export const Profile = type({
  name: trimmed.to(`string <= ${maxNameLength}`),
  email: trimmed.to(type("string.email | ''").describe("an email address")),
  userName: trimmed.to(
    UserName.or("''").describe("3 to 39 letters, numbers, hyphens or underscores")
  ),
  "preferredName?": trimmed.to("string <= 80"),
  "linkedin?": trimmed.to("string <= 200"),
  "github?": trimmed.to("string <= 200"),
  "x?": trimmed.to("string <= 200"),
})
export type Profile = typeof Profile.infer

export const User = type({
  "name?": "string",
  "email?": "string",
  "userName?": "string",
  "preferredName?": "string",
  "linkedin?": "string",
  "github?": "string",
  "x?": "string",
  "imageId?": arkId("_storage"),
  "avatarUrl?": "string",
  "githubImportedAt?": "number",
  "onboardedAt?": "number",
  "trashDays?": "number",
  "nextApplicationNumber?": "number",
  "prepareAt?": "number",
})

export const vMe = v.object({
  name: v.string(),
  email: v.string(),
  userName: v.string(),
  preferredName: v.string(),
  linkedin: v.string(),
  github: v.string(),
  x: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  onboarded: v.boolean(),
})

import { type } from "arktype"
import { arkId } from "../../lib/ark"
import { v } from "convex/values"

export const maxImageBytes = 5 * 1024 * 1024

const trimmed = type("string.trim")

// Form shape: an empty string means "not set".
export const Profile = type({
  name: trimmed.to("string <= 80"),
  email: trimmed.to(type("string.email | ''").describe("an email address")),
  userName: trimmed.to(
    type("/^[a-zA-Z0-9_]{3,20}$/ | ''").describe("3 to 20 letters, numbers or underscores")
  ),
  "preferredName?": trimmed.to("string <= 80"),
  "linkedin?": trimmed.to("string <= 200"),
  "github?": trimmed.to("string <= 200"),
  "x?": trimmed.to("string <= 200"),
})
export type Profile = typeof Profile.infer

// Every field is optional: a new or deleted account has none of them.
export const User = type({
  "name?": "string",
  "email?": "string",
  "userName?": "string",
  // What you go by. Goes on mail you send, ahead of your full name.
  "preferredName?": "string",
  // For your email signature: full links or handles, as you typed them.
  "linkedin?": "string",
  "github?": "string",
  "x?": "string",
  "imageId?": arkId("_storage"),
  // Set when someone saves or skips Preferences, so first run only sends them there once.
  "onboardedAt?": "number",
  // How many days applications stay in the Trash before they're deleted; 0 keeps them.
  // Unset means 90.
  "trashDays?": "number",
  // The next APP number, so adding an application needn't read the others. Unset until
  // their first application.
  "nextApplicationNumber?": "number",
  // When preparing applications for new fits was turned on under Account; unset means off.
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

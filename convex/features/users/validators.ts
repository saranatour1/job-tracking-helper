import { type } from "arktype"

export const maxImageBytes = 5 * 1024 * 1024

const trimmed = type("string.trim")

// Form shape: an empty string means "not set".
export const Profile = type({
  name: trimmed.to("string <= 80"),
  email: trimmed.to(type("string.email | ''").describe("an email address")),
  userName: trimmed.to(
    type("/^[a-zA-Z0-9_]{3,20}$/ | ''").describe("3 to 20 letters, numbers or underscores")
  ),
})
export type Profile = typeof Profile.infer

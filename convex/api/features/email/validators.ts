import { type } from "arktype"

const trimmed = type("string.trim")

// What someone pastes to connect their Cloudflare account. Safe to import from the frontend.
// An empty token keeps the saved one, so the account or address can change without
// pasting it again. Each rule has a fixed message: arktype's default repeats the
// value, and a token must never end up on screen or in a server error log.
export const Connect = type({
  accountId: trimmed.to(
    type(/^[0-9a-f]{32}$/).configure({
      message: "Use the 32-character account ID from your Cloudflare dashboard.",
    })
  ),
  apiToken: trimmed.to(
    type(/^$|^[\w-]{20,200}$/).configure({ message: "Paste a Cloudflare API token." })
  ),
  fromAddress: trimmed.to(
    type("string.email").configure({ message: "Use an email address on your domain." })
  ),
})
export type Connect = typeof Connect.infer

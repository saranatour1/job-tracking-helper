import { type } from "arktype"

// Shared by the add form and the `applications:add` mutation. Kept free of
// convex/server imports so the frontend can import it without bundling them.
// "saved" is a job someone added to track before applying, often from a loop.
export const statuses = ["saved", "applied", "interviewing", "offer", "rejected"] as const
export type Status = (typeof statuses)[number]

const filled = type("string.trim").to("string > 0")

export const Application = type({
  company: filled,
  role: filled,
  status: type.enumerated(...statuses),
  // The posting, when the job came from a loop or a pasted link.
  "url?": "string",
})
export type Application = typeof Application.infer

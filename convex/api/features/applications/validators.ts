import { type } from "arktype"

// Shared by the add form and the `applications:add` mutation. Kept free of
// convex/server imports so the frontend can import it without bundling them.
export const statuses = ["applied", "interviewing", "offer", "rejected"] as const

const filled = type("string.trim").to("string > 0")

export const Application = type({
  company: filled,
  role: filled,
  status: type.enumerated(...statuses),
})
export type Application = typeof Application.infer

import { type } from "arktype"
import { v } from "convex/values"
import { arkId } from "../../lib/ark"

const trimmed = type("string.trim")
const upTo = (max: number, what: string) =>
  trimmed.to(
    type(`string <= ${max}` as "string <= 200").configure({
      message: `${what} can be up to ${max} characters.`,
    })
  )

// Safe to import from the frontend. An address is checked only when there is one.
export const SaveContact = type({
  "id?": arkId("contacts"),
  company: upTo(200, "A company"),
  name: upTo(200, "A name"),
  email: trimmed.to(
    type(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/).configure({ message: "That isn't an email address." })
  ),
  title: upTo(200, "A title"),
  phone: upTo(100, "A phone number"),
  notes: upTo(2000, "Notes"),
})

// What `details` holds once opened. Sealed like the mail it came from.
export const ContactDetails = type({
  company: "string",
  name: "string",
  email: "string",
  title: "string",
  phone: "string",
  notes: "string",
})
export type ContactDetails = typeof ContactDetails.infer

// Someone you've dealt with at a company. Mail teaches the app about them, and your edits win.
export const Contact = type({
  userId: arkId("users"),
  // A hash of the address, so a second email finds the row without the address being stored.
  key: "string",
  details: "string",
  // How many emails went between you. 0 for one you added yourself.
  count: "number",
  lastAt: "number",
  "applicationId?": arkId("applications"),
  // You changed it, so later mail only updates the count.
  "edited?": "boolean",
  // You removed it, so later mail from them doesn't bring it back.
  "hidden?": "boolean",
})

export const vContactRow = v.object({
  id: v.id("contacts"),
  company: v.string(),
  name: v.string(),
  email: v.string(),
  title: v.string(),
  phone: v.string(),
  notes: v.string(),
  count: v.number(),
  lastAt: v.number(),
  applicationId: v.optional(v.id("applications")),
})

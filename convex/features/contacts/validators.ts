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

export const ContactDetails = type({
  company: "string",
  name: "string",
  email: "string",
  title: "string",
  phone: "string",
  notes: "string",
})
export type ContactDetails = typeof ContactDetails.infer

export const Contact = type({
  userId: arkId("users"),
  key: "string",
  details: "string",
  count: "number",
  lastAt: "number",
  "applicationId?": arkId("applications"),
  "edited?": "boolean",
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

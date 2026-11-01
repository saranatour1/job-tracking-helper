import { v } from "convex/values"
import { vVerdict } from "../workflows/validators"
import { proofs } from "./domains"
import { type } from "arktype"
import { boardKinds } from "./boards"
import { arkId } from "../../lib/ark"
import { paginationOptsValidator } from "convex/server"

export const vFeedJob = v.object({
  url: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  remote: v.boolean(),
  postedAt: v.number(),
  text: v.string(),
})

export const vCompanyLink = v.union(v.literal("postings"), v.literal("name"))

export const vYc = v.object({
  batch: v.string(),
  status: v.string(),
  url: v.string(),
  teamSize: v.optional(v.number()),
})

export const vEvidence = v.object({
  boardId: v.union(v.id("jobBoards"), v.null()),
  domain: v.union(v.string(), v.null()),
  link: v.union(vCompanyLink, v.null()),
  yc: v.union(vYc, v.null()),
  registeredAt: v.union(v.number(), v.null()),
  // Roles open at this company. Null for a board of many companies, until the counts are filled.
  open: v.union(v.number(), v.null()),
  // A board of many companies, so all of its roles aren't this company's.
  pooled: v.boolean(),
})

export const vProof = v.union(...proofs.map((p) => v.literal(p)))

export const vCatalogSummary = v.object({
  domains: v.number(),
  own: v.number(),
  name: v.number(),
  unverified: v.number(),
  endings: v.array(v.object({ ending: v.string(), jobs: v.number() })),
})

export const vJobRow = v.object({
  _id: v.id("jobs"),
  url: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  remote: v.boolean(),
  postedAt: v.number(),
  preview: v.string(),
  fit: v.union(v.null(), v.number()),
  verdict: v.union(v.null(), vVerdict),
  evidence: vEvidence,
})

export const JobBoard = type({
  kind: type.enumerated(...boardKinds),
  slug: "string",
  company: "string",
  addedAt: "number",
  "fetchedAt?": "number",
  jobs: "number",
  "error?": "string",
  "companyId?": arkId("companies"),
  // How this board reached its company's site: its postings live there, or only its name matches.
  "companyLink?": "'postings' | 'name'",
  "researchedAt?": "number",
  // Its roles are in the catalog's counts, which from then on keep `jobs` exact.
  "counted?": "boolean",
})

export const Company = type({
  name: "string",
  "domain?": "string",
  "registeredAt?": "number",
  "yc?": { batch: "string", status: "string", url: "string", "teamSize?": "number" },
})

export const Job = type({
  boardId: arkId("jobBoards"),
  urlKey: "string",
  url: "string",
  title: "string",
  company: "string",
  location: "string",
  remote: "boolean",
  postedAt: "number",
  // No longer written or read: older rows still have it.
  "seenAt?": "number",
  text: "string",
})

export const vBoardFetchedArgs = {
  boardId: v.id("jobBoards"),
  jobs: v.number(),
  error: v.optional(v.string()),
  company: v.optional(v.string()),
}

export const vSaveResearchArgs = {
  boardId: v.id("jobBoards"),
  domain: v.optional(v.string()),
  link: v.optional(vCompanyLink),
  yc: v.optional(vYc),
  registeredAt: v.optional(v.number()),
  credits: v.number(),
  exhausted: v.boolean(),
}

export const vCandidatesArgs = {
  userId: v.id("users"),
  queries: v.array(v.string()),
  remoteOnly: v.boolean(),
  companies: v.array(v.string()),
  since: v.optional(v.number()),
  limit: v.number(),
}

export const vJobSearchArgs = {
  q: v.optional(v.string()),
  remoteOnly: v.optional(v.boolean()),
  boardId: v.optional(v.string()),
  since: v.optional(v.number()),
  fits: v.optional(v.boolean()),
  proof: v.optional(vProof),
  ending: v.optional(v.string()),
  paginationOpts: paginationOptsValidator,
}

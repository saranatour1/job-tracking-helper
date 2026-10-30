import { NonRetryableError } from "@convex-dev/workpool"
import type { Posting } from "../fit"

// What every source can do. A run only talks to sources through this, so adding a
// third one is a new file here and a line in the catalog.

export type Found = { postings: Posting[]; credits: number }

export type Source = {
  search: (
    apiKey: string,
    query: string,
    limit: number,
    postedToday: boolean,
    domains: string[]
  ) => Promise<Found>
}

// Thrown when a source says its credits are used up, so the run moves to the next one.
export class OutOfCredits extends Error {}

export const post = async (
  url: string,
  apiKey: string,
  body: object,
  outOfCredits: (status: number, json: unknown) => boolean
) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json: unknown = await res.json().catch(() => null)
  if (outOfCredits(res.status, json)) throw new OutOfCredits(`${url} is out of credits`)
  // A refused request (403, 404 and the like) won't change on a retry; rate limits and
  // server errors might.
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
    throw new NonRetryableError(`${url} answered ${res.status}`)
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return json
}

// Narrowing helpers for the JSON the sources send back.
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
export const text = (value: unknown) => (typeof value === "string" ? value : "")
export const count = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../_generated/api"
import schema from "../../schema"
import { maxEvents } from "./validators"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return t.withIdentity({ subject: userId })
}

const event = {
  key: "e1",
  title: "Call with Hooli",
  start: "2026-11-03T10:30:00+01:00",
  end: "2026-11-03T11:00:00+01:00",
  allDay: false,
}

describe("calendar events", () => {
  it("names an untitled event, and guesses its kind from the title", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, event)
    await as.mutation(api.api.calendar.save, { ...event, key: "e2", title: "   " })
    const saved = await as.query(api.api.calendar.list, {})
    expect(saved.map((e) => [e.title, e.kind])).toEqual([
      ["Call with Hooli", "interview"],
      ["Untitled", "reminder"],
    ])
  })

  it("refuses times it can't read, or that run backwards", async () => {
    const as = await setup()
    await expect(as.mutation(api.api.calendar.save, { ...event, start: "soon" })).rejects.toThrow(
      "isn't one the calendar can read"
    )
    await expect(
      as.mutation(api.api.calendar.save, { ...event, end: "2026-11-03T09:00:00+01:00" })
    ).rejects.toThrow("can't end before it starts")
    await expect(
      as.mutation(api.api.calendar.save, { ...event, allDay: true, start: "2026-11-03" })
    ).rejects.toThrow("isn't one the calendar can read")
  })

  it("cuts what runs long instead of refusing it", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, {
      ...event,
      title: "t".repeat(201),
      description: "d".repeat(2001),
      exdates: Array.from({ length: 201 }, (_, i) => `d${i}`),
      reminders: Array.from({ length: 11 }, () => ({ minutesBefore: 5 })),
    })
    const [saved] = await as.query(api.api.calendar.list, {})
    expect(saved?.title).toHaveLength(200)
    expect(saved?.description).toHaveLength(2000)
    expect(saved?.reminders).toHaveLength(10)
    // A long-running series keeps its newest exceptions.
    expect(saved?.exdates).toHaveLength(200)
    expect(saved?.exdates?.at(-1)).toBe("d200")
  })
})

describe("a date range", () => {
  const range = { from: "2026-11-01", to: "2027-01-01" }
  const at = (key: string, start: string, end = start) => ({
    key,
    title: "Reminder",
    start: `${start}T10:00:00+01:00`,
    end: `${end}T11:00:00+01:00`,
    allDay: false,
  })
  const keysIn = async (as: Pick<Awaited<ReturnType<typeof setup>>, "query">) =>
    (await as.query(api.api.calendar.list, range)).map((e) => e.key).sort()

  it("takes what overlaps it, and leaves what's wholly before or after", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, at("before", "2026-10-10"))
    await as.mutation(api.api.calendar.save, at("inside", "2026-11-10"))
    await as.mutation(api.api.calendar.save, at("across the start", "2026-10-30", "2026-11-02"))
    await as.mutation(api.api.calendar.save, at("across the end", "2026-12-31", "2027-01-02"))
    await as.mutation(api.api.calendar.save, at("after", "2027-01-05"))
    expect(await keysIn(as)).toEqual(["across the end", "across the start", "inside"])
    expect(await as.query(api.api.calendar.list, {})).toHaveLength(5)
  })

  it("takes a repeating event that started long before", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, {
      ...at("weekly", "2025-01-06"),
      rrule: "FREQ=WEEKLY",
    })
    expect(await keysIn(as)).toEqual(["weekly"])
  })

  it("takes a fix moved out of it, so the event it replaces stays replaced", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, {
      ...at("fix", "2027-06-01"),
      replaces: "m1:slot",
      kind: "interview",
    })
    await as.mutation(api.api.calendar.save, {
      ...at("removed", "2020-01-01"),
      replaces: "m2:slot",
      kind: "interview",
      hidden: true,
    })
    expect(await keysIn(as)).toEqual(["fix", "removed"])
  })

  it("has the same rows at the limit as without one, for what's in it", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const as = t.withIdentity({ subject: userId })
    await t.run(async (ctx) => {
      for (let n = 0; n < maxEvents; n++)
        await ctx.db.insert("calendarEvents", {
          ...at(`e${String(n).padStart(3, "0")}`, n % 2 ? "2026-11-10" : "2026-10-10"),
          userId,
          kind: "reminder",
        })
    })
    expect(await as.query(api.api.calendar.list, {})).toHaveLength(maxEvents)
    expect(await keysIn(as)).toHaveLength(maxEvents / 2)
  })

  it("is only yours", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, at("mine", "2026-11-10"))
    const other = await setup()
    expect(await keysIn(other)).toEqual([])
  })
})

describe("calendar settings", () => {
  it("round-trips, and replaces what was there", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.saveSettings, { timeZone: "Asia/Amman", weekStartsOn: 6 })
    await expect(as.query(api.api.calendar.settings, {})).resolves.toEqual({
      timeZone: "Asia/Amman",
      weekStartsOn: 6,
    })
    await as.mutation(api.api.calendar.saveSettings, { hour12: true })
    await expect(as.query(api.api.calendar.settings, {})).resolves.toEqual({ hour12: true })
  })

  it("refuses zones that don't exist and days that run backwards", async () => {
    const as = await setup()
    await expect(
      as.mutation(api.api.calendar.saveSettings, { timeZone: "Mars/Base" })
    ).rejects.toThrow("Mars/Base isn't a time zone.")
    await expect(
      as.mutation(api.api.calendar.saveSettings, { dayStartHour: 20, dayEndHour: 8 })
    ).rejects.toThrow("has to start before it ends")
  })
})

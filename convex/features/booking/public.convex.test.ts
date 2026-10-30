// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../_generated/api"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return { t, as: t.withIdentity({ subject: userId }) }
}

const page = {
  title: "Intro call",
  minutes: 30,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3],
  noticeHours: 24,
  horizonDays: 14,
  timeZone: "Asia/Amman",
  active: true,
}

describe("booking pages", () => {
  it("cuts a long title instead of refusing it", async () => {
    const { as } = await setup()
    await as.mutation(api.booking.savePage, { ...page, title: "t".repeat(81) })
    const [saved] = await as.query(api.booking.pages, {})
    expect(saved?.title).toHaveLength(80)
  })

  it("cleans up what it stores", async () => {
    const { as } = await setup()
    await as.mutation(api.booking.savePage, {
      ...page,
      title: "  Intro call ",
      days: [1, 1, 3, 9],
      location: "  ",
    })
    const [saved] = await as.query(api.booking.pages, {})
    expect(saved).toMatchObject({ title: "Intro call", days: [1, 3] })
    expect(saved?.location).toBeUndefined()
    expect(saved?.slug).toHaveLength(12)
  })

  it("says what's wrong with a page", async () => {
    const { as } = await setup()
    const save = (change: Partial<typeof page>) =>
      as.mutation(api.booking.savePage, { ...page, ...change })
    await expect(save({ title: " " })).rejects.toThrow("Give the page a title.")
    await expect(save({ minutes: 20 })).rejects.toThrow("Pick a length from the list.")
    await expect(save({ endHour: 25 })).rejects.toThrow("Hours run from 0 to 24.")
    await expect(save({ startHour: 16, endHour: 16 })).rejects.toThrow("fit at least one booking")
    await expect(save({ days: [9] })).rejects.toThrow("Pick at least one day.")
    await expect(save({ horizonDays: 91 })).rejects.toThrow("up to 90 days ahead")
    await expect(save({ timeZone: "Mars/Base" })).rejects.toThrow("That isn't a time zone.")
  })
})

describe("booking a time", () => {
  const guest = { slug: "nope", start: 0, name: "Pat", email: "pat@acme.com" }

  it("checks the guest's details before anything else", async () => {
    const { t } = await setup()
    await expect(t.mutation(api.booking.book, { ...guest, name: " " })).rejects.toThrow(
      "Add your name."
    )
    await expect(t.mutation(api.booking.book, { ...guest, email: "pat" })).rejects.toThrow(
      "That email doesn't look right."
    )
    await expect(t.mutation(api.booking.book, guest)).rejects.toThrow("isn't open")
  })
})

import { describe, expect, it } from "vite-plus/test"

import { boardAt, demoColumns } from "./demo-board"

const ticks = Array.from({ length: 200 }, (_, tick) => tick)

describe("the demo board", () => {
  it("never puts two cards in the same place", () => {
    for (const tick of ticks) {
      const places = boardAt(tick).cards.map((c) => `${c.column}/${c.row}`)
      expect(new Set(places).size).toBe(places.length)
    }
  })

  it("fills each column from the top with no gaps", () => {
    for (const tick of ticks) {
      const { cards } = boardAt(tick)
      demoColumns.forEach((_, column) => {
        const rows = cards.filter((c) => c.column === column).map((c) => c.row)
        expect(rows).toEqual(rows.map((_row, i) => i))
      })
    }
  })

  it("only moves a card forward, one column at a time", () => {
    for (const tick of ticks) {
      const next = boardAt(tick + 1).cards
      for (const card of boardAt(tick).cards) {
        const after = next.find((c) => c.id === card.id)
        if (!after) {
          expect(card.leaving).toBe(true)
          continue
        }
        expect(after.column - card.column).toBeGreaterThanOrEqual(0)
        expect(after.column - card.column).toBeLessThanOrEqual(1)
        expect(after.moving).toBe(after.column !== card.column)
      }
    }
  })

  it("adds one new card to Saved every tick", () => {
    for (const tick of ticks) {
      const { newest } = boardAt(tick)
      expect(newest).toMatchObject({ column: 0, row: 0, moving: false })
      expect(boardAt(tick + 1).newest.id).toBe(newest.id + 1)
    }
  })

  it("is busy from the first frame, with fewer cards further along", () => {
    const sizes = demoColumns.map(
      (_, column) => boardAt(0).cards.filter((c) => c.column === column).length
    )
    expect(sizes).toEqual([6, 6, 3, 1])
  })
})

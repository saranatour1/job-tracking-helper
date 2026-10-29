import type { Step } from "@convex/api/features/automations/validators"
import { describe, expect, it } from "vite-plus/test"

import { insert, layout, remove, splitAt, update } from "./tree"

const notify = (message: string) => ({ kind: "notify" as const, message })
const split = (...paths: string[][]): Step => ({
  kind: "parallel",
  paths: paths.map((p, i) => ({ label: `P${i}`, steps: p.map(notify) })),
})

describe("editing steps", () => {
  it("inserts at the top level and on a path", () => {
    const steps = [notify("a"), split(["b"], ["c"])]
    expect(insert(steps, { index: 1 }, notify("x"))[1]).toEqual(notify("x"))
    expect(insert(steps, { index: 1, split: 1, path: 0 }, notify("x"))[1]).toEqual(
      split(["b", "x"], ["c"])
    )
  })
  it("won't put a split inside a split", () => {
    const steps = [split(["b"], ["c"])]
    expect(insert(steps, { index: 0, split: 0, path: 0 }, split(["x"], ["y"]))).toBe(steps)
  })
  it("updates by place", () => {
    const steps = [notify("a"), split(["b"], ["c", "d"])]
    expect(update(steps, "0", notify("z"))[0]).toEqual(notify("z"))
    expect(update(steps, "1.1.1", notify("z"))[1]).toEqual(split(["b"], ["c", "z"]))
  })
  it("removes a step, an emptied path, and a split left with one path", () => {
    expect(remove([notify("a"), notify("b")], "0")).toEqual([notify("b")])
    expect(remove([split(["b"], ["c"], ["d"])], "0.0.0")[0]).toMatchObject({
      paths: [
        { label: "P1", steps: [notify("c")] },
        { label: "P2", steps: [notify("d")] },
      ],
    })
    expect(remove([notify("a"), split(["b"], ["c", "d"]), notify("e")], "1.0.0")).toEqual([
      notify("a"),
      notify("c"),
      notify("d"),
      notify("e"),
    ])
  })
  it("starts a split with two paths", () => {
    expect(splitAt([notify("a")], 1, notify("x"))[1]).toMatchObject({
      kind: "parallel",
      paths: [{ steps: [notify("x")] }, { steps: [notify("x")] }],
    })
  })
})

describe("layout", () => {
  it("puts cards top to bottom, ids by place, ending with a slot to append", () => {
    const { nodes, edges } = layout([notify("a"), notify("b")])
    expect(nodes.map((n) => [n.id, n.kind])).toEqual([
      ["trigger", "trigger"],
      ["0", "block"],
      ["1", "block"],
      ["end", "end"],
    ])
    expect(edges.map((e) => e.slot.index)).toEqual([0, 1, 2])
  })
  it("fans a split into side-by-side columns that join again", () => {
    const { nodes, edges } = layout([split(["b"], ["c", "d"]), notify("e")])
    const at = (id: string) => nodes.find((n) => n.id === id)!
    expect(at("0.0.0").x).toBeLessThan(0)
    expect(at("0.1.0").x).toBeGreaterThan(0)
    expect(at("0.join").y).toBeGreaterThan(at("0.1.1").y)
    expect(at("1").y).toBeGreaterThan(at("0.join").y)
    expect(edges.filter((e) => e.label).map((e) => e.label)).toEqual(["P0", "P1"])
    expect(edges.find((e) => e.to === "0.join" && e.from === "0.1.1")?.slot).toEqual({
      index: 2,
      split: 0,
      path: 1,
    })
  })
})

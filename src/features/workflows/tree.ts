import {
  type Block,
  type Branch,
  isBranch,
  type Step,
} from "@convex/api/features/automations/validators"

// Edits to a workflow's steps, and where each step sits on the canvas. Pure, so the
// builder only ever swaps one array for the next.

/** Where a new step goes: before `index` at the top, or on a branch's path. */
export type Slot = { index: number; split?: number; path?: number }

const onPath = (steps: Step[], split: number, path: number, edit: (blocks: Block[]) => Block[]) =>
  steps.map((s, i) =>
    i === split && isBranch(s)
      ? { ...s, paths: s.paths.map((p, j) => (j === path ? { ...p, steps: edit(p.steps) } : p)) }
      : s
  )

const insertAt = <T>(list: T[], index: number, item: T) => [
  ...list.slice(0, index),
  item,
  ...list.slice(index),
]

/** Adds a step at a slot. A branch only goes at the top level. */
export const insert = (steps: Step[], slot: Slot, step: Step): Step[] => {
  if (slot.split === undefined || slot.path === undefined) return insertAt(steps, slot.index, step)
  if (isBranch(step)) return steps
  return onPath(steps, slot.split, slot.path, (blocks) => insertAt(blocks, slot.index, step))
}

const parse = (at: string) => at.split(".").map(Number) as [number, number?, number?]

/** Replaces the step at a place ("2", or "2.1.0" on a path). */
export const update = (steps: Step[], at: string, step: Step): Step[] => {
  const [i, p, j] = parse(at)
  if (p === undefined) return steps.map((s, k) => (k === i ? step : s))
  if (isBranch(step)) return steps
  return onPath(steps, i, p, (blocks) => blocks.map((b, k) => (k === j ? step : b)))
}

/** Removes the step at a place. A path left empty goes too, and a split left with one path
 * becomes that path's steps. Ask Jev keeps its paths: an empty one means "do nothing". */
export const remove = (steps: Step[], at: string): Step[] => {
  const [i, p, j] = parse(at)
  if (p === undefined) return steps.filter((_, k) => k !== i)
  const split = steps[i]
  if (!isBranch(split)) return steps
  const paths = split.paths
    .map((path, k) => (k === p ? { ...path, steps: path.steps.filter((_, m) => m !== j) } : path))
    .filter((path) => split.kind === "decide" || path.steps.length > 0)
  if (paths.length > 1) return steps.map((s, k) => (k === i ? { ...split, paths } : s))
  return [...steps.slice(0, i), ...(paths[0]?.steps ?? []), ...steps.slice(i + 1)]
}

/** A new branch at a slot: a split whose two paths each start with `first`, or Ask Jev
 * with Yes going on to `first` and No doing nothing. */
export const branchAt = (
  steps: Step[],
  index: number,
  kind: Branch["kind"],
  first: Block
): Step[] =>
  insertAt(
    steps,
    index,
    kind === "parallel"
      ? {
          kind,
          paths: [
            { label: "Path 1", steps: [first] },
            { label: "Path 2", steps: [first] },
          ],
        }
      : {
          kind,
          question: "Is this worth following up on?",
          paths: [
            { label: "Yes", steps: [first] },
            { label: "No", steps: [] },
          ],
        }
  )

// Where things sit on the canvas, in px. Cards are centered on x.
export const sizes = { width: 240, height: 48, rowGap: 64, column: 272 } as const
const row = sizes.height + sizes.rowGap

export type CanvasNode = {
  id: string
  kind: "trigger" | "block" | "split" | "join" | "end"
  x: number
  y: number
}
export type CanvasEdge = {
  id: string
  from: string
  to: string
  slot: Slot
  // Shown on the first line of each path.
  label?: string
}

/** The canvas for some steps: card ids are the steps' places, so history can tint them. */
export const layout = (steps: Step[]) => {
  const nodes: CanvasNode[] = [{ id: "trigger", kind: "trigger", x: 0, y: 0 }]
  const edges: CanvasEdge[] = []
  let previous = "trigger"
  let y = row
  steps.forEach((step, i) => {
    const id = String(i)
    if (!isBranch(step)) {
      nodes.push({ id, kind: "block", x: 0, y })
      edges.push({ id: `${previous}-${id}`, from: previous, to: id, slot: { index: i } })
      previous = id
      y += row
      return
    }
    nodes.push({ id, kind: "split", x: 0, y })
    edges.push({ id: `${previous}-${id}`, from: previous, to: id, slot: { index: i } })
    const longest = Math.max(...step.paths.map((p) => p.steps.length))
    const join = `${i}.join`
    step.paths.forEach((path, p) => {
      const x = (p - (step.paths.length - 1) / 2) * sizes.column
      let from = id
      path.steps.forEach((_, j) => {
        const to = `${i}.${p}.${j}`
        nodes.push({ id: to, kind: "block", x, y: y + (j + 1) * row })
        edges.push({
          id: `${from}-${to}`,
          from,
          to,
          slot: { index: j, split: i, path: p },
          ...(j === 0 && { label: path.label }),
        })
        from = to
      })
      edges.push({
        id: `${from}-${join}`,
        from,
        to: join,
        slot: { index: path.steps.length, split: i, path: p },
        // An Ask Jev answer that does nothing still shows its name.
        ...(path.steps.length === 0 && { label: path.label }),
      })
    })
    y += (longest + 1) * row
    nodes.push({ id: join, kind: "join", x: 0, y })
    previous = join
    y += row / 2
  })
  nodes.push({ id: "end", kind: "end", x: 0, y })
  edges.push({ id: `${previous}-end`, from: previous, to: "end", slot: { index: steps.length } })
  return { nodes, edges }
}

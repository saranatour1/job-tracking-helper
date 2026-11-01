// `template` and `loop` only matter for a new workflow: what it starts as. A top-level
// step's place is a number in the address, so it reads ?step=2: the router quotes
// strings that look like numbers. The builder checks `template` and `draft` when it reads
// them, since what they're checked against is too big to load with every route.
export type WorkflowSearch = {
  step?: string | number
  tab?: "history"
  run?: string
  template?: string
  loop?: string
  draft?: unknown
}
export const workflowSearch = (search: Record<string, unknown>): WorkflowSearch => ({
  step:
    typeof search.step === "string" || typeof search.step === "number" ? search.step : undefined,
  tab: search.tab === "history" ? "history" : undefined,
  run: typeof search.run === "string" ? search.run : undefined,
  template: typeof search.template === "string" ? search.template : undefined,
  loop: typeof search.loop === "string" ? search.loop : undefined,
  draft: search.draft,
})

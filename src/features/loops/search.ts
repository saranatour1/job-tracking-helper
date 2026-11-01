import { templateById } from "@convex/features/loops/catalog"

const loopsTabs = ["loops", "runs", "sources"] as const
export type LoopsTab = (typeof loopsTabs)[number]

// Reads the route's search, dropping anything it doesn't know.
export const loopsSearch = (
  search: Record<string, unknown>
): {
  tab?: LoopsTab
  template?: string
  edit?: string
  job?: string
  list?: "saved"
} => ({
  tab: loopsTabs.find((t) => t === search.tab),
  template:
    typeof search.template === "string" && templateById(search.template)
      ? search.template
      : undefined,
  // The loop being edited, and the job sheet's lead, as text.
  edit: typeof search.edit === "string" && search.edit ? search.edit : undefined,
  job: typeof search.job === "string" && search.job ? search.job : undefined,
  list: search.list === "saved" ? "saved" : undefined,
})

const preferencesTabs = ["overview", "edit", "prefilled"] as const
export type PreferencesTab = (typeof preferencesTabs)[number]

// Reads `?tab=`, `?step=` and `?add=` (a question Activity wants on Prefilled) for the
// route, dropping anything that isn't one of them.
export const preferencesSearch = (
  search: Record<string, unknown>
): { tab?: PreferencesTab; step?: number; add?: string } => ({
  tab: preferencesTabs.find((t) => t === search.tab),
  step:
    typeof search.step === "number" && Number.isInteger(search.step) && search.step >= 0
      ? search.step
      : undefined,
  add: typeof search.add === "string" && search.add.trim() ? search.add.slice(0, 200) : undefined,
})

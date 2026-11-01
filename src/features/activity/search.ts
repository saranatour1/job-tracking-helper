export type Show = "failed" | "applications"

export const activitySearch = (search: Record<string, unknown>): { show?: Show } =>
  search.show === "failed" || search.show === "applications" ? { show: search.show } : {}

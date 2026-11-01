export const tabs = { unread: "Unread", read: "Read", all: "All" }
export type Tab = keyof typeof tabs
export const groupings = { none: "No grouping", status: "Application status", company: "Company" }
export type Grouping = keyof typeof groupings

// The tab, grouping and open line live in the URL, so a reload keeps your place.
export const inboxSearch = (
  search: Record<string, unknown>
): { tab?: Tab; group?: Grouping; id?: string } => ({
  tab: (Object.keys(tabs) as Tab[]).find((t) => t === search.tab),
  group: (Object.keys(groupings) as Grouping[]).find((g) => g === search.group),
  id: typeof search.id === "string" ? search.id : undefined,
})

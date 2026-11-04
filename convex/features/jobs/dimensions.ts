// What a role's free text says about its country, place and kind of job, for trends. Feeds write
// these however they like, so this is a best guess: what it can't place isn't counted there.

export const dimensions = ["country", "place", "title"] as const
export type Dimension = (typeof dimensions)[number]

export const weekMs = 7 * 24 * 60 * 60 * 1000
// The epoch was a Thursday, so this makes weeks start on Monday.
const monday = 4 * 24 * 60 * 60 * 1000

/** The Monday, 00:00 UTC, that starts the week `ms` falls in. */
export const weekOf = (ms: number) => Math.floor((ms - monday) / weekMs) * weekMs + monday

/** This week, so far, and the 12 before it. */
export const weeksShown = 13

export const comparedWeeks = 4
// Below this, a percentage says more about chance than about the market.
const fewestCompared = 5

// The first week counted as roles were posted. Weeks before it lack roles that closed before
// counting began, so comparing them to later weeks shows growth that may not be real.
const countedFrom = Date.UTC(2026, 10, 9)

/** From when both weeks compared by `changeOf` are whole. */
export const comparableFrom = countedFrom + comparedWeeks * 2 * weekMs

/** The last full weeks against those before them, given each week's roles, this week last. */
export const changeOf = (roles: number[]) => {
  const full = roles.slice(0, -1)
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
  const recent = sum(full.slice(-comparedWeeks))
  const before = sum(full.slice(-comparedWeeks * 2, -comparedWeeks))
  if (before < fewestCompared) return "—"
  const percent = Math.round(((recent - before) / before) * 100)
  return percent > 0 ? `↑ ${percent}%` : percent < 0 ? `↓ ${-percent}%` : "No change"
}

export const keyOf = (label: string) =>
  label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

const states =
  "Alabama AL,Alaska AK,Arizona AZ,Arkansas AR,California CA,Colorado CO,Connecticut CT,Delaware DE,District of Columbia DC,Florida FL,Georgia GA,Hawaii HI,Idaho ID,Illinois IL,Indiana IN,Iowa IA,Kansas KS,Kentucky KY,Louisiana LA,Maine ME,Maryland MD,Massachusetts MA,Michigan MI,Minnesota MN,Mississippi MS,Missouri MO,Montana MT,Nebraska NE,Nevada NV,New Hampshire NH,New Jersey NJ,New Mexico NM,New York NY,North Carolina NC,North Dakota ND,Ohio OH,Oklahoma OK,Oregon OR,Pennsylvania PA,Rhode Island RI,South Carolina SC,South Dakota SD,Tennessee TN,Texas TX,Utah UT,Vermont VT,Virginia VA,Washington WA,West Virginia WV,Wisconsin WI,Wyoming WY"
const provinces =
  "Alberta AB,British Columbia BC,Manitoba MB,New Brunswick NB,Newfoundland NL,Nova Scotia NS,Ontario ON,Quebec QC,Saskatchewan SK"

const regionsOf = (list: string, country: string) =>
  list.split(",").flatMap((region) => {
    const at = region.lastIndexOf(" ")
    return [
      [keyOf(region.slice(0, at)), country],
      // Only as codes after a place: "Paris, IN" is Indiana, but "IN" alone isn't.
      [`, ${keyOf(region.slice(at + 1))}`, country],
    ] as [string, string][]
  })

const us = "United States"
const uk = "United Kingdom"

const otherNames: Record<string, string> = {
  usa: us,
  us: us,
  "u.s.": us,
  "u.s.a.": us,
  america: us,
  uk,
  "u.k.": uk,
  "great britain": uk,
  england: uk,
  scotland: uk,
  wales: uk,
  uae: "United Arab Emirates",
  korea: "South Korea",
  "czech republic": "Czechia",
  turkey: "Türkiye",
  holland: "Netherlands",
  deutschland: "Germany",
  // Its long names read oddly.
  "hong kong": "Hong Kong",
  myanmar: "Myanmar",
  "bosnia and herzegovina": "Bosnia and Herzegovina",
  "trinidad and tobago": "Trinidad and Tobago",
}

// Feeds that name only the city. Each is a place even where it's also a state or a country.
// ponytail: only the cities seen most in the catalog. Add to it when "Unlisted" grows.
const cities: Record<string, string> = Object.fromEntries(
  (
    [
      [
        us,
        "San Francisco,San Francisco Bay Area,SF,New York,New York City,NYC,Seattle,Austin,Boston,Chicago,Los Angeles,Denver,Atlanta,Miami,Dallas,Palo Alto,Mountain View,San Jose,San Diego,Cleveland,Washington,Menlo Park,Bellevue,Pittsburgh,Philadelphia,Houston",
      ],
      [uk, "London,Manchester,Edinburgh,Cambridge"],
      ["Germany", "Berlin,Munich,München,Hamburg,Frankfurt,Cologne,Köln,Stuttgart,Düsseldorf"],
      ["France", "Paris,Lyon"],
      ["Netherlands", "Amsterdam,Rotterdam"],
      ["Ireland", "Dublin"],
      ["Spain", "Madrid,Barcelona"],
      ["Canada", "Toronto,Vancouver,Montreal"],
      ["Australia", "Sydney,Melbourne"],
      ["India", "Bengaluru,Bangalore,Hyderabad,Mumbai,Delhi,Gurugram,Pune"],
      ["Japan", "Tokyo"],
      ["Israel", "Tel Aviv"],
      ["South Korea", "Seoul"],
      ["Sweden", "Stockholm"],
      ["Singapore", "Singapore"],
      ["Hong Kong", "Hong Kong"],
    ] as const
  ).flatMap(([country, list]) => list.split(",").map((city) => [keyOf(city), country]))
)

let known: Map<string, string> | undefined

// Georgia the state first: far more roles are in Atlanta than in Tbilisi.
const countryNames = () => {
  if (known) return known
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" })
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
  const countries = letters
    .flatMap((a) => letters.map((b) => names.of(a + b)))
    .filter((name) => name && name !== "Unknown Region") as string[]
  known = new Map([
    ...countries.map((name) => [keyOf(name), name] as [string, string]),
    ...Object.entries(otherNames).map(
      ([name, country]) => [keyOf(name), country] as [string, string]
    ),
    ...regionsOf(states, us),
    ...regionsOf(provinces, "Canada"),
  ])
  return known
}

// One place in a location that may list several. " and " is left alone: "Trinidad and Tobago".
const partsOf = (location: string) =>
  location
    .split(/[;|•/\n]|\s[-–—]\s|\sor\s/i)
    .map((part) =>
      part
        .replace(/\([^)]*\)?|\)/g, " ")
        .replace(/^\s*US-(?=\w)|-HQ\b/g, "")
        .replace(/\bremote\b[\s:-]*/gi, " ")
        .replace(/\s(or|and)\s*$/i, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
    .filter((segments) => segments.length > 0)

const countryOfPart = (segments: string[]) => {
  const names = countryNames()
  for (let i = segments.length - 1; i >= 0; i--) {
    const key = keyOf(segments[i]!)
    const found = names.get(key) ?? (i > 0 ? names.get(`, ${key}`) : undefined) ?? cities[key]
    if (found) return found
  }
  return undefined
}

/** A location with "Belgium-Remote" written as "Belgium - Remote", which feeds do as often. */
export const spacedLocation = (location: string) =>
  location.replace(/(\p{L})[-–](remote|hybrid)\b/giu, "$1 - $2")

/** Every country a location names, or `fallback` if it names none. */
export const countriesOf = (location: string, fallback?: string) => {
  const found = new Set(partsOf(location).flatMap((part) => countryOfPart(part) ?? []))
  return found.size ? [...found] : fallback ? [fallback] : []
}

// Says how someone works or nothing at all, rather than where.
const notPlaces =
  /^(friendly|hybrid|distributed|in[- ]office|on[- ]?site|anywhere|global|worldwide|hub|flexible|home ?office|wfh|work from home|multiple locations?|various|tbd|emea|apac|latam|americas|europe|asia|north america)$/i

const samePlace: Record<string, string> = {
  nyc: "New York",
  sf: "San Francisco",
  "san francisco bay area": "San Francisco",
  "new york city": "New York",
  bangalore: "Bengaluru",
  münchen: "Munich",
  köln: "Cologne",
}

/** Every city or similar a location names, plus "Remote" for a remote role. */
export const placesOf = (location: string, remote: boolean) => {
  const names = countryNames()
  const places = partsOf(location).flatMap(([first]) => {
    const key = keyOf(first!)
    if (key in cities) return [samePlace[key] ?? first!]
    return notPlaces.test(key) || names.has(key) || !/\p{L}/u.test(key)
      ? []
      : [samePlace[key] ?? first!]
  })
  return [...new Map([...places, ...(remote ? ["Remote"] : [])].map((p) => [keyOf(p), p])).values()]
}

const seniority = /^(senior|sr\.?|junior|jr\.?|staff\+?|principal|mid[- ]level|entry[- ]level)\s+/i
const level = /\s+(i{1,3}|iv|l{2,3}|[1-5])$/i
const bareLead = /^(associate |assistant |vice )?(director|manager|head|vp|president)$/i

/** A title without its seniority, level or team, so "Sr. Software Engineer II, Payments" and
 * "Software Engineer" are one kind of job. Null if nothing's left. */
export const titleOf = (title: string) => {
  const [first = "", second] = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b[mwfd]\/[mwfd]\/[mwfd]\b/gi, " ")
    .split(/\s[-–—|]\s|[-–—]\s|,\s*|:\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  let job = first
  while (seniority.test(job)) job = job.replace(seniority, "")
  job = job.replace(level, "").slice(0, 80).trim()
  // "Director, Product Finance" says nothing without the second part.
  if (second && bareLead.test(job)) job = `${job}, ${second}`.slice(0, 80)
  return job || null
}

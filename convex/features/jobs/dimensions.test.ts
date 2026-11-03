import { describe, expect, it } from "vite-plus/test"

import {
  changeOf,
  comparableFrom,
  countriesOf,
  keyOf,
  placesOf,
  titleOf,
  weekOf,
} from "./dimensions"

describe("weekOf", () => {
  it("starts weeks on Monday, in UTC", () => {
    const monday = Date.UTC(2026, 10, 2)
    expect(weekOf(monday)).toBe(monday)
    expect(weekOf(Date.UTC(2026, 10, 8, 23, 59))).toBe(monday)
    expect(weekOf(Date.UTC(2026, 10, 1, 23, 59))).toBe(Date.UTC(2026, 9, 26))
  })
})

describe("changeOf", () => {
  const weeks = (before: number, recent: number) => [
    ...Array<number>(4).fill(before),
    ...Array<number>(4).fill(recent),
    999,
  ]

  it("compares full weeks, leaving this week out", () => {
    expect(changeOf(weeks(10, 15))).toBe("↑ 50%")
    expect(changeOf(weeks(10, 5))).toBe("↓ 50%")
    expect(changeOf(weeks(10, 10))).toBe("No change")
  })

  it("won't compare against too few roles", () => {
    expect(changeOf(weeks(1, 40))).toBe("—")
  })

  it("waits for two whole stretches of weeks", () => {
    expect(new Date(comparableFrom).toISOString().slice(0, 10)).toBe("2027-01-04")
    expect(weekOf(comparableFrom)).toBe(comparableFrom)
  })
})

describe("countriesOf", () => {
  it.each([
    ["Manila, Philippines", ["Philippines"]],
    ["Bucharest, 11-15 TIPOGRAFILOR S, Romania", ["Romania"]],
    ["Medellin, COLOMBIA, Colombia", ["Colombia"]],
    ["Dubai, UAE, United Arab Emirates", ["United Arab Emirates"]],
    ["Remote - USA", ["United States"]],
    ["US - Remote", ["United States"]],
    ["Remote Canada", ["Canada"]],
    ["New York, NY (HQ)", ["United States"]],
    ["San Jose, California", ["United States"]],
    ["Atlanta, Georgia", ["United States"]],
    ["Toronto, ON", ["Canada"]],
    ["San Francisco", ["United States"]],
    ["Hub - San Francisco", ["United States"]],
    ["Singapore", ["Singapore"]],
    ["Remote, Canada; Remote, United States", ["Canada", "United States"]],
    ["San Francisco, CA • New York, NY • United States", ["United States"]],
  ])("%s", (location, countries) => {
    expect(countriesOf(location)).toEqual(countries)
  })

  it("doesn't read a lone state code as a place", () => {
    expect(countriesOf("IN")).toEqual([])
  })

  it("leaves what names no country out", () => {
    for (const location of ["Remote", "Hybrid", "Distributed", "East Academy", ""])
      expect(countriesOf(location), location).toEqual([])
  })

  it("uses the fallback only for what it can't place", () => {
    expect(countriesOf("Bremen", "Germany")).toEqual(["Germany"])
    expect(countriesOf("Paris, France", "Germany")).toEqual(["France"])
  })
})

describe("placesOf", () => {
  it("names the same place the same way", () => {
    for (const location of ["New York, NY (HQ)", "New York City, NY", "NYC"])
      expect(placesOf(location, false), location).toEqual(["New York"])
    expect(placesOf("Bangalore, India", false)).toEqual(["Bengaluru"])
  })

  it("reads one board's codes and broken brackets", () => {
    for (const location of ["US-SF-HQ", "US-San Francisco", "SF", "San Francisco (HQ"])
      expect(placesOf(location, false), location).toEqual(["San Francisco"])
    expect(countriesOf("US-Chicago")).toEqual(["United States"])
    expect(placesOf("Germany (Berlin", false)).toEqual([])
  })

  it("reads either of two places", () => {
    expect(placesOf("San Francisco Bay Area or Remote", true)).toEqual(["San Francisco", "Remote"])
    expect(placesOf("Boston or Los Angeles", false)).toEqual(["Boston", "Los Angeles"])
  })

  it("lists each place once, and remote roles as Remote", () => {
    expect(placesOf("San Francisco, CA | New York City, NY", false)).toEqual([
      "San Francisco",
      "New York",
    ])
    expect(placesOf("San Francisco | San Francisco, CA", true)).toEqual(["San Francisco", "Remote"])
  })

  it("skips what isn't a place", () => {
    for (const location of ["Hybrid", "United States", "Remote - USA", "Remote Friendly", "-", ""])
      expect(placesOf(location, false), location).toEqual([])
    expect(placesOf("Remote", true)).toEqual(["Remote"])
  })
})

describe("titleOf", () => {
  it.each([
    ["Senior Software Engineer - Control Plane (Hosted Foundations) ", "Software Engineer"],
    ["Sr. Software Engineer II, Payments", "Software Engineer"],
    ["Software Engineer, Payments", "Software Engineer"],
    ["Account Executive- Startups", "Account Executive"],
    ["Full-Stack Engineer", "Full-Stack Engineer"],
    ["Staff Senior Data Scientist", "Data Scientist"],
    ["Staff+ Software Engineer", "Software Engineer"],
    ["Customer Support Specialist ll", "Customer Support Specialist"],
    ["Elektriker (m/w/d)", "Elektriker"],
    ["Mechanical Technical Director: Data Centres ", "Mechanical Technical Director"],
    ["1:1 Instructional Aide ", "1:1 Instructional Aide"],
    ["Title 1 Teacher", "Title 1 Teacher"],
    ["Director, Product Finance (Devices)", "Director, Product Finance"],
    ["Manager, Machine Learning Engineering, Checkout", "Manager, Machine Learning Engineering"],
    ["Director of Product Management, Observability", "Director of Product Management"],
  ])("%s", (title, job) => {
    expect(titleOf(title)).toBe(job)
  })

  it("is null with nothing left", () => {
    expect(titleOf(" (m/w/d) ")).toBeNull()
    expect(titleOf("")).toBeNull()
  })
})

describe("keyOf", () => {
  it("ignores case, accents and spacing", () => {
    expect(keyOf(" Düsseldorf  Mitte ")).toBe("dusseldorf mitte")
  })
})

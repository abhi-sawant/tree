import { describe, expect, it } from "vitest"

import {
  DEFAULT_PEOPLE_SORT,
  nextSort,
  sortPeople,
} from "~/lib/people/people-sort"
import type { Person } from "~/lib/types"

function person(id: string, given: string, year?: number): Person {
  return {
    id,
    givenName: given,
    familyName: "Sawant",
    birth: year === undefined ? undefined : { year },
    createdAt: 0,
    updatedAt: 0,
  }
}

const anil = person("anil", "Anil", 1915)
const meera = person("meera", "Meera", 1946)
const rohan = person("rohan", "Rohan", 1949)
const undated = person("zara", "Zara")

const generations = new Map([
  ["anil", 1],
  ["meera", 2],
  ["rohan", 2],
])

describe("sortPeople", () => {
  it("sorts by birth date, oldest first", () => {
    const sorted = sortPeople(
      [rohan, anil, meera],
      { key: "birth", direction: "asc" },
      generations
    )
    expect(sorted.map((p) => p.id)).toEqual(["anil", "meera", "rohan"])
  })

  it("sorts by display name", () => {
    const sorted = sortPeople(
      [rohan, anil, meera],
      { key: "name", direction: "asc" },
      generations
    )
    expect(sorted.map((p) => p.id)).toEqual(["anil", "meera", "rohan"])
  })

  it("breaks a generation tie by name, so the order is total", () => {
    // Without a tiebreak these two swap on every render, which reads as the
    // list flickering.
    const sorted = sortPeople(
      [rohan, meera],
      { key: "generation", direction: "asc" },
      generations
    )
    expect(sorted.map((p) => p.id)).toEqual(["meera", "rohan"])
  })

  it("puts someone with no generation after everyone placed", () => {
    const sorted = sortPeople(
      [undated, anil],
      { key: "generation", direction: "asc" },
      generations
    )
    expect(sorted.map((p) => p.id)).toEqual(["anil", "zara"])
  })

  it("reverses for a descending sort", () => {
    const sorted = sortPeople(
      [anil, meera, rohan],
      { key: "birth", direction: "desc" },
      generations
    )
    expect(sorted.map((p) => p.id)).toEqual(["rohan", "meera", "anil"])
  })

  it("does not mutate its input", () => {
    const input = [rohan, anil]
    sortPeople(input, { key: "name", direction: "asc" }, generations)
    expect(input.map((p) => p.id)).toEqual(["rohan", "anil"])
  })
})

describe("nextSort", () => {
  it("starts a new column ascending", () => {
    expect(nextSort({ key: "birth", direction: "asc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    })
  })

  it("flips the direction of the column already sorted", () => {
    expect(nextSort({ key: "name", direction: "asc" }, "name")).toEqual({
      key: "name",
      direction: "desc",
    })
  })

  it("returns to the default rather than to no sort at all", () => {
    // "Unsorted" would show insertion order, which means nothing to a reader.
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toEqual(
      DEFAULT_PEOPLE_SORT
    )
  })
})

import { comparePartialDate } from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import type { Person } from "~/lib/types"

export type PeopleSortKey = "name" | "birth" | "generation"
export type SortDirection = "asc" | "desc"

export interface PeopleSort {
  key: PeopleSortKey
  direction: SortDirection
}

export const PEOPLE_SORTS: Array<{ key: PeopleSortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "birth", label: "Born" },
  { key: "generation", label: "Generation" },
]

// The list opened on birth date and nothing else for as long as it existed,
// which is the right default — a family list reads as a chronology — but it
// left no way to find somebody by name in a pool of hundreds.
export const DEFAULT_PEOPLE_SORT: PeopleSort = {
  key: "birth",
  direction: "asc",
}

// Cycles a column: ascending on first press, then descending, and a third
// press returns to the default rather than to nothing. A tri-state where the
// third state is "unsorted" leaves the reader looking at insertion order,
// which means nothing to them.
export function nextSort(current: PeopleSort, key: PeopleSortKey): PeopleSort {
  if (current.key !== key) return { key, direction: "asc" }
  if (current.direction === "asc") return { key, direction: "desc" }
  return DEFAULT_PEOPLE_SORT
}

// Sorts a copy. Ties fall back to the display name so the order is total:
// without it, two people in the same generation swap places on every
// re-render, which reads as the list flickering.
//
// Dates go through comparePartialDate, which is documented (D19) as existing
// only for sort order — collapsing a bare year to 1 January is exactly right
// here and would be wrong in a validator.
export function sortPeople(
  people: Person[],
  sort: PeopleSort,
  generations: Map<string, number>
): Person[] {
  const byName = (a: Person, b: Person) =>
    personDisplayName(a).localeCompare(personDisplayName(b))

  const compare = (a: Person, b: Person): number => {
    switch (sort.key) {
      case "name":
        return byName(a, b)
      case "birth":
        return comparePartialDate(a.birth, b.birth) || byName(a, b)
      case "generation": {
        // Somebody with no generation belongs to no tree, so they sort after
        // everyone placed rather than at generation zero.
        const left = generations.get(a.id) ?? Number.POSITIVE_INFINITY
        const right = generations.get(b.id) ?? Number.POSITIVE_INFINITY
        return left - right || byName(a, b)
      }
    }
  }

  const sorted = [...people].sort(compare)
  return sort.direction === "desc" ? sorted.reverse() : sorted
}

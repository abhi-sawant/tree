import { computeGenerations } from "~/lib/graph/compute-generations"
import { personDisplayName } from "~/lib/person-name"
import type { PartialDate, Person, Relationship, Sex } from "~/lib/types"

export interface NamedValue {
  personIds: string[]
  label: string
  value: number
}

export interface GenerationCount {
  generation: number
  count: number
}

export interface SurnameCount {
  surname: string
  count: number
}

export interface Statistics {
  peopleCount: number
  placeholderCount: number
  generations: GenerationCount[]
  sexCounts: Record<Sex | "unrecorded", number>
  // Only people with both a birth and a death year contribute, so this is a
  // sample of the pool, not all of it — `lifespanSampleSize` says how big.
  averageLifespan?: number
  lifespanSampleSize: number
  longestLife?: NamedValue
  earliestBirthYear?: number
  latestBirthYear?: number
  withBirthYear: number
  mostChildren?: NamedValue
  largestSiblingGroup?: NamedValue
  longestMarriage?: NamedValue
  surnames: SurnameCount[]
}

function year(date?: PartialDate): number | undefined {
  return date?.year
}

// Whole years between two recorded years. Deliberately coarse: an aggregate is
// an estimate by nature, and unlike a validator finding it is not making a claim
// about any one person that could be wrong in a damaging way. Anyone missing
// either year is left out of the sample rather than guessed at.
function yearsBetween(
  from?: PartialDate,
  to?: PartialDate
): number | undefined {
  const a = year(from)
  const b = year(to)
  if (a === undefined || b === undefined) return undefined
  return b - a
}

// Scoped to the people handed in — the caller decides whether that is one tree
// or the whole pool. The active tree is the useful default: "the average
// lifespan in my family" means the family on screen, and the pool can hold
// several unrelated ones. (This is the opposite call from the validator, where
// "belongs to no tree" is only meaningful pool-wide.)
export function computeStatistics(
  people: Person[],
  relationships: Relationship[]
): Statistics {
  const ids = new Set(people.map((person) => person.id))
  const scoped = relationships.filter((r) => ids.has(r.from) && ids.has(r.to))
  const byId = new Map(people.map((person) => [person.id, person]))
  const name = (id: string) => {
    const person = byId.get(id)
    return person ? personDisplayName(person) : "Unknown"
  }

  const generationOf = computeGenerations(people, scoped)
  const perGeneration = new Map<number, number>()
  for (const person of people) {
    const generation = generationOf.get(person.id) ?? 0
    perGeneration.set(generation, (perGeneration.get(generation) ?? 0) + 1)
  }

  const sexCounts: Statistics["sexCounts"] = {
    female: 0,
    male: 0,
    other: 0,
    unrecorded: 0,
  }
  for (const person of people) sexCounts[person.sex ?? "unrecorded"]++

  const lifespans: Array<{ personId: string; years: number }> = []
  const birthYears: number[] = []
  for (const person of people) {
    const birthYear = year(person.birth)
    if (birthYear !== undefined) birthYears.push(birthYear)
    const years = yearsBetween(person.birth, person.death)
    // A negative span is contradictory data — the Health view reports it; here
    // it would just poison the average, so it is excluded.
    if (years !== undefined && years >= 0) {
      lifespans.push({ personId: person.id, years })
    }
  }

  const longest = lifespans.reduce<
    { personId: string; years: number } | undefined
  >(
    (best, entry) => (!best || entry.years > best.years ? entry : best),
    undefined
  )

  const childCounts = new Map<string, number>()
  const parentsOfChild = new Map<string, string[]>()
  for (const r of scoped) {
    if (r.type !== "parent-child") continue
    childCounts.set(r.from, (childCounts.get(r.from) ?? 0) + 1)
    const parents = parentsOfChild.get(r.to) ?? []
    parents.push(r.from)
    parentsOfChild.set(r.to, parents)
  }

  const mostChildren = pickMax(childCounts, (id, count) => ({
    personIds: [id],
    label: name(id),
    value: count,
  }))

  // Siblings are grouped by their full set of recorded parents, so half-siblings
  // through a different second parent count as their own group rather than being
  // folded in with the full siblings.
  const siblingGroups = new Map<string, string[]>()
  for (const [childId, parents] of parentsOfChild) {
    const key = [...parents].sort().join("|")
    const group = siblingGroups.get(key) ?? []
    group.push(childId)
    siblingGroups.set(key, group)
  }
  let largestSiblingGroup: NamedValue | undefined
  for (const [key, group] of siblingGroups) {
    if (group.length < 2) continue
    if (largestSiblingGroup && group.length <= largestSiblingGroup.value)
      continue
    largestSiblingGroup = {
      personIds: [...group].sort(),
      label: key.split("|").map(name).join(" & "),
      value: group.length,
    }
  }

  let longestMarriage: NamedValue | undefined
  for (const r of scoped) {
    if (r.type !== "spouse" || !r.start) continue
    // A marriage with no end date ended when the first spouse died, if that is
    // recorded. Without either, its length is unknown and it is skipped rather
    // than treated as running to the present — most of these people are dead.
    const endpoint =
      r.end ?? earlierDate(byId.get(r.from)?.death, byId.get(r.to)?.death)
    const years = yearsBetween(r.start, endpoint)
    if (years === undefined || years < 0) continue
    if (longestMarriage && years <= longestMarriage.value) continue
    longestMarriage = {
      personIds: [r.from, r.to],
      label: `${name(r.from)} & ${name(r.to)}`,
      value: years,
    }
  }

  const surnameCounts = new Map<string, number>()
  for (const person of people) {
    const surname = person.familyName?.trim()
    if (!surname) continue
    surnameCounts.set(surname, (surnameCounts.get(surname) ?? 0) + 1)
  }

  return {
    peopleCount: people.length,
    placeholderCount: people.filter((person) => person.isPlaceholder).length,
    generations: [...perGeneration.entries()]
      .map(([generation, count]) => ({ generation, count }))
      .sort((a, b) => a.generation - b.generation),
    sexCounts,
    averageLifespan:
      lifespans.length > 0
        ? lifespans.reduce((sum, entry) => sum + entry.years, 0) /
          lifespans.length
        : undefined,
    lifespanSampleSize: lifespans.length,
    longestLife: longest && {
      personIds: [longest.personId],
      label: name(longest.personId),
      value: longest.years,
    },
    earliestBirthYear: birthYears.length ? Math.min(...birthYears) : undefined,
    latestBirthYear: birthYears.length ? Math.max(...birthYears) : undefined,
    withBirthYear: birthYears.length,
    mostChildren,
    largestSiblingGroup,
    longestMarriage,
    surnames: [...surnameCounts.entries()]
      .map(([surname, count]) => ({ surname, count }))
      .sort((a, b) => b.count - a.count || a.surname.localeCompare(b.surname)),
  }
}

function earlierDate(
  a?: PartialDate,
  b?: PartialDate
): PartialDate | undefined {
  const yearA = year(a)
  const yearB = year(b)
  if (yearA === undefined) return b
  if (yearB === undefined) return a
  return yearA <= yearB ? a : b
}

// Ties break on the lower id so repeated runs on the same data agree.
function pickMax(
  counts: Map<string, number>,
  build: (id: string, count: number) => NamedValue
): NamedValue | undefined {
  let bestId: string | undefined
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount || (count === bestCount && bestId && id < bestId)) {
      bestId = id
      bestCount = count
    }
  }
  return bestId ? build(bestId, bestCount) : undefined
}

import { personDisplayName } from "~/lib/person-name"
import type { Person, Relationship } from "~/lib/types"

export interface DuplicateCandidate {
  personIds: [string, string]
  labels: [string, string]
  // 0..1. Only a ranking aid — nothing is ever merged on it automatically.
  score: number
  reasons: string[]
}

export interface FindDuplicatesOptions {
  // Pairs below this are not worth a user's attention. Tuned so a shared
  // surname alone never surfaces: in a family tree half the pool shares one.
  minScore?: number
  limit?: number
}

const DEFAULT_MIN_SCORE = 0.6
const DEFAULT_LIMIT = 50

// Beyond this many years apart, two records are not the same person, whatever
// their names. Two rather than zero because a birth year is often off by one in
// old records, and approximate years are common.
// Exported for the same reason PHOTO_MAX_EDGE is: the help page describes this
// rule in words, and the test beside the help content pins the words to it.
export const BIRTH_YEAR_TOLERANCE = 2

function normalize(value: string | undefined): string {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// Plain Levenshtein. Names are short, the pool is a few hundred people at most
// (SPEC §1), and a dependency for this would cost more than it saves.
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length]
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const longest = Math.max(a.length, b.length)
  return longest === 0 ? 0 : 1 - editDistance(a, b) / longest
}

// The best match across every surname each person is recorded under, so a woman
// entered under her married name in one record and her maiden name in the other
// still matches. This is the main thing Phase 1's maidenName buys here.
function surnameSimilarity(a: Person, b: Person): number {
  const surnamesA = [a.familyName, a.maidenName].map(normalize).filter(Boolean)
  const surnamesB = [b.familyName, b.maidenName].map(normalize).filter(Boolean)
  if (surnamesA.length === 0 || surnamesB.length === 0) return 0

  let best = 0
  for (const left of surnamesA) {
    for (const right of surnamesB) {
      best = Math.max(best, similarity(left, right))
    }
  }
  return best
}

function givenSimilarity(a: Person, b: Person): number {
  const namesA = [a.givenName, a.nickname].map(normalize).filter(Boolean)
  const namesB = [b.givenName, b.nickname].map(normalize).filter(Boolean)
  let best = 0
  for (const left of namesA) {
    for (const right of namesB) {
      best = Math.max(best, similarity(left, right))
    }
  }
  return best
}

interface Neighbours {
  parents: Set<string>
  children: Set<string>
  spouses: Set<string>
  // Everyone directly linked, in either direction and of either type.
  linked: Set<string>
}

function buildNeighbours(
  people: Person[],
  relationships: Relationship[]
): Map<string, Neighbours> {
  const map = new Map<string, Neighbours>()
  const of = (id: string): Neighbours => {
    let entry = map.get(id)
    if (!entry) {
      entry = {
        parents: new Set(),
        children: new Set(),
        spouses: new Set(),
        linked: new Set(),
      }
      map.set(id, entry)
    }
    return entry
  }
  for (const person of people) of(person.id)

  for (const r of relationships) {
    if (r.type === "parent-child") {
      of(r.to).parents.add(r.from)
      of(r.from).children.add(r.to)
    } else {
      of(r.from).spouses.add(r.to)
      of(r.to).spouses.add(r.from)
    }
    of(r.from).linked.add(r.to)
    of(r.to).linked.add(r.from)
  }
  return map
}

function shared(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const id of a) if (b.has(id)) count++
  return count
}

// Ranks pairs that might be the same person recorded twice.
//
// Heuristic and advisory: there is no stable external identity to match on, so
// this proposes and a human decides. Nothing here merges anything — a wrong
// merge silently fuses two people's lives into one and cannot be undone from
// the data alone.
export function findDuplicates(
  people: Person[],
  relationships: Relationship[],
  {
    minScore = DEFAULT_MIN_SCORE,
    limit = DEFAULT_LIMIT,
  }: FindDuplicatesOptions = {}
): DuplicateCandidate[] {
  const neighbours = buildNeighbours(people, relationships)
  const candidates: DuplicateCandidate[] = []

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const candidate = score(people[i], people[j], neighbours)
      if (candidate && candidate.score >= minScore) candidates.push(candidate)
    }
  }

  return candidates
    .sort(
      (x, y) =>
        y.score - x.score ||
        x.personIds[0].localeCompare(y.personIds[0]) ||
        x.personIds[1].localeCompare(y.personIds[1])
    )
    .slice(0, limit)
}

function score(
  a: Person,
  b: Person,
  neighbours: Map<string, Neighbours>
): DuplicateCandidate | undefined {
  const nearA = neighbours.get(a.id)
  const nearB = neighbours.get(b.id)

  // Already related to each other, so they are two different people by the
  // user's own record. This matters more than it sounds: a father and son with
  // the same name score near-perfectly on every name signal, and are the single
  // commonest false positive in genealogy data.
  if (nearA?.linked.has(b.id)) return undefined

  // Both sexes recorded and different: not the same person.
  if (a.sex && b.sex && a.sex !== b.sex) return undefined

  const birthA = a.birth?.year
  const birthB = b.birth?.year
  if (
    birthA !== undefined &&
    birthB !== undefined &&
    Math.abs(birthA - birthB) > BIRTH_YEAR_TOLERANCE
  ) {
    return undefined
  }

  const given = givenSimilarity(a, b)
  const surname = surnameSimilarity(a, b)
  const reasons: string[] = []

  // A given name is the load-bearing signal, so a weak one disqualifies before
  // corroboration can prop the pair up.
  if (given < 0.7) return undefined
  reasons.push(
    given === 1 ? "Same given name" : "Given names are nearly the same"
  )

  let total = given * 0.45

  if (surname >= 0.85) {
    total += 0.2
    const viaMaiden =
      normalize(a.familyName) !== normalize(b.familyName) &&
      (!!a.maidenName || !!b.maidenName)
    reasons.push(
      viaMaiden ? "Surname matches a recorded maiden name" : "Same surname"
    )
  }

  if (birthA !== undefined && birthB !== undefined) {
    if (birthA === birthB) {
      total += 0.25
      reasons.push(`Both born ${birthA}`)
    } else {
      total += 0.12
      reasons.push(`Birth years within ${Math.abs(birthA - birthB)} year(s)`)
    }
  }

  const sharedParents = shared(
    nearA?.parents ?? new Set(),
    nearB?.parents ?? new Set()
  )
  const sharedChildren = shared(
    nearA?.children ?? new Set(),
    nearB?.children ?? new Set()
  )
  const sharedSpouses = shared(
    nearA?.spouses ?? new Set(),
    nearB?.spouses ?? new Set()
  )

  // Corroboration, and the strongest evidence available: two records sharing a
  // spouse or a child are very unlikely to be different people who happen to
  // share a name.
  if (sharedSpouses > 0) {
    total += 0.2
    reasons.push("Share a spouse")
  }
  if (sharedChildren > 0) {
    total += 0.2
    reasons.push(
      sharedChildren === 1
        ? "Share a child"
        : `Share ${sharedChildren} children`
    )
  }
  if (sharedParents > 0) {
    total += 0.15
    reasons.push("Share a parent")
  }

  // A placeholder exists precisely to be replaced by the real record, so it is
  // worth surfacing at a lower bar than two full records would be.
  if (a.isPlaceholder !== b.isPlaceholder) {
    total += 0.1
    reasons.push("One of the two is a placeholder")
  }

  return {
    personIds: [a.id, b.id],
    labels: [personDisplayName(a), personDisplayName(b)],
    score: Math.min(1, total),
    reasons,
  }
}

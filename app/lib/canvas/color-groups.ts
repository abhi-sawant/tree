import { computeGenerations } from "~/lib/graph/compute-generations"
import type { Person, Relationship } from "~/lib/types"

export type ColorBy = "generation" | "surname" | "branch"

export const COLOR_BY_OPTIONS: Array<{ value: ColorBy; label: string }> = [
  { value: "generation", label: "Generation" },
  { value: "surname", label: "Surname" },
  { value: "branch", label: "Branch of the family" },
]

export interface ColorGroupInput {
  people: Person[]
  relationships: Relationship[]
  mode: ColorBy
  // Needed only by "branch": the person whose children define the branches.
  rootPersonId?: string
}

function normalizeSurname(person: Person): string {
  return (person.familyName ?? "").trim().toLowerCase()
}

// Ranked by how many people share the surname, then alphabetically — the same
// ordering the Insights view uses, so the two agree about which surname is the
// family's main one. People with no surname recorded share the last group rather
// than each getting their own colour.
function surnameIndices(people: Person[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const person of people) {
    const surname = normalizeSurname(person)
    if (!surname) continue
    counts.set(surname, (counts.get(surname) ?? 0) + 1)
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([surname]) => surname)
  const rankOf = new Map(ranked.map((surname, index) => [surname, index]))
  const unnamedIndex = ranked.length

  return new Map(
    people.map((person) => {
      const surname = normalizeSurname(person)
      return [person.id, surname ? rankOf.get(surname)! : unnamedIndex]
    })
  )
}

// "Which branch of the family is this person from" means, concretely, which of
// the root person's children they descend from. That is well defined and is what
// people actually mean, unlike "their root ancestor" — with two parents each
// person has two lineages, so any single answer there would be an arbitrary pick
// dressed up as meaning.
//
// The root themselves, their ancestors, and anyone unconnected share a final
// group: they belong to no one branch.
function branchIndices(
  people: Person[],
  relationships: Relationship[],
  rootPersonId: string | undefined
): Map<string, number> {
  const indices = new Map<string, number>()
  if (!rootPersonId) {
    for (const person of people) indices.set(person.id, 0)
    return indices
  }

  const childrenOf = new Map<string, string[]>()
  for (const r of relationships) {
    if (r.type !== "parent-child") continue
    const list = childrenOf.get(r.from) ?? []
    list.push(r.to)
    childrenOf.set(r.from, list)
  }

  const byId = new Map(people.map((person) => [person.id, person]))
  const compare = (a: string, b: string) => {
    const createdA = byId.get(a)?.createdAt ?? 0
    const createdB = byId.get(b)?.createdAt ?? 0
    return createdA !== createdB ? createdA - createdB : a.localeCompare(b)
  }

  const heads = [...(childrenOf.get(rootPersonId) ?? [])].sort(compare)
  const unassignedIndex = heads.length

  // Breadth-first from each head in turn, first assignment winning. A person
  // reachable from two heads (a cousin marriage) lands in the earlier branch,
  // which at least makes the colouring stable across recomputes.
  heads.forEach((head, index) => {
    let frontier = [head]
    while (frontier.length > 0) {
      const next: string[] = []
      for (const id of frontier) {
        if (indices.has(id)) continue
        indices.set(id, index)
        next.push(...(childrenOf.get(id) ?? []))
      }
      frontier = next
    }
  })

  for (const person of people) {
    if (!indices.has(person.id)) indices.set(person.id, unassignedIndex)
  }
  return indices
}

// Maps every person to a palette index. Wrapping past the palette's length is
// resolveGenerationColor's job, as it already is for generations.
export function computeColorIndices({
  people,
  relationships,
  mode,
  rootPersonId,
}: ColorGroupInput): Map<string, number> {
  if (mode === "surname") return surnameIndices(people)
  if (mode === "branch") {
    return branchIndices(people, relationships, rootPersonId)
  }
  return computeGenerations(people, relationships)
}

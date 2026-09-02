// What a card on the canvas says when it is read out loud.
//
// A sighted reader gets two things from a card: the text on it, and the lines
// leaving it. A screen reader gets the first for free and the second not at
// all — so the relationships have to be *in the label*. A canvas of cards each
// announced as "group, node" with a name is a list of names, not a family
// tree.
//
// Pure, so the wording is testable and so the outline below can reuse the same
// name-and-dates phrase the cards use.

import type { UnionNode } from "~/lib/graph/derive-unions"
import { formatPartialDate } from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import { sortSiblingIds } from "~/lib/graph/order-family-graph"
import type { Person, Relationship } from "~/lib/types"

// "Anil “Bapu” Sawant, 1915 – 1990" — the two facts that identify somebody out
// loud, in the order a person would say them. Shared by the card labels and the
// outline so the same person is never introduced two different ways.
export function personSpokenName(person: Person): string {
  const name = personDisplayName(person)
  const birth = formatPartialDate(person.birth)
  const death = formatPartialDate(person.death)
  if (!birth && !death) return name
  // An en dash with a space either side, which every screen reader reads as a
  // pause rather than as the word "dash". A lone birth date reads "born 1915"
  // rather than "1915 –", which sounds like a truncation.
  if (birth && death) return `${name}, ${birth} – ${death}`
  if (birth) return `${name}, born ${birth}`
  return `${name}, died ${death}`
}

interface Relatives {
  parents: string[]
  children: string[]
  spouses: string[]
}

function relativesOf(
  personId: string,
  relationships: Relationship[]
): Relatives {
  const parents: string[] = []
  const children: string[] = []
  const spouses: string[] = []
  for (const r of relationships) {
    if (r.type === "parent-child") {
      if (r.to === personId) parents.push(r.from)
      if (r.from === personId) children.push(r.to)
    } else {
      if (r.to === personId) spouses.push(r.from)
      if (r.from === personId) spouses.push(r.to)
    }
  }
  return {
    parents: [...new Set(parents)],
    children: [...new Set(children)],
    spouses: [...new Set(spouses)],
  }
}

export interface PersonAriaLabelOptions {
  person: Person
  people: Person[]
  relationships: Relationship[]
  // Zero-based, as the canvas holds it; spoken one-based, as the toolbar shows
  // it.
  generation?: number
  // Whether this card has been dragged into place, which is otherwise a small
  // pin icon and nothing else.
  pinned?: boolean
}

export function personNodeAriaLabel({
  person,
  people,
  relationships,
  generation,
  pinned,
}: PersonAriaLabelOptions): string {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const nameOf = (id: string) => {
    const found = peopleById.get(id)
    return found ? personDisplayName(found) : "someone not recorded here"
  }

  const parts: string[] = [personSpokenName(person)]

  if (person.isPlaceholder) parts.push("Placeholder, name not yet known")
  if (generation !== undefined) parts.push(`Generation ${generation + 1}`)

  const { parents, children, spouses } = relativesOf(person.id, relationships)

  // Spouses and parents are named, children are counted. There are at most two
  // parents and rarely more than two spouses, but a well-recorded family can
  // have nine children — and a label that reads out nine names before saying
  // anything else is a label nobody waits through. The outline is where the
  // children are enumerated.
  if (spouses.length > 0) {
    parts.push(
      `Married to ${sortSiblingIds(spouses, peopleById).map(nameOf).join(" and ")}`
    )
  }
  if (parents.length > 0) {
    const label = parents.length === 1 ? "Parent" : "Parents"
    parts.push(
      `${label}: ${sortSiblingIds(parents, peopleById).map(nameOf).join(", ")}`
    )
  } else {
    parts.push("No parents recorded")
  }
  if (children.length > 0) {
    parts.push(
      `${children.length} ${children.length === 1 ? "child" : "children"}`
    )
  }

  if (person.multipleBirthGroup) parts.push("One of a multiple birth")
  if (pinned) parts.push("Placed by hand")

  // Full stops rather than commas between the clauses: a screen reader pauses
  // at a full stop, and without them the whole label arrives as one breathless
  // sentence.
  return `${parts.join(". ")}.`
}

export function unionNodeAriaLabel(union: UnionNode, people: Person[]): string {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const names = union.parents.map((id) => {
    const person = peopleById.get(id)
    return person ? personDisplayName(person) : "someone not recorded here"
  })

  // An implicit union is not a recorded marriage — it exists because two people
  // share a child. Saying "marriage" there would assert something the data
  // does not.
  const opening =
    union.kind === "implicit"
      ? `${names[0]} and ${names[1]}, parents of the same children`
      : `Marriage of ${names[0]} and ${names[1]}`

  const start = formatPartialDate(union.start)
  const end = formatPartialDate(union.end)
  const parts = [opening]
  if (start) parts.push(`from ${start}`)
  if (end) parts.push(`ended ${end}`)
  return `${parts.join(", ")}.`
}

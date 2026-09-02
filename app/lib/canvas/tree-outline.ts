// The tree as a nested list.
//
// The canvas is a `role="application"` region full of absolutely positioned
// cards joined by SVG paths. Everything that makes it readable — who is above
// whom, which line goes where — is geometry, and geometry is exactly what a
// screen reader cannot see. Good labels on the cards (see aria-labels.ts) make
// each one describable; they do not make the *shape* navigable.
//
// So the shape is offered a second way: descent as nesting, which is what a
// nested list is for. Not a transcript of the canvas — a rendering of the same
// data in a form that reads top to bottom.
//
// Pure, and ordered by the same comparator the canvas draws with, so the list
// and the picture agree about who comes first.

import { personSpokenName } from "~/lib/canvas/aria-labels"
import {
  recordOrderComparator,
  sortSiblingIds,
} from "~/lib/graph/order-family-graph"
import type { Person, Relationship } from "~/lib/types"

export type OutlineRelation =
  // A top-level entry: somebody in this tree with no parent who is also in it.
  "start" | "spouse" | "child"

export interface OutlineEntry {
  personId: string
  relation: OutlineRelation
  // "Anil “Bapu” Sawant, 1915 – 1990" — the same phrase the card's own label
  // opens with.
  label: string
  // Facts that a line on the canvas carries and a list item otherwise loses:
  // that a marriage ended, that a parent-child link is an adoption, that this
  // person's own family has already been listed further up.
  qualifiers: string[]
  children: OutlineEntry[]
}

export interface TreeOutlineInput {
  people: Person[]
  relationships: Relationship[]
  // The tree's members. The outline is a rendering of one canvas, so somebody
  // in the pool but not on it does not belong in it.
  memberIds: Set<string>
}

interface Adjacency {
  parents: Map<string, string[]>
  children: Map<string, string[]>
  spouses: Map<string, string[]>
  // Keyed "parentId>childId", so a dashed line on the canvas becomes a word in
  // the list.
  subtypes: Map<string, string>
  endedMarriages: Set<string>
  marriageStart: Map<string, string>
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|")
}

function buildAdjacency(
  relationships: Relationship[],
  memberIds: Set<string>
): Adjacency {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  const spouses = new Map<string, string[]>()
  const subtypes = new Map<string, string>()
  const endedMarriages = new Set<string>()
  const marriageStart = new Map<string, string>()

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? []
    if (!list.includes(value)) list.push(value)
    map.set(key, list)
  }

  for (const r of relationships) {
    // Both ends have to be on this canvas. A relationship reaching out of the
    // tree is real, but following it would list people who have no card —
    // exactly the mistake the keyboard navigation avoids by filtering to the
    // visible set.
    if (!memberIds.has(r.from) || !memberIds.has(r.to)) continue

    if (r.type === "parent-child") {
      push(parents, r.to, r.from)
      push(children, r.from, r.to)
      if (r.subtype && r.subtype !== "biological") {
        subtypes.set(`${r.from}>${r.to}`, r.subtype)
      }
    } else {
      push(spouses, r.from, r.to)
      push(spouses, r.to, r.from)
      const key = pairKey(r.from, r.to)
      if (r.end) endedMarriages.add(key)
      if (r.start?.year !== undefined) {
        marriageStart.set(key, String(r.start.year))
      }
    }
  }

  return { parents, children, spouses, subtypes, endedMarriages, marriageStart }
}

// The whole tree as a list of top-level entries. Anyone with no parent on this
// canvas starts a branch — the same rule orderFamilyGraph uses to pick where to
// begin, so the two produce the same reading order.
//
// A person is expanded once. Reached a second time (a cousin marriage, or a
// spouse who is also somebody's child) they are still *named*, because the
// reader needs to know who the other parent of a child is, but not expanded:
// their own family is already in the list, and repeating it would make an
// outline that never ends.
export function buildTreeOutline({
  people,
  relationships,
  memberIds,
}: TreeOutlineInput): OutlineEntry[] {
  const members = people.filter((person) => memberIds.has(person.id))
  const peopleById = new Map(members.map((person) => [person.id, person]))
  const adjacency = buildAdjacency(relationships, memberIds)
  const compare = recordOrderComparator(peopleById)

  const expanded = new Set<string>()

  const nameOf = (personId: string): string => {
    const person = peopleById.get(personId)
    return person ? personSpokenName(person) : personId
  }

  function marriageQualifiers(personId: string, spouseId: string): string[] {
    const key = pairKey(personId, spouseId)
    const qualifiers: string[] = []
    const start = adjacency.marriageStart.get(key)
    if (start) qualifiers.push(`married ${start}`)
    if (adjacency.endedMarriages.has(key)) qualifiers.push("marriage ended")
    return qualifiers
  }

  const parentsOf = (personId: string) => adjacency.parents.get(personId) ?? []

  function childEntry(parentId: string, childId: string): OutlineEntry {
    const subtype = adjacency.subtypes.get(`${parentId}>${childId}`)
    return build(childId, "child", subtype ? [subtype] : [])
  }

  // `cameFrom` is the spouse whose entry this one is nested under, if any. It
  // does two jobs, both of which stop the list repeating itself: this person
  // does not list that spouse back (a couple would otherwise nest inside each
  // other for ever), and the children they share are left to that spouse's
  // entry, which is where the caller puts them.
  function build(
    personId: string,
    relation: OutlineRelation,
    qualifiers: string[],
    cameFrom?: string
  ): OutlineEntry {
    const entry: OutlineEntry = {
      personId,
      relation,
      label: nameOf(personId),
      qualifiers: [...qualifiers],
      children: [],
    }
    if (expanded.has(personId)) {
      entry.qualifiers.push("listed again — their family is above")
      return entry
    }
    expanded.add(personId)

    const childIds = sortSiblingIds(
      [...(adjacency.children.get(personId) ?? [])],
      peopleById
    )
    // A child appears once, under the couple who had them — mirroring the
    // canvas, where children hang off the dot between their parents rather than
    // off each parent separately.
    const claimed = new Set<string>(
      cameFrom ? childIds.filter((id) => parentsOf(id).includes(cameFrom)) : []
    )

    const spouseIds = [...(adjacency.spouses.get(personId) ?? [])]
      .filter((id) => id !== cameFrom)
      .sort(compare)

    for (const spouseId of spouseIds) {
      const fresh = !expanded.has(spouseId)
      const spouseEntry = build(
        spouseId,
        "spouse",
        marriageQualifiers(personId, spouseId),
        personId
      )
      const shared = childIds.filter((id) => parentsOf(id).includes(spouseId))
      for (const childId of shared) claimed.add(childId)
      // Only when the spouse is genuinely being expanded here. Hanging a family
      // off a "listed again" entry would be putting them in two places and
      // saying they were in one.
      if (fresh) {
        spouseEntry.children = [
          ...shared.map((childId) => childEntry(personId, childId)),
          ...spouseEntry.children,
        ]
      }
      entry.children.push(spouseEntry)
    }

    // Whatever is left: children with no co-parent on this canvas, or one whose
    // other parent is somebody already listed elsewhere.
    for (const childId of childIds) {
      if (claimed.has(childId)) continue
      entry.children.push(childEntry(personId, childId))
    }

    return entry
  }

  const roots = members
    .filter((person) => (adjacency.parents.get(person.id) ?? []).length === 0)
    .map((person) => person.id)
    .sort(compare)

  const outline: OutlineEntry[] = []
  for (const personId of roots) {
    if (expanded.has(personId)) continue
    outline.push(build(personId, "start", []))
  }

  // Anyone the descent above never reached. Only possible for a member whose
  // every ancestor is off this canvas, but a person silently missing from a
  // rendering of the tree is worse than an extra top-level entry — this is the
  // same defensive sweep orderFamilyGraph ends with.
  for (const person of members) {
    if (expanded.has(person.id)) continue
    outline.push(build(person.id, "start", []))
  }

  return outline
}

// How many people the outline names, counting a person listed twice once. Used
// to say out loud how long the list is before somebody starts walking it.
export function outlinePersonCount(entries: OutlineEntry[]): number {
  const seen = new Set<string>()
  const walk = (list: OutlineEntry[]) => {
    for (const entry of list) {
      seen.add(entry.personId)
      walk(entry.children)
    }
  }
  walk(entries)
  return seen.size
}

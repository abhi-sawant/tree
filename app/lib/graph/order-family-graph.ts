import type { UnionNode } from "~/lib/graph/derive-unions"
import type { Person } from "~/lib/types"

export interface OrderedFamilyGraph {
  personOrder: string[]
  unionOrder: string[]
}

// The order the canvas lays a row of people out in: whichever was recorded
// first comes first, with the id breaking a tie so the result never depends on
// insertion order. Exported because anything that has to agree with what is on
// screen — keyboard navigation across a sibling row, for one — must read the
// order from here rather than restate it and drift.
export function recordOrderComparator(
  peopleById: Map<string, Person>
): (aId: string, bId: string) => number {
  return (aId, bId) => {
    const aCreated = peopleById.get(aId)?.createdAt ?? 0
    const bCreated = peopleById.get(bId)?.createdAt ?? 0
    return aCreated !== bCreated ? aCreated - bCreated : aId.localeCompare(bId)
  }
}

// Twins must not be split apart by a sibling recorded between them: a
// multiple birth is one event, and seeing them side by side is the whole
// point of having recorded it. Each multiple-birth group sorts as a single
// block, anchored at the position its earliest member would have taken on
// its own — so the surrounding birth-order intent is preserved and only the
// group's own members are pulled together.
export function sortSiblingIds(
  ids: string[],
  peopleById: Map<string, Person>
): string[] {
  const compare = recordOrderComparator(peopleById)
  const sorted = [...ids]

  const anchorByGroup = new Map<string, string>()
  for (const id of sorted) {
    const group = peopleById.get(id)?.multipleBirthGroup
    if (!group) continue
    const current = anchorByGroup.get(group)
    if (current === undefined || compare(id, current) < 0) {
      anchorByGroup.set(group, id)
    }
  }
  if (anchorByGroup.size === 0) {
    sorted.sort(compare)
    return sorted
  }

  const anchorOf = (id: string): string => {
    const group = peopleById.get(id)?.multipleBirthGroup
    return (group && anchorByGroup.get(group)) || id
  }
  sorted.sort((a, b) => {
    const byAnchor = compare(anchorOf(a), anchorOf(b))
    return byAnchor !== 0 ? byAnchor : compare(a, b)
  })
  return sorted
}

// ELK's crossing-minimization has no notion of "these people are siblings" —
// it only ever respects an order it's explicitly told to prefer (see
// considerModelOrder/forceNodeModelOrder in run-layout.ts), and the order
// people/relationships happen to be stored in has no relationship to family
// structure. Without this, a union's children can be scattered across a
// generation with an unrelated family's children wedged between them, so the
// connector lines cross over subtrees they have nothing to do with.
//
// This produces a DFS pre-order traversal starting from every person with no
// recorded parent ("root"): visiting a person visits every union they're a
// parent in (pulling their spouse in right beside them), then that union's
// children back-to-back in one pass — which is what keeps a sibling group
// contiguous. Every person/union is visited at most once, so a DAG edge that
// closes a cycle over this traversal (e.g. a cousin marriage) just means
// whichever side is reached second renders next to its spouse instead of
// inside its own birth family's block — an accepted, rare tradeoff, not a
// silent drop.
export function orderFamilyGraph(
  people: Person[],
  unions: UnionNode[],
  singleParentLinks: Array<{ parentId: string; childId: string }>,
  twoParentLinks: Array<{ unionId: string; childId: string }>
): OrderedFamilyGraph {
  const peopleById = new Map(people.map((p) => [p.id, p]))

  const compare = recordOrderComparator(peopleById)
  const sortSiblings = (ids: string[]): void => {
    ids.splice(0, ids.length, ...sortSiblingIds(ids, peopleById))
  }

  const childrenByUnion = new Map<string, string[]>()
  for (const { unionId, childId } of twoParentLinks) {
    const list = childrenByUnion.get(unionId) ?? []
    list.push(childId)
    childrenByUnion.set(unionId, list)
  }
  for (const list of childrenByUnion.values()) sortSiblings(list)

  const childrenByParent = new Map<string, string[]>()
  for (const { parentId, childId } of singleParentLinks) {
    const list = childrenByParent.get(parentId) ?? []
    list.push(childId)
    childrenByParent.set(parentId, list)
  }
  for (const list of childrenByParent.values()) sortSiblings(list)

  const unionsByParent = new Map<string, UnionNode[]>()
  for (const union of unions) {
    for (const parentId of union.parents) {
      const list = unionsByParent.get(parentId) ?? []
      list.push(union)
      unionsByParent.set(parentId, list)
    }
  }
  for (const [parentId, list] of unionsByParent) {
    list.sort((a, b) =>
      compare(otherParent(a, parentId), otherParent(b, parentId))
    )
  }

  const isChild = new Set<string>()
  for (const { childId } of singleParentLinks) isChild.add(childId)
  for (const { childId } of twoParentLinks) isChild.add(childId)

  const roots = people
    .filter((p) => !isChild.has(p.id))
    .map((p) => p.id)
    .sort(compare)

  const personOrder: string[] = []
  const unionOrder: string[] = []
  const visitedPeople = new Set<string>()
  const visitedUnions = new Set<string>()

  function visitPerson(personId: string): void {
    if (visitedPeople.has(personId) || !peopleById.has(personId)) return
    visitedPeople.add(personId)
    personOrder.push(personId)

    for (const union of unionsByParent.get(personId) ?? []) {
      visitUnion(union)
    }
    for (const childId of childrenByParent.get(personId) ?? []) {
      visitPerson(childId)
    }
  }

  function visitUnion(union: UnionNode): void {
    if (visitedUnions.has(union.id)) return
    visitedUnions.add(union.id)
    unionOrder.push(union.id)

    for (const parentId of union.parents) {
      visitPerson(parentId)
    }
    for (const childId of childrenByUnion.get(union.id) ?? []) {
      visitPerson(childId)
    }
  }

  for (const rootId of roots) visitPerson(rootId)

  // Defensive sweeps: cover anyone/anything unreachable from a 0-parent root
  // (disconnected branches, malformed data) so nobody is silently dropped.
  for (const p of people) visitPerson(p.id)
  for (const u of unions) visitUnion(u)

  return { personOrder, unionOrder }
}

function otherParent(union: UnionNode, parentId: string): string {
  const [a, b] = union.parents
  return a === parentId ? b : a
}

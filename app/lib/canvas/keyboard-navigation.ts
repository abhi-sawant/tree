import type { LayoutDirection } from "~/lib/canvas/layout-direction"
import {
  recordOrderComparator,
  sortSiblingIds,
} from "~/lib/graph/order-family-graph"
import type { Person, Relationship } from "~/lib/types"

// Named for the family relation, not the key. Phase 3 established that
// generations advance along the main axis and siblings/spouses spread along
// the cross axis; keeping the step semantic is what lets one navigation rule
// serve both layout directions without a branch inside it.
export type NavigationStep =
  "toward-parents" | "toward-children" | "cross-prev" | "cross-next"

// Arrow keys follow the geometry on screen rather than a fixed "up is parent"
// rule. In a left-to-right tree the parents genuinely are to the left, so ←
// must walk to them — an arrow key that pointed somewhere other than where the
// card is would be worse than no binding at all.
export function arrowKeyToStep(
  key: string,
  direction: LayoutDirection
): NavigationStep | undefined {
  const vertical = direction === "DOWN"
  switch (key) {
    case "ArrowUp":
      return vertical ? "toward-parents" : "cross-prev"
    case "ArrowDown":
      return vertical ? "toward-children" : "cross-next"
    case "ArrowLeft":
      return vertical ? "cross-prev" : "toward-parents"
    case "ArrowRight":
      return vertical ? "cross-next" : "toward-children"
    default:
      return undefined
  }
}

export interface NavigationGraph {
  people: Person[]
  relationships: Relationship[]
  // Only people with a card on screen right now. A relative excluded by the
  // focus scope or a hidden generation is not somewhere an arrow key can land:
  // selecting them would light up the detail panel for a card the user cannot
  // see. Hidden people are stepped *over* rather than stepped onto — a hidden
  // parent means ↑ reaches the other parent rather than stopping dead.
  visiblePersonIds: Set<string>
}

interface Adjacency {
  parents: Map<string, string[]>
  children: Map<string, string[]>
  spouses: Map<string, string[]>
}

function buildAdjacency(relationships: Relationship[]): Adjacency {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  const spouses = new Map<string, string[]>()

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? []
    list.push(value)
    map.set(key, list)
  }

  for (const r of relationships) {
    if (r.type === "parent-child") {
      push(parents, r.to, r.from)
      push(children, r.from, r.to)
    } else {
      push(spouses, r.from, r.to)
      push(spouses, r.to, r.from)
    }
  }

  return { parents, children, spouses }
}

// Whose birth family the row is built around. A row has to come out the same
// whichever of its members you are standing on, or ← and → stop being inverses:
// anchoring on the navigating person made a childless couple ping-pong, each
// seeing the other as "their spouse, one to the right".
//
// Someone with recorded parents anchors their own row. Someone without is a
// married-in spouse and belongs in their partner's row — which is also where
// the canvas draws them, since orderFamilyGraph visits a person and then pulls
// their spouse in beside them. When nobody in the couple has parents they are
// both roots, and the earlier-recorded one anchors, matching the order
// orderFamilyGraph walks roots in.
function rowAnchor(
  personId: string,
  adjacency: Adjacency,
  peopleById: Map<string, Person>
): string {
  if ((adjacency.parents.get(personId) ?? []).length > 0) return personId

  const spouseIds = [...new Set(adjacency.spouses.get(personId) ?? [])]
  if (spouseIds.length === 0) return personId

  const compare = recordOrderComparator(peopleById)
  const marriedIn = spouseIds
    .filter((id) => (adjacency.parents.get(id) ?? []).length > 0)
    .sort(compare)
  if (marriedIn.length > 0) return marriedIn[0]

  return [personId, ...spouseIds].sort(compare)[0]
}

// The row a person sits in along the cross axis, in the order the canvas puts
// it in: the anchor's sibling group by birth order, with each member's spouses
// inserted immediately after them. That mirrors orderFamilyGraph's traversal,
// which visits a person and then the unions that pull their spouse in beside
// them — so ←/→ walks the cards in the order they actually appear.
//
// Siblings are derived from shared parents whether or not the parent is itself
// visible: the relationship is what makes them siblings, and hiding the parent
// generation shouldn't sever the row underneath it. Visibility is applied to
// the finished row instead, so a hidden card is stepped over rather than
// stepped onto.
function crossAxisRow(
  personId: string,
  adjacency: Adjacency,
  peopleById: Map<string, Person>,
  visible: Set<string>
): string[] {
  const anchor = rowAnchor(personId, adjacency, peopleById)

  const siblingIds = new Set<string>([anchor])
  for (const parentId of adjacency.parents.get(anchor) ?? []) {
    for (const siblingId of adjacency.children.get(parentId) ?? []) {
      siblingIds.add(siblingId)
    }
  }

  const ordered = sortSiblingIds([...siblingIds], peopleById)
  const compare = recordOrderComparator(peopleById)

  const row: string[] = []
  const placed = new Set<string>()
  for (const siblingId of ordered) {
    if (placed.has(siblingId)) continue
    row.push(siblingId)
    placed.add(siblingId)
    const spouseIds = [...new Set(adjacency.spouses.get(siblingId) ?? [])]
      .filter((id) => !placed.has(id))
      .sort(compare)
    for (const spouseId of spouseIds) {
      row.push(spouseId)
      placed.add(spouseId)
    }
  }
  return row.filter((id) => visible.has(id))
}

// The person an arrow key moves the selection to, or undefined when there is
// nobody that way — in which case the caller does nothing at all. Silence is
// the right answer: an arrow press that lands nowhere is a normal part of
// walking to the edge of a family, not an error to report.
export function stepToRelative(
  fromPersonId: string,
  step: NavigationStep,
  graph: NavigationGraph
): string | undefined {
  const { people, relationships, visiblePersonIds } = graph
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const adjacency = buildAdjacency(relationships)

  if (step === "toward-parents" || step === "toward-children") {
    const edges =
      step === "toward-parents" ? adjacency.parents : adjacency.children
    const candidates = [...new Set(edges.get(fromPersonId) ?? [])].filter(
      (id) => visiblePersonIds.has(id)
    )
    if (candidates.length === 0) return undefined
    return sortSiblingIds(candidates, peopleById)[0]
  }

  const row = crossAxisRow(
    fromPersonId,
    adjacency,
    peopleById,
    visiblePersonIds
  )
  const index = row.indexOf(fromPersonId)
  if (index === -1) return undefined
  // Deliberately no wraparound. Holding → would otherwise snap from the last
  // card in a row back to the first, which reads as the selection jumping at
  // random rather than as having reached the edge of the family.
  const target = step === "cross-prev" ? row[index - 1] : row[index + 1]
  return target
}

// The keys that open an add-relative form on the selected person. Parent,
// spouse and child only: those three are the whole of what makes a new link in
// a lineage, and each names exactly one relationship. "Add sibling" is not
// here on purpose — it resolves through ensureParentsForSibling, which invents
// a placeholder parent when none is recorded, and a bare unmodified keystroke
// should not be able to conjure a person nobody asked for.
export const ADD_RELATIVE_KEYS = {
  p: "add-parent",
  s: "add-spouse",
  c: "add-child",
} as const

export type AddRelativeKey = keyof typeof ADD_RELATIVE_KEYS

export function addRelativeKindForKey(
  key: string
): (typeof ADD_RELATIVE_KEYS)[AddRelativeKey] | undefined {
  const lower = key.toLowerCase()
  return lower in ADD_RELATIVE_KEYS
    ? ADD_RELATIVE_KEYS[lower as AddRelativeKey]
    : undefined
}

// Every shortcut here is a bare printable key or an arrow, so anything typed
// into a field would otherwise be swallowed — "Pieter" would fire the add-parent
// shortcut on its first letter. Checked against the event target rather than
// document.activeElement so a keystroke is judged by where it was actually
// delivered.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

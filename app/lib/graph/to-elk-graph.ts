import type { ElkExtendedEdge, ElkNode } from "elkjs"

import { deriveUnions } from "~/lib/graph/derive-unions"
import { personNodeId } from "~/lib/graph/node-ids"
import { orderFamilyGraph } from "~/lib/graph/order-family-graph"
import type { Person, Relationship, TreeMember } from "~/lib/types"

export interface ToElkGraphOptions {
  people: Person[]
  relationships: Relationship[]
  treeMembers: TreeMember[]
}

export const PERSON_WIDTH = 200
export const PERSON_HEIGHT = 200
export const UNION_WIDTH = 16
export const UNION_HEIGHT = 16

export function toElkGraph({
  people,
  relationships,
  treeMembers,
}: ToElkGraphOptions): ElkNode {
  const memberIds = new Set(treeMembers.map((m) => m.personId))
  const scopedPeople = people.filter((p) => memberIds.has(p.id))
  const scopedRelationships = relationships.filter(
    (r) => memberIds.has(r.from) && memberIds.has(r.to)
  )

  const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
    scopedPeople,
    scopedRelationships
  )

  // A union's children must render as a contiguous run of columns, or the
  // connector lines dropping from that union cross over unrelated families'
  // subtrees. ELK's crossing-minimization has no notion of "these are
  // siblings" — it only respects whatever order it's given, and only when
  // told to (considerModelOrder + forceNodeModelOrder, in run-layout.ts).
  // orderFamilyGraph produces that family-grouped order; everything below
  // sorts by rank in that order instead of raw array/relationship order.
  const { personOrder, unionOrder } = orderFamilyGraph(
    scopedPeople,
    unions,
    singleParentLinks,
    twoParentLinks
  )
  const personRank = new Map(personOrder.map((personId, i) => [personId, i]))
  const unionRank = new Map(unionOrder.map((unionId, i) => [unionId, i]))
  const byPersonRank = (a: string, b: string) =>
    (personRank.get(a) ?? 0) - (personRank.get(b) ?? 0)

  const orderedUnions = [...unions].sort(
    (a, b) => (unionRank.get(a.id) ?? 0) - (unionRank.get(b.id) ?? 0)
  )
  const orderedTwoParentLinks = [...twoParentLinks].sort((a, b) => {
    const byUnion =
      (unionRank.get(a.unionId) ?? 0) - (unionRank.get(b.unionId) ?? 0)
    return byUnion !== 0 ? byUnion : byPersonRank(a.childId, b.childId)
  })
  const orderedSingleParentLinks = [...singleParentLinks].sort((a, b) => {
    const byParent = byPersonRank(a.parentId, b.parentId)
    return byParent !== 0 ? byParent : byPersonRank(a.childId, b.childId)
  })

  const personNodes: ElkNode[] = personOrder.map((personId) => ({
    id: personNodeId(personId),
    width: PERSON_WIDTH,
    height: PERSON_HEIGHT,
  }))

  // A union node's ELK width is normally tiny (UNION_WIDTH) and its rendered
  // size always is (toReactFlowGraph hardcodes UNION_WIDTH/UNION_HEIGHT
  // regardless of what we tell ELK here) — but leaving it tiny for LAYOUT
  // purposes means ELK reserves no room in the parents' row for however wide
  // this union's own row of children (plus each child's own spouse) turns
  // out to be. When one union's children need more columns than its own
  // slot in the parents' row provides, ELK can end up sliding a *different*,
  // narrower union into the leftover space directly above this one's
  // children — which is what made an unrelated couple's connector look like
  // it crossed into this family's territory. Sizing each union's ELK width
  // to its own child-generation footprint reserves that room up front.
  const childrenByUnion = new Map<string, string[]>()
  for (const { unionId, childId } of twoParentLinks) {
    const list = childrenByUnion.get(unionId) ?? []
    list.push(childId)
    childrenByUnion.set(unionId, list)
  }
  const hasSpouse = new Set<string>()
  for (const u of unions) {
    for (const parentId of u.parents) hasSpouse.add(parentId)
  }
  const CHILD_COLUMN_PITCH = PERSON_WIDTH + 40 // must track elk.spacing.nodeNode
  const footprintWidth = (unionId: string): number => {
    let slots = 0
    for (const childId of childrenByUnion.get(unionId) ?? []) {
      slots += hasSpouse.has(childId) ? 2 : 1
    }
    if (slots === 0) return UNION_WIDTH
    // +1 extra slot of margin: ELK's node placement doesn't guarantee this
    // wide union node stays vertically aligned with its own reserved
    // footprint below (it can drift a bit while still avoiding overlaps
    // within its own row) — the exact footprint closes the gap in every
    // real tree we tested but a synthetic case still slipped through by a
    // few dozen px, so this buffer absorbs that class of drift.
    return (slots + 1) * CHILD_COLUMN_PITCH - 40
  }

  const unionNodes: ElkNode[] = orderedUnions.map((u) => ({
    id: u.id,
    width: Math.max(UNION_WIDTH, footprintWidth(u.id)),
    height: UNION_HEIGHT,
  }))

  const parentToUnionEdges: ElkExtendedEdge[] = orderedUnions.flatMap((u) =>
    [...u.parents].sort(byPersonRank).map((parentId) => ({
      id: `edge:${personNodeId(parentId)}->${u.id}`,
      sources: [personNodeId(parentId)],
      targets: [u.id],
    }))
  )

  const unionToChildEdges: ElkExtendedEdge[] = orderedTwoParentLinks.map(
    ({ unionId, childId }) => ({
      id: `edge:${unionId}->${personNodeId(childId)}`,
      sources: [unionId],
      targets: [personNodeId(childId)],
    })
  )

  const singleParentEdges: ElkExtendedEdge[] = orderedSingleParentLinks.map(
    ({ parentId, childId }) => ({
      id: `edge:${personNodeId(parentId)}->${personNodeId(childId)}`,
      sources: [personNodeId(parentId)],
      targets: [personNodeId(childId)],
    })
  )

  return {
    id: "root",
    children: [...personNodes, ...unionNodes],
    edges: [...parentToUnionEdges, ...unionToChildEdges, ...singleParentEdges],
  }
}

// Test utility: Kahn's-algorithm topological sort. The output of toElkGraph is
// structurally acyclic by construction (people only ever point at unions or,
// for single-parent links, at children — never back at an ancestor), and
// addRelationship already rejects any parent-child write that would create
// such a chain before it reaches storage. This helper exists to regression-test
// that guarantee, including against hand-built fixtures that bypass addRelationship.
export function isAcyclic(
  nodeIds: string[],
  edges: Array<{ from: string; to: string }>
): boolean {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  const adjacency = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const { from, to } of edges) {
    adjacency.get(from)?.push(to)
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1)
  }

  const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0)
  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    visited++
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  return visited === nodeIds.length
}

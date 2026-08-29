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

export const PERSON_WIDTH = 160
export const PERSON_HEIGHT = 80
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

  const unionNodes: ElkNode[] = orderedUnions.map((u) => ({
    id: u.id,
    width: UNION_WIDTH,
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

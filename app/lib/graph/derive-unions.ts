import { unionNodeId } from "~/lib/graph/node-ids"
import type { PartialDate, Person, Relationship } from "~/lib/types"

export interface UnionNode {
  id: string
  kind: "real" | "implicit"
  parents: [string, string]
  relationshipId?: string
  start?: PartialDate
  end?: PartialDate
}

export interface DeriveUnionsResult {
  unions: UnionNode[]
  singleParentLinks: Array<{ parentId: string; childId: string }>
  twoParentLinks: Array<{ unionId: string; childId: string }>
}

// people is accepted per the Step 3 spec's signature for forward compatibility
// (e.g. future display-name tie-breaks); the current algorithm only needs ids.
export function deriveUnions(
  _people: Person[],
  relationships: Relationship[]
): DeriveUnionsResult {
  const parentsByChild = new Map<string, string[]>()
  for (const r of relationships) {
    if (r.type !== "parent-child") continue
    const list = parentsByChild.get(r.to) ?? []
    list.push(r.from)
    parentsByChild.set(r.to, list)
  }

  const spouseRels = relationships.filter((r) => r.type === "spouse")
  const unionsById = new Map<string, UnionNode>()
  const singleParentLinks: Array<{ parentId: string; childId: string }> = []
  const twoParentLinks: Array<{ unionId: string; childId: string }> = []

  for (const [childId, parentIds] of parentsByChild) {
    if (parentIds.length === 1) {
      singleParentLinks.push({ parentId: parentIds[0], childId })
      continue
    }
    if (parentIds.length !== 2) continue // malformed (0 or >2 parents) — ignore rather than throw

    const [a, b] = parentIds
    const unionId = unionNodeId([a, b])
    let union = unionsById.get(unionId)
    if (!union) {
      const spouseRel = spouseRels.find(
        (r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)
      )
      union = spouseRel
        ? {
            id: unionId,
            kind: "real",
            parents: [a, b],
            relationshipId: spouseRel.id,
            start: spouseRel.start,
            end: spouseRel.end,
          }
        : { id: unionId, kind: "implicit", parents: [a, b] }
      unionsById.set(unionId, union)
    }
    twoParentLinks.push({ unionId: union.id, childId })
  }

  // A spouse relationship with no shared children (e.g. a childless marriage,
  // or a step-parent's spouse) still needs a union node so the couple is wired
  // into the graph and laid out next to each other — otherwise that spouse is
  // a disconnected node with no edges at all.
  for (const spouseRel of spouseRels) {
    const unionId = unionNodeId([spouseRel.from, spouseRel.to])
    if (unionsById.has(unionId)) continue
    unionsById.set(unionId, {
      id: unionId,
      kind: "real",
      parents: [spouseRel.from, spouseRel.to],
      relationshipId: spouseRel.id,
      start: spouseRel.start,
      end: spouseRel.end,
    })
  }

  return {
    unions: [...unionsById.values()],
    singleParentLinks,
    twoParentLinks,
  }
}

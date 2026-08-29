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

function unionKey(a: string, b: string): string {
  return [a, b].sort().join(":")
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
  const unionsByKey = new Map<string, UnionNode>()
  const singleParentLinks: Array<{ parentId: string; childId: string }> = []
  const twoParentLinks: Array<{ unionId: string; childId: string }> = []

  for (const [childId, parentIds] of parentsByChild) {
    if (parentIds.length === 1) {
      singleParentLinks.push({ parentId: parentIds[0], childId })
      continue
    }
    if (parentIds.length !== 2) continue // malformed (0 or >2 parents) — ignore rather than throw

    const [a, b] = parentIds
    const key = unionKey(a, b)
    let union = unionsByKey.get(key)
    if (!union) {
      const spouseRel = spouseRels.find(
        (r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)
      )
      union = spouseRel
        ? {
            id: `union:${key}`,
            kind: "real",
            parents: [a, b],
            relationshipId: spouseRel.id,
            start: spouseRel.start,
            end: spouseRel.end,
          }
        : { id: `union:${key}`, kind: "implicit", parents: [a, b] }
      unionsByKey.set(key, union)
    }
    twoParentLinks.push({ unionId: union.id, childId })
  }

  return {
    unions: [...unionsByKey.values()],
    singleParentLinks,
    twoParentLinks,
  }
}

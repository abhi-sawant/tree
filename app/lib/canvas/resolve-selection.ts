import type { UnionNode } from "~/lib/graph/derive-unions"
import { parseNodeId } from "~/lib/graph/node-ids"
import type { Person } from "~/lib/types"

export type ResolvedSelection =
  | { kind: "person"; person: Person }
  | { kind: "union"; union: UnionNode }
  | undefined

// Re-derives from the live people/unions arrays every call rather than
// trusting anything cached alongside the selected id, so a selection never
// goes stale after an edit or a concurrent delete.
export function resolveSelection(
  nodeId: string | null,
  people: Person[],
  unions: UnionNode[]
): ResolvedSelection {
  if (!nodeId) return undefined

  const parsed = parseNodeId(nodeId)
  if (!parsed) return undefined

  if (parsed.kind === "person") {
    const person = people.find((p) => p.id === parsed.personId)
    return person ? { kind: "person", person } : undefined
  }

  const union = unions.find((u) => u.id === nodeId)
  return union ? { kind: "union", union } : undefined
}

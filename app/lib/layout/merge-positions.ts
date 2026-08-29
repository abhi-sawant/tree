import { personNodeId } from "~/lib/graph/node-ids"
import type { NodePosition } from "~/lib/layout/run-layout"
import type { TreeMember } from "~/lib/types"

// Overwrites with the real, persisted TreeMember.x/y wherever set. This is
// correct whether or not the layout source already omitted overridden ids —
// the two don't need to agree on an exact contract for this to be safe.
export function mergeLayoutPositions(
  elkPositions: Record<string, NodePosition>,
  treeMembers: TreeMember[]
): Record<string, NodePosition> {
  const merged = { ...elkPositions }
  for (const member of treeMembers) {
    if (member.x !== undefined && member.y !== undefined) {
      merged[personNodeId(member.personId)] = { x: member.x, y: member.y }
    }
  }
  return merged
}

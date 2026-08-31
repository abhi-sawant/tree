import type { NodePosition } from "~/lib/layout/run-layout"

// The worker never sees real override coordinates, only which ids to omit —
// that's what makes it "layout-only" and unaware of persistence (D9).
export function filterOverridden(
  positions: Record<string, NodePosition>,
  overriddenNodeIds: string[]
): Record<string, NodePosition> {
  const overridden = new Set(overriddenNodeIds)
  const filtered: Record<string, NodePosition> = {}
  for (const [id, pos] of Object.entries(positions)) {
    if (!overridden.has(id)) filtered[id] = pos
  }
  return filtered
}

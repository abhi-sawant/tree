import type { ELK, ElkNode } from "elkjs"

export interface NodePosition {
  x: number
  y: number
}

// Generations flow top-to-bottom, the standard family-tree convention.
export const DEFAULT_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "40",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
}

// Takes a pre-constructed ELK instance rather than building one itself:
// elkjs needs a different construction on Node (compute-layout.ts) vs. inside
// a browser Worker (elk-worker.ts) — see elk-worker.ts for why.
export async function runLayout(
  elk: ELK,
  graph: ElkNode,
  layoutOptions: Record<string, string> = DEFAULT_LAYOUT_OPTIONS,
): Promise<Record<string, NodePosition>> {
  const result = await elk.layout(graph, { layoutOptions })

  const positions: Record<string, NodePosition> = {}
  for (const node of result.children ?? []) {
    positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
  }
  return positions
}

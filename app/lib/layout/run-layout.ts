import type { ELK, ElkNode } from "elkjs"

import type { LayoutDirection } from "~/lib/canvas/layout-direction"

export interface NodePosition {
  x: number
  y: number
}

// Generations flow top-to-bottom, the standard family-tree convention.
export const DEFAULT_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "90",
  "elk.spacing.nodeNode": "40",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  // toElkGraph feeds nodes/edges in family-grouped order (see
  // order-family-graph.ts) so that a union's children render as a
  // contiguous run of columns. These two options are what make ELK actually
  // respect that order during crossing minimization instead of freely
  // reshuffling a layer — forceNodeModelOrder's own docs note it "assumes
  // the node model order is already respected before crossing minimization;
  // this can be achieved by setting considerModelOrder.strategy to
  // NODES_AND_EDGES", so the two only work together.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
}

// horizontalSpacing here must track the horizontalSpacing passed into
// toElkGraph (see to-elk-graph.ts's childColumnPitch) — both derive a union's
// child-column footprint from the same number.
export function buildLayoutOptions({
  horizontalSpacing,
  verticalSpacing,
  direction = "DOWN",
}: {
  horizontalSpacing: number
  verticalSpacing: number
  direction?: LayoutDirection
}): Record<string, string> {
  // The two spacings keep their names from the settings UI, but which axis each
  // controls follows the direction: "between layers" is always generation to
  // generation, and "nodeNode" is always sibling to sibling.
  return {
    ...DEFAULT_LAYOUT_OPTIONS,
    "elk.direction": direction,
    "elk.layered.spacing.nodeNodeBetweenLayers": String(verticalSpacing),
    "elk.spacing.nodeNode": String(horizontalSpacing),
  }
}

// Takes a pre-constructed ELK instance rather than building one itself: elkjs
// needs a different construction in Node (compute-layout.ts, default entry with
// its synchronous fallback) than in the browser (use-elk-layout.ts, explicit
// workerUrl) — see use-elk-layout.ts for why.
export async function runLayout(
  elk: ELK,
  graph: ElkNode,
  layoutOptions: Record<string, string> = DEFAULT_LAYOUT_OPTIONS
): Promise<Record<string, NodePosition>> {
  const result = await elk.layout(graph, { layoutOptions })

  const positions: Record<string, NodePosition> = {}
  for (const node of result.children ?? []) {
    positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
  }
  return positions
}

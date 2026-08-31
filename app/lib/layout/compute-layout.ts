import ElkConstructor from "elkjs"
import type { ElkNode } from "elkjs"

import {
  DEFAULT_LAYOUT_OPTIONS,
  runLayout,
  type NodePosition,
} from "~/lib/layout/run-layout"

// Node-only: elkjs's default entry point auto-selects a synchronous in-process
// "fake worker" whose own environment check only takes the correct branch when
// `self` is undefined — true in Node, never in a browser (see use-elk-layout.ts,
// which needs a different construction). This is what makes computeLayout usable
// directly in Vitest without a real Worker.
export async function computeLayout(
  graph: ElkNode,
  layoutOptions: Record<string, string> = DEFAULT_LAYOUT_OPTIONS
): Promise<Record<string, NodePosition>> {
  return runLayout(new ElkConstructor(), graph, layoutOptions)
}

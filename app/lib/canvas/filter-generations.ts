import type { ReactFlowGraph } from "~/lib/layout/to-react-flow-graph"
import type {
  PersonNodeData,
  UnionNodeData,
} from "~/lib/layout/to-react-flow-graph"
import { personNodeId } from "~/lib/graph/node-ids"

// Hides whole generations from an already-laid-out graph. Filtering here
// rather than before layout is deliberate: everyone else keeps the exact
// position they had, so toggling a generation off and on again doesn't
// reshuffle the tree under the reader.
export function filterHiddenGenerations(
  graph: ReactFlowGraph,
  hiddenGenerations: number[]
): ReactFlowGraph {
  if (hiddenGenerations.length === 0) return graph

  const hidden = new Set(hiddenGenerations)
  const removedNodeIds = new Set<string>()

  for (const node of graph.nodes) {
    if (node.type !== "person") continue
    const { generation } = node.data as PersonNodeData
    if (hidden.has(generation)) removedNodeIds.add(node.id)
  }

  // A union only means anything with both of its parents on screen.
  for (const node of graph.nodes) {
    if (node.type !== "union") continue
    const { union } = node.data as UnionNodeData
    if (union.parents.some((p) => removedNodeIds.has(personNodeId(p)))) {
      removedNodeIds.add(node.id)
    }
  }

  return {
    nodes: graph.nodes.filter((n) => !removedNodeIds.has(n.id)),
    edges: graph.edges.filter(
      (e) => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target)
    ),
  }
}

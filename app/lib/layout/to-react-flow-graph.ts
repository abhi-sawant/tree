import type { Edge, Node } from "@xyflow/react"
import type { ElkNode } from "elkjs"

import type { UnionNode } from "~/lib/graph/derive-unions"
import { PERSON_PREFIX } from "~/lib/graph/node-ids"
import {
  PERSON_HEIGHT,
  PERSON_WIDTH,
  UNION_HEIGHT,
  UNION_WIDTH,
} from "~/lib/graph/to-elk-graph"
import type { NodePosition } from "~/lib/layout/run-layout"
import type { Person } from "~/lib/types"

export interface PersonNodeData extends Record<string, unknown> {
  person: Person
}

export interface UnionNodeData extends Record<string, unknown> {
  union: UnionNode
}

export interface ToReactFlowGraphOptions {
  graph: ElkNode
  positions: Record<string, NodePosition>
  people: Person[]
  unions: UnionNode[]
}

export interface ReactFlowGraph {
  nodes: Node[]
  edges: Edge[]
}

// People/unions missing from the current data (or otherwise deleted)
// shouldn't happen for nodes toElkGraph produced, but a defensive skip is
// cheap insurance against a dangling id rendering a broken card.
export function toReactFlowGraph({
  graph,
  positions,
  people,
  unions,
}: ToReactFlowGraphOptions): ReactFlowGraph {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const unionsById = new Map(unions.map((u) => [u.id, u]))

  const nodes: Node[] = (graph.children ?? []).flatMap((elkNode): Node[] => {
    const position = positions[elkNode.id] ?? { x: 0, y: 0 }

    if (elkNode.id.startsWith(PERSON_PREFIX)) {
      const person = peopleById.get(elkNode.id.slice(PERSON_PREFIX.length))
      if (!person) return []
      return [
        {
          id: elkNode.id,
          type: "person",
          position,
          data: { person } satisfies PersonNodeData,
          width: PERSON_WIDTH,
          height: PERSON_HEIGHT,
        },
      ]
    }

    const union = unionsById.get(elkNode.id)
    if (!union) return []
    return [
      {
        id: elkNode.id,
        type: "union",
        position,
        data: { union } satisfies UnionNodeData,
        width: UNION_WIDTH,
        height: UNION_HEIGHT,
      },
    ]
  })

  const edges: Edge[] = (graph.edges ?? []).map((elkEdge) => ({
    id: elkEdge.id,
    source: elkEdge.sources[0],
    target: elkEdge.targets[0],
    type: "smoothstep",
  }))

  return { nodes, edges }
}

import type { Edge, Node } from "@xyflow/react"
import type { ElkNode } from "elkjs"

import type { UnionNode } from "~/lib/graph/derive-unions"
import { PERSON_PREFIX, UNION_PREFIX, personNodeId } from "~/lib/graph/node-ids"
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
  treeId: string
  overridden: boolean
}

export interface UnionNodeData extends Record<string, unknown> {
  union: UnionNode
}

export interface ToReactFlowGraphOptions {
  graph: ElkNode
  positions: Record<string, NodePosition>
  people: Person[]
  unions: UnionNode[]
  treeId: string
  overriddenNodeIds: string[]
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
  treeId,
  overriddenNodeIds,
}: ToReactFlowGraphOptions): ReactFlowGraph {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const unionsById = new Map(unions.map((u) => [u.id, u]))
  const overridden = new Set(overriddenNodeIds)

  // ELK lays the union out in its own layer below the couple (it only ever
  // sees a person->union edge, one layer at a time). We want it sitting
  // between the couple instead — same row, centered — so the marriage line
  // reads as a single horizontal line straight across, not a bent line
  // dropping to a dot below. Resolve every union's real position up front so
  // node placement and edge handle selection (below) agree on where it is.
  const resolvedPositions: Record<string, NodePosition> = { ...positions }
  for (const union of unions) {
    const elkPosition = positions[union.id]
    if (elkPosition) {
      resolvedPositions[union.id] = unionPosition(union, elkPosition, positions)
    }
  }

  const nodes: Node[] = (graph.children ?? []).flatMap((elkNode): Node[] => {
    const position = resolvedPositions[elkNode.id] ?? { x: 0, y: 0 }

    if (elkNode.id.startsWith(PERSON_PREFIX)) {
      const person = peopleById.get(elkNode.id.slice(PERSON_PREFIX.length))
      if (!person) return []
      return [
        {
          id: elkNode.id,
          type: "person",
          position,
          data: {
            person,
            treeId,
            overridden: overridden.has(elkNode.id),
          } satisfies PersonNodeData,
          width: PERSON_WIDTH,
          height: PERSON_HEIGHT,
          draggable: true,
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
        draggable: false,
      },
    ]
  })

  const edges: Edge[] = (graph.edges ?? []).map((elkEdge): Edge => {
    const source = elkEdge.sources[0]
    const target = elkEdge.targets[0]

    // A parent->union edge is the marriage line: draw it as a plain
    // horizontal line, entering the union from whichever side this parent
    // actually sits on (the couple share a row, so their x order settles it).
    if (source.startsWith(PERSON_PREFIX) && target.startsWith(UNION_PREFIX)) {
      const personX = resolvedPositions[source]?.x ?? 0
      const unionX = resolvedPositions[target]?.x ?? 0
      const personIsLeft = personX < unionX
      return {
        id: elkEdge.id,
        source,
        target,
        sourceHandle: personIsLeft ? "right" : "left",
        targetHandle: personIsLeft ? "left" : "right",
        type: "straight",
        style: { strokeWidth: 2, stroke: "var(--edge-spouse)" },
      }
    }

    // A single-parent link (person->child, no union involved) still drops
    // straight down from the parent's bottom — that handle now needs an
    // explicit id since the person node has left/right handles too.
    return {
      id: elkEdge.id,
      source,
      target,
      sourceHandle: source.startsWith(PERSON_PREFIX) ? "bottom" : undefined,
      type: "smoothstep",
      style: { strokeWidth: 2, stroke: "var(--edge-parent-child)" },
    }
  })

  return { nodes, edges }
}

// ELK's layered algorithm places a union node wherever minimizes total edge
// length across both its parent edges and (if any) its child edges — for a
// symmetric couple that objective is flat across the whole span between the
// parents, so it settles on one parent's x rather than the midpoint. Pin the
// union back to the true center of its two parents' current positions (which
// also keeps it centered when a parent has been dragged), in their row
// rather than a layer of its own, so the marriage line reads as coming
// straight across between the couple.
function unionPosition(
  union: UnionNode,
  elkPosition: NodePosition,
  positions: Record<string, NodePosition>
): NodePosition {
  const [parentAId, parentBId] = union.parents
  const posA = positions[personNodeId(parentAId)]
  const posB = positions[personNodeId(parentBId)]
  if (!posA || !posB) return elkPosition

  const centerX = (posA.x + PERSON_WIDTH / 2 + posB.x + PERSON_WIDTH / 2) / 2
  const centerY = (posA.y + posB.y) / 2 + PERSON_HEIGHT / 2
  return { x: centerX - UNION_WIDTH / 2, y: centerY - UNION_HEIGHT / 2 }
}

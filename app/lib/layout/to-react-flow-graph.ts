import type { Edge, Node } from "@xyflow/react"
import type { ElkNode } from "elkjs"

import {
  HANDLE,
  isVertical,
  type LayoutDirection,
} from "~/lib/canvas/layout-direction"
import { computeGenerations } from "~/lib/graph/compute-generations"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { PERSON_PREFIX, UNION_PREFIX, personNodeId } from "~/lib/graph/node-ids"
import { sharedParentLinkSubtype } from "~/lib/graph/parent-links"
import {
  PERSON_HEIGHT,
  PERSON_WIDTH,
  UNION_HEIGHT,
  UNION_WIDTH,
} from "~/lib/graph/to-elk-graph"
import type { NodePosition } from "~/lib/layout/run-layout"
import type { Person, Relationship } from "~/lib/types"

export interface PersonNodeData extends Record<string, unknown> {
  person: Person
  treeId: string
  overridden: boolean
  generation: number
  onBloodline: boolean
}

export interface UnionNodeData extends Record<string, unknown> {
  union: UnionNode
  onBloodline: boolean
}

export interface ToReactFlowGraphOptions {
  graph: ElkNode
  positions: Record<string, NodePosition>
  people: Person[]
  relationships: Relationship[]
  unions: UnionNode[]
  treeId: string
  overriddenNodeIds: string[]
  // Node ids (people and unions) on the highlighted bloodline, if any.
  bloodlineNodeIds?: string[]
  personWidth?: number
  personHeight?: number
  direction?: LayoutDirection
  edgeStrokeWidth?: number
  spouseColor?: string
  parentChildColor?: string
}

export interface ReactFlowGraph {
  nodes: Node[]
  edges: Edge[]
}

// Not user-customisable, unlike the relationship colours: this is a transient
// selection cue, and letting it be recoloured to match one of them would defeat
// the whole point of it standing out.
const BLOODLINE_COLOR = "var(--primary)"

// People/unions missing from the current data (or otherwise deleted)
// shouldn't happen for nodes toElkGraph produced, but a defensive skip is
// cheap insurance against a dangling id rendering a broken card.
export function toReactFlowGraph({
  graph,
  positions,
  people,
  relationships,
  unions,
  treeId,
  overriddenNodeIds,
  bloodlineNodeIds = [],
  personWidth = PERSON_WIDTH,
  personHeight = PERSON_HEIGHT,
  direction = "DOWN",
  edgeStrokeWidth = 2,
  spouseColor = "var(--edge-spouse)",
  parentChildColor = "var(--edge-parent-child)",
}: ToReactFlowGraphOptions): ReactFlowGraph {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const unionsById = new Map(unions.map((u) => [u.id, u]))
  const overridden = new Set(overriddenNodeIds)
  const bloodline = new Set(bloodlineNodeIds)
  const generations = computeGenerations(people, relationships)

  // An edge is on the bloodline only when *both* of its ends are. The other
  // parent of a union on the path is never in the set, so their half of the
  // marriage line correctly stays unhighlighted.
  const onBloodline = (source: string, target: string) =>
    bloodline.size > 0 && bloodline.has(source) && bloodline.has(target)

  // ELK lays the union out in its own layer below the couple (it only ever
  // sees a person->union edge, one layer at a time). We want it sitting
  // between the couple instead — same row, centered — so the marriage line
  // reads as a single horizontal line straight across, not a bent line
  // dropping to a dot below. Resolve every union's real position up front so
  // node placement and edge handle selection (below) agree on where it is.
  const vertical = isVertical(direction)
  const resolvedPositions: Record<string, NodePosition> = { ...positions }
  for (const union of unions) {
    const elkPosition = positions[union.id]
    if (elkPosition) {
      resolvedPositions[union.id] = unionPosition(
        union,
        elkPosition,
        positions,
        personWidth,
        personHeight
      )
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
            generation: generations.get(person.id) ?? 0,
            onBloodline: bloodline.has(elkNode.id),
          } satisfies PersonNodeData,
          width: personWidth,
          height: personHeight,
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
        data: {
          union,
          onBloodline: bloodline.has(elkNode.id),
        } satisfies UnionNodeData,
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
      // Whichever side of the union this parent sits on along the cross axis
      // decides which pair of handles the marriage line uses.
      const personCross = vertical
        ? (resolvedPositions[source]?.x ?? 0)
        : (resolvedPositions[source]?.y ?? 0)
      const unionCross = vertical
        ? (resolvedPositions[target]?.x ?? 0)
        : (resolvedPositions[target]?.y ?? 0)
      const personIsFirst = personCross < unionCross
      // An end date on the spouse relationship is a divorce or separation —
      // already stored, already carried through to UnionNode.end by
      // deriveUnions, and until now never shown.
      const ended = !!unionsById.get(target)?.end
      const highlighted = onBloodline(source, target)
      return {
        id: elkEdge.id,
        source,
        target,
        sourceHandle: personIsFirst ? HANDLE.crossEnd : HANDLE.crossStart,
        targetHandle: personIsFirst ? HANDLE.crossStart : HANDLE.crossEnd,
        type: "straight",
        // Lift the highlighted run above everything else, or a crossing edge
        // drawn later would cut through the glow.
        zIndex: highlighted ? 1 : 0,
        style: {
          strokeWidth: highlighted ? edgeStrokeWidth * 2.5 : edgeStrokeWidth,
          stroke: highlighted ? BLOODLINE_COLOR : spouseColor,
          // Short dashes, distinct from the long dash a non-biological
          // parent-child link uses, so the two never read as the same thing.
          ...(ended ? { strokeDasharray: "3 3" } : {}),
        },
      }
    }

    // A single-parent link (person->child, no union involved) still drops
    // straight down from the parent's bottom — that handle now needs an
    // explicit id since the person node has left/right handles too.
    //
    // The edge's own source/target already say which parents it represents, so
    // the link's subtype is resolvable here without threading a separate
    // relationship map through the layout: a union source means both of its
    // parents, a person source means just that one.
    const childId = target.slice(PERSON_PREFIX.length)
    const parentIds = source.startsWith(UNION_PREFIX)
      ? (unionsById.get(source)?.parents ?? [])
      : [source.slice(PERSON_PREFIX.length)]
    const subtype = sharedParentLinkSubtype(relationships, childId, parentIds)

    const highlighted = onBloodline(source, target)

    return {
      id: elkEdge.id,
      source,
      target,
      sourceHandle: source.startsWith(PERSON_PREFIX)
        ? HANDLE.children
        : undefined,
      type: "smoothstep",
      data: { subtype },
      zIndex: highlighted ? 1 : 0,
      style: {
        strokeWidth: highlighted ? edgeStrokeWidth * 2.5 : edgeStrokeWidth,
        stroke: highlighted ? BLOODLINE_COLOR : parentChildColor,
        // Dashed for any link that isn't by birth. The long dash distinguishes
        // it at a glance from the short dash an ended marriage uses.
        ...(subtype && subtype !== "biological"
          ? { strokeDasharray: "7 5" }
          : {}),
      },
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
  positions: Record<string, NodePosition>,
  personWidth: number,
  personHeight: number
): NodePosition {
  const [parentAId, parentBId] = union.parents
  const posA = positions[personNodeId(parentAId)]
  const posB = positions[personNodeId(parentBId)]
  if (!posA || !posB) return elkPosition

  // The midpoint of the couple's two centres, which needs no direction branch:
  // along the cross axis the two differ and this is the true midpoint, while
  // along the main axis they share a coordinate and it collapses to the centre
  // of their shared row (or column). Both are exactly what we want.
  const centerX = (posA.x + posB.x) / 2 + personWidth / 2
  const centerY = (posA.y + posB.y) / 2 + personHeight / 2
  return { x: centerX - UNION_WIDTH / 2, y: centerY - UNION_HEIGHT / 2 }
}

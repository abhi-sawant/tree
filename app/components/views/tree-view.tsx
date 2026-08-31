import "@xyflow/react/dist/style.css"

import { useEffect, useMemo, useState } from "react"

import {
  CanvasLoadingState,
  EmptyTreeState,
} from "~/components/canvas/canvas-states"
import { DetailPanel } from "~/components/canvas/detail-panel"
import { TreeCanvas } from "~/components/canvas/tree-canvas"
import { bloodlineToRoot } from "~/lib/canvas/bloodline"
import { filterHiddenGenerations } from "~/lib/canvas/filter-generations"
import { personIdsInFocus } from "~/lib/canvas/focus-scope"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveEdgeColor } from "~/lib/canvas/appearance-resolve"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { parseNodeId, personNodeId } from "~/lib/graph/node-ids"
import { toElkGraph } from "~/lib/graph/to-elk-graph"
import { useTreeMembers } from "~/lib/db/hooks"
import { buildLayoutOptions } from "~/lib/layout/run-layout"
import { mergeLayoutPositions } from "~/lib/layout/merge-positions"
import {
  toReactFlowGraph,
  type ReactFlowGraph,
} from "~/lib/layout/to-react-flow-graph"
import { useElkLayout } from "~/lib/layout/use-elk-layout"
import type { Person, Relationship, Tree } from "~/lib/types"

interface TreeViewProps {
  tree: Tree
  people: Person[]
  relationships: Relationship[]
  unions: UnionNode[]
  generations: Map<string, number>
  generationCount: number
  onAddPerson: () => void
}

export function TreeView({
  tree,
  people,
  relationships,
  unions,
  generations,
  generationCount,
  onAddPerson,
}: TreeViewProps) {
  const select = useCanvasUIStore((s) => s.select)
  const hiddenGenerations = useCanvasUIStore((s) => s.hiddenGenerations)
  const resetHiddenGenerations = useCanvasUIStore(
    (s) => s.resetHiddenGenerations
  )
  const focus = useCanvasUIStore((s) => s.focus)
  const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId)
  const showBloodline = useCanvasUIStore((s) => s.showBloodline)
  const appearance = useAppearanceStore((s) => s.settings)
  const treeMembers = useTreeMembers(tree.id)

  // A node selected in a previously-open tree has no meaning in this one,
  // and neither does a generation hidden there.
  useEffect(() => {
    select(null)
    resetHiddenGenerations()
  }, [tree.id, select, resetHiddenGenerations])

  // Focus narrows the membership handed to the layout, rather than filtering
  // the laid-out graph afterwards the way hidden generations do. toElkGraph
  // already scopes purely off membership, so this needs no new filtering layer —
  // and laying out only the people in scope is the point: a focus view should be
  // compact, not the full tree with holes in it.
  const scopedMembers = useMemo(() => {
    if (!treeMembers || !focus) return treeMembers
    const inFocus = personIdsInFocus(relationships, focus)
    const scoped = treeMembers.filter((m) => inFocus.has(m.personId))
    // A focus person who isn't in this tree would scope everyone out and leave
    // an empty canvas; fall back to the whole tree rather than showing nothing.
    return scoped.length > 0 ? scoped : treeMembers
  }, [treeMembers, focus, relationships])

  const graph = useMemo(() => {
    if (!scopedMembers || scopedMembers.length === 0) return undefined
    return toElkGraph({
      people,
      relationships,
      treeMembers: scopedMembers,
      personWidth: appearance.personWidth,
      personHeight: appearance.personHeight,
      horizontalSpacing: appearance.horizontalSpacing,
      direction: appearance.layoutDirection,
    })
  }, [
    scopedMembers,
    people,
    relationships,
    appearance.personWidth,
    appearance.personHeight,
    appearance.horizontalSpacing,
    appearance.layoutDirection,
  ])

  const overriddenNodeIds = useMemo(
    () =>
      (scopedMembers ?? [])
        .filter((m) => m.x !== undefined && m.y !== undefined)
        .map((m) => personNodeId(m.personId)),
    [scopedMembers]
  )

  const bloodlineNodeIds = useMemo(() => {
    if (!showBloodline || !selectedNodeId) return undefined
    const parsed = parseNodeId(selectedNodeId)
    // Only a person anchors a line of descent; a union dot is not a step in one.
    if (parsed?.kind !== "person") return undefined
    const line = bloodlineToRoot(
      relationships,
      parsed.personId,
      tree.rootPersonId
    )
    if (!line) return undefined
    return [...line.personIds.map(personNodeId), ...line.unionIds]
  }, [showBloodline, selectedNodeId, relationships, tree.rootPersonId])

  const layoutOptions = useMemo(
    () =>
      buildLayoutOptions({
        horizontalSpacing: appearance.horizontalSpacing,
        verticalSpacing: appearance.verticalSpacing,
        direction: appearance.layoutDirection,
      }),
    [
      appearance.horizontalSpacing,
      appearance.verticalSpacing,
      appearance.layoutDirection,
    ]
  )

  const { status, positions } = useElkLayout(
    graph,
    overriddenNodeIds,
    layoutOptions
  )

  const mergedPositions = useMemo(() => {
    if (!positions || !scopedMembers) return undefined
    return mergeLayoutPositions(positions, scopedMembers)
  }, [positions, scopedMembers])

  const reactFlowGraph = useMemo(() => {
    if (!graph || !mergedPositions) return undefined
    return toReactFlowGraph({
      graph,
      positions: mergedPositions,
      people,
      relationships,
      unions,
      treeId: tree.id,
      overriddenNodeIds,
      bloodlineNodeIds,
      personWidth: appearance.personWidth,
      personHeight: appearance.personHeight,
      direction: appearance.layoutDirection,
      edgeRouting: appearance.edgeRouting,
      edgeStrokeWidth: appearance.edgeStrokeWidth,
      spouseColor: resolveEdgeColor(appearance.spouseColor, "--edge-spouse"),
      parentChildColor: resolveEdgeColor(
        appearance.parentChildColor,
        "--edge-parent-child"
      ),
    })
  }, [
    graph,
    mergedPositions,
    people,
    relationships,
    unions,
    tree.id,
    overriddenNodeIds,
    bloodlineNodeIds,
    appearance.personWidth,
    appearance.personHeight,
    appearance.edgeStrokeWidth,
    appearance.edgeRouting,
    appearance.layoutDirection,
    appearance.spouseColor,
    appearance.parentChildColor,
  ])

  // Keep showing the last successfully laid-out graph while a recompute is
  // in flight (triggered by any canvas edit), instead of unmounting the
  // whole <TreeCanvas> on every mutation — that reset pan/zoom and flashed a
  // full-screen "Laying out tree…" interstitial for what should be a
  // sub-100ms in-place update. Only the very first load (no graph yet) still
  // shows that interstitial.
  const [lastGoodGraph, setLastGoodGraph] = useState<ReactFlowGraph>()
  useEffect(() => {
    if (status === "done" && reactFlowGraph) setLastGoodGraph(reactFlowGraph)
  }, [status, reactFlowGraph])
  useEffect(() => {
    setLastGoodGraph(undefined)
  }, [tree.id])

  const graphToRender = reactFlowGraph ?? lastGoodGraph
  const visibleGraph = useMemo(
    () =>
      graphToRender
        ? filterHiddenGenerations(graphToRender, hiddenGenerations)
        : undefined,
    [graphToRender, hiddenGenerations]
  )

  if (treeMembers === undefined) {
    return <CanvasLoadingState />
  }

  if (treeMembers.length === 0) {
    return <EmptyTreeState treeName={tree.name} onAddPerson={onAddPerson} />
  }

  if (!visibleGraph) {
    return <CanvasLoadingState label="Laying out tree…" />
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="h-full min-w-0 flex-1">
        <TreeCanvas
          treeId={tree.id}
          generationCount={generationCount}
          people={people}
          nodes={visibleGraph.nodes}
          edges={visibleGraph.edges}
        />
      </div>
      <DetailPanel
        treeId={tree.id}
        people={people}
        relationships={relationships}
        unions={unions}
        generations={generations}
      />
    </div>
  )
}

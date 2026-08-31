import "@xyflow/react/dist/style.css"

import { useEffect, useMemo, useState } from "react"

import {
  CanvasLoadingState,
  EmptyTreeState,
} from "~/components/canvas/canvas-states"
import { DetailPanel } from "~/components/canvas/detail-panel"
import { TreeCanvas } from "~/components/canvas/tree-canvas"
import { filterHiddenGenerations } from "~/lib/canvas/filter-generations"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { personNodeId } from "~/lib/graph/node-ids"
import { toElkGraph } from "~/lib/graph/to-elk-graph"
import { useTreeMembers } from "~/lib/db/hooks"
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
  const treeMembers = useTreeMembers(tree.id)

  // A node selected in a previously-open tree has no meaning in this one,
  // and neither does a generation hidden there.
  useEffect(() => {
    select(null)
    resetHiddenGenerations()
  }, [tree.id, select, resetHiddenGenerations])

  const graph = useMemo(() => {
    if (!treeMembers || treeMembers.length === 0) return undefined
    return toElkGraph({ people, relationships, treeMembers })
  }, [treeMembers, people, relationships])

  const overriddenNodeIds = useMemo(
    () =>
      (treeMembers ?? [])
        .filter((m) => m.x !== undefined && m.y !== undefined)
        .map((m) => personNodeId(m.personId)),
    [treeMembers]
  )

  const { status, positions } = useElkLayout(graph, overriddenNodeIds)

  const mergedPositions = useMemo(() => {
    if (!positions || !treeMembers) return undefined
    return mergeLayoutPositions(positions, treeMembers)
  }, [positions, treeMembers])

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
    })
  }, [
    graph,
    mergedPositions,
    people,
    relationships,
    unions,
    tree.id,
    overriddenNodeIds,
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

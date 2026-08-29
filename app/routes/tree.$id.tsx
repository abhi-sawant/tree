import "@xyflow/react/dist/style.css"

import { ReactFlowProvider } from "@xyflow/react"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"

import {
  CanvasLoadingState,
  EmptyTreeState,
  TreeNotFoundState,
} from "~/components/canvas/canvas-states"
import { DetailPanel } from "~/components/canvas/detail-panel"
import { TreeCanvas } from "~/components/canvas/tree-canvas"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { deriveUnions } from "~/lib/graph/derive-unions"
import { personNodeId } from "~/lib/graph/node-ids"
import { toElkGraph } from "~/lib/graph/to-elk-graph"
import {
  usePeople,
  useRelationships,
  useTreeMembers,
  useTrees,
} from "~/lib/db/hooks"
import { mergeLayoutPositions } from "~/lib/layout/merge-positions"
import {
  toReactFlowGraph,
  type ReactFlowGraph,
} from "~/lib/layout/to-react-flow-graph"
import { useElkLayout } from "~/lib/layout/use-elk-layout"

export default function TreeRoute() {
  const { id } = useParams()
  const select = useCanvasUIStore((s) => s.select)
  const trees = useTrees()
  const tree = useMemo(() => trees?.find((t) => t.id === id), [trees, id])
  const treeMembers = useTreeMembers(id)
  const people = usePeople()
  const relationships = useRelationships()

  // A node selected in a previously-open tree has no meaning in this one.
  useEffect(() => {
    select(null)
  }, [id, select])

  const unions = useMemo(
    () =>
      people && relationships ? deriveUnions(people, relationships).unions : [],
    [people, relationships]
  )

  const graph = useMemo(() => {
    if (!treeMembers || !people || !relationships || treeMembers.length === 0) {
      return undefined
    }
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
    if (!graph || !mergedPositions || !people) return undefined
    return toReactFlowGraph({
      graph,
      positions: mergedPositions,
      people,
      unions,
    })
  }, [graph, mergedPositions, people, unions])

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
  }, [id])

  if (
    trees === undefined ||
    people === undefined ||
    relationships === undefined ||
    treeMembers === undefined
  ) {
    return (
      <div className="h-svh w-full">
        <CanvasLoadingState />
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="h-svh w-full">
        <TreeNotFoundState />
      </div>
    )
  }

  if (treeMembers.length === 0) {
    return (
      <div className="h-svh w-full">
        <EmptyTreeState treeName={tree.name} />
      </div>
    )
  }

  const graphToRender = reactFlowGraph ?? lastGoodGraph

  if (!graphToRender) {
    return (
      <div className="h-svh w-full">
        <CanvasLoadingState label="Laying out tree…" />
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-svh w-full">
        <div className="h-full flex-1">
          <TreeCanvas nodes={graphToRender.nodes} edges={graphToRender.edges} />
        </div>
        <DetailPanel
          treeId={tree.id}
          people={people}
          relationships={relationships}
          unions={unions}
        />
      </div>
    </ReactFlowProvider>
  )
}

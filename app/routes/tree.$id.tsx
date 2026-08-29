import "@xyflow/react/dist/style.css"

import { ReactFlowProvider } from "@xyflow/react"
import { useMemo } from "react"
import { useParams } from "react-router"

import {
  CanvasLoadingState,
  EmptyTreeState,
  TreeNotFoundState,
} from "~/components/canvas/canvas-states"
import { TreeCanvas } from "~/components/canvas/tree-canvas"
import { toElkGraph } from "~/lib/graph/to-elk-graph"
import { usePeople, useRelationships, useTreeMembers, useTrees } from "~/lib/db/hooks"
import { mergeLayoutPositions } from "~/lib/layout/merge-positions"
import { toReactFlowGraph } from "~/lib/layout/to-react-flow-graph"
import { useElkLayout } from "~/lib/layout/use-elk-layout"

export default function TreeRoute() {
  const { id } = useParams()
  const trees = useTrees()
  const tree = useMemo(() => trees?.find((t) => t.id === id), [trees, id])
  const treeMembers = useTreeMembers(id)
  const people = usePeople()
  const relationships = useRelationships()

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
        .map((m) => `person:${m.personId}`),
    [treeMembers],
  )

  const { status, positions } = useElkLayout(graph, overriddenNodeIds)

  const mergedPositions = useMemo(() => {
    if (!positions || !treeMembers) return undefined
    return mergeLayoutPositions(positions, treeMembers)
  }, [positions, treeMembers])

  const reactFlowGraph = useMemo(() => {
    if (!graph || !mergedPositions || !people) return undefined
    return toReactFlowGraph({ graph, positions: mergedPositions, people })
  }, [graph, mergedPositions, people])

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

  if (status !== "done" || !reactFlowGraph) {
    return (
      <div className="h-svh w-full">
        <CanvasLoadingState label="Laying out tree…" />
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="h-svh w-full">
        <TreeCanvas nodes={reactFlowGraph.nodes} edges={reactFlowGraph.edges} />
      </div>
    </ReactFlowProvider>
  )
}

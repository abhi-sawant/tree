import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type OnNodeDrag,
} from "@xyflow/react"
import { Maximize2, Minus, Plus } from "lucide-react"
import { useEffect } from "react"

import { PersonNode } from "~/components/canvas/person-node"
import { TreeToolbar } from "~/components/canvas/tree-toolbar"
import { UnionNode } from "~/components/canvas/union-node"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import {
  resolveEdgeColor,
  resolveGenerationColor,
} from "~/lib/canvas/appearance-resolve"
import { setMemberPosition } from "~/lib/db/members"
import { parseNodeId } from "~/lib/graph/node-ids"

const nodeTypes = { person: PersonNode, union: UnionNode }

interface TreeCanvasProps {
  treeId: string
  generationCount: number
  nodes: Node[]
  edges: Edge[]
}

export function TreeCanvas({
  treeId,
  generationCount,
  nodes,
  edges,
}: TreeCanvasProps) {
  const select = useCanvasUIStore((s) => s.select)
  const appearance = useAppearanceStore((s) => s.settings)
  const legend = [
    {
      color: resolveEdgeColor(
        appearance.parentChildColor,
        "--edge-parent-child"
      ),
      label: "Parent–child",
    },
    {
      color: resolveEdgeColor(appearance.spouseColor, "--edge-spouse"),
      label: "Marriage",
    },
    {
      color: resolveGenerationColor(0, appearance.generationColors),
      label: "Generation colour",
    },
  ]

  const handleNodeDragStop: OnNodeDrag = (_event, node) => {
    const parsed = parseNodeId(node.id)
    if (parsed?.kind !== "person") return
    void setMemberPosition(
      treeId,
      parsed.personId,
      node.position.x,
      node.position.y
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable
      nodesConnectable={false}
      // Selection is ours, not React Flow's: the node array is controlled and
      // we deliberately don't feed node changes back into it, so React Flow's
      // internal selection would never reach the nodes. Click handlers keep
      // the canvas and the detail panel reading from one source of truth.
      elementsSelectable={false}
      onNodeClick={(_event, node) => select(node.id)}
      onPaneClick={() => select(null)}
      onNodeDragStop={handleNodeDragStop}
      fitView
      // Cards are designed at 184x60; letting fitView magnify a small tree
      // past 1:1 blows them up out of all proportion.
      fitViewOptions={{ maxZoom: 1 }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1}
        color="var(--canvas-dot)"
      />
      <TreeToolbar treeId={treeId} generationCount={generationCount} />
      <Panel position="bottom-left">
        <div className="flex gap-3 border border-border bg-card px-2.5 py-2">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="h-0.5 w-2" style={{ background: item.color }} />
              <span className="font-heading text-9-5 font-medium tracking-wider text-muted-foreground uppercase">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <ZoomControls />
      <CenterOnPendingNode nodes={nodes} />
    </ReactFlow>
  )
}

// Honours a centre request made while the canvas was unmounted (switching
// back from the table, or picking someone in the command palette): waits for
// the node to actually exist before asking React Flow to move to it.
function CenterOnPendingNode({ nodes }: { nodes: Node[] }) {
  const { fitView } = useReactFlow()
  const pendingCenterNodeId = useCanvasUIStore((s) => s.pendingCenterNodeId)
  const clearPendingCenter = useCanvasUIStore((s) => s.clearPendingCenter)

  useEffect(() => {
    if (!pendingCenterNodeId) return
    if (!nodes.some((n) => n.id === pendingCenterNodeId)) return
    void fitView({
      nodes: [{ id: pendingCenterNodeId }],
      maxZoom: 1,
      duration: 200,
    })
    clearPendingCenter()
  }, [pendingCenterNodeId, nodes, fitView, clearPendingCenter])

  return null
}

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <Panel position="bottom-right">
      <div className="flex flex-col border border-border bg-card">
        <button
          type="button"
          aria-label="Zoom in"
          className="size-7 cursor-pointer border-b border-border text-13 hover:bg-muted"
          onClick={() => void zoomIn()}
        >
          <Plus className="mx-auto size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className="size-7 cursor-pointer border-b border-border text-13 hover:bg-muted"
          onClick={() => void zoomOut()}
        >
          <Minus className="mx-auto size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Fit view"
          className="size-7 cursor-pointer hover:bg-muted"
          onClick={() => void fitView()}
        >
          <Maximize2 className="mx-auto size-3" />
        </button>
      </div>
    </Panel>
  )
}

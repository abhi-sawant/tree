import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Heart } from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveEdgeColor } from "~/lib/canvas/appearance-resolve"
import { cn } from "~/lib/utils"
import type { UnionNodeData } from "~/lib/layout/to-react-flow-graph"

export type UnionNodeType = Node<UnionNodeData, "union">

export function UnionNode({ id, data }: NodeProps<UnionNodeType>) {
  const select = useCanvasUIStore((s) => s.select)
  const selected = useCanvasUIStore((s) => s.selectedNodeId === id)
  const requestRecordMarriage = useCanvasUIStore((s) => s.requestRecordMarriage)
  const spouseColor = useAppearanceStore((s) =>
    resolveEdgeColor(s.settings.spouseColor, "--edge-spouse")
  )

  function handleRecordMarriage() {
    select(id)
    requestRecordMarriage(data.union.parents)
  }

  const dot = (
    <div
      className={cn(
        "h-full w-full rounded-full",
        selected && "ring-3 ring-primary"
      )}
      style={{ background: spouseColor }}
    />
  )
  const handles = (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        isConnectable={false}
      />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  )

  if (data.union.kind !== "implicit") {
    return (
      <div className="relative h-full w-full">
        {dot}
        {handles}
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="relative h-full w-full">
        {dot}
        {handles}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleRecordMarriage}>
          <Heart /> Record marriage
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

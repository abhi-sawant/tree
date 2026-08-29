import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Heart } from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { cn } from "~/lib/utils"
import type { UnionNodeData } from "~/lib/layout/to-react-flow-graph"

export type UnionNodeType = Node<UnionNodeData, "union">

const dotClassName =
  "h-full w-full rounded-full border border-border bg-muted-foreground/60"

export function UnionNode({ id, data, selected }: NodeProps<UnionNodeType>) {
  const select = useCanvasUIStore((s) => s.select)
  const requestRecordMarriage = useCanvasUIStore((s) => s.requestRecordMarriage)

  function handleRecordMarriage() {
    select(id)
    requestRecordMarriage(data.union.parents)
  }

  const dot = (
    <div
      className={cn(
        dotClassName,
        selected && "ring-2 ring-primary ring-offset-1"
      )}
    />
  )
  const handles = (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
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

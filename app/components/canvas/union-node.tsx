import { Handle, type Node, type NodeProps } from "@xyflow/react"
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
import { HANDLE, directionGeometry } from "~/lib/canvas/layout-direction"

export type UnionNodeType = Node<UnionNodeData, "union">

export function UnionNode({ id, data }: NodeProps<UnionNodeType>) {
  const onBloodline = data.onBloodline
  const geometry = directionGeometry(
    useAppearanceStore((s) => s.settings.layoutDirection)
  )
  const select = useCanvasUIStore((s) => s.select)
  const selected = useCanvasUIStore((s) => s.selectedNodeIds.includes(id))
  const requestRecordMarriage = useCanvasUIStore((s) => s.requestRecordMarriage)
  const spouseColor = useAppearanceStore((s) =>
    resolveEdgeColor(s.settings.spouseColor, "--edge-spouse")
  )

  function handleRecordMarriage() {
    select(id)
    requestRecordMarriage(data.union.parents)
  }

  // A marriage with an end date reads as a hollow ring rather than a filled
  // dot: the same "this connection is no longer current" cue the dashed edge
  // gives, on the one element that stays visible when the couple is far apart.
  const ended = !!data.union.end
  const dot = (
    <div
      className={cn(
        "h-full w-full rounded-full",
        onBloodline && !selected && "ring-2 ring-primary/40",
        selected && "ring-3 ring-primary"
      )}
      style={
        ended
          ? { border: `2px solid ${spouseColor}`, background: "var(--card)" }
          : { background: spouseColor }
      }
      title={ended ? "Marriage ended" : undefined}
    />
  )
  const handles = (
    <>
      <Handle
        type="target"
        position={geometry.crossStartPosition}
        id={HANDLE.crossStart}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={geometry.crossEndPosition}
        id={HANDLE.crossEnd}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={geometry.childrenPosition}
        isConnectable={false}
      />
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

import { Handle, Position } from "@xyflow/react"

export function UnionNode() {
  return (
    <div className="h-full w-full rounded-full border border-border bg-muted-foreground/60">
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}

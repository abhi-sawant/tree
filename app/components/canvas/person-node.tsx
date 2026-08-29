import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { UserRound } from "lucide-react"

import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { formatPartialDate } from "~/lib/partial-date"
import { cn } from "~/lib/utils"
import type { PersonNodeData } from "~/lib/layout/to-react-flow-graph"

export type PersonNodeType = Node<PersonNodeData, "person">

export function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const { person } = data
  const name =
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Unnamed"
  const dates = [
    formatPartialDate(person.birth),
    formatPartialDate(person.death),
  ]
    .filter(Boolean)
    .join(" – ")

  return (
    <div
      className={cn(
        "flex h-full w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-sm",
        selected && "ring-2 ring-primary ring-offset-1"
      )}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <UserRound className="size-6 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {person.isPlaceholder && <PlaceholderBadge />}
        </div>
        {dates && (
          <span className="truncate text-xs text-muted-foreground">
            {dates}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}

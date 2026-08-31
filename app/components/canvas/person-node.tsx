import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { Pin, Users } from "lucide-react"
import { useState } from "react"

import type { AddActionKind } from "~/components/canvas/add-relative-menu"
import { DeletePersonDialog } from "~/components/people/delete-person-dialog"
import { PersonAvatar } from "~/components/people/person-avatar"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { RemoveFromTreeDialog } from "~/components/trees/remove-from-tree-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { clearMemberPosition } from "~/lib/db/members"
import { personNodeId } from "~/lib/graph/node-ids"
import { formatPartialDate } from "~/lib/partial-date"
import { cn } from "~/lib/utils"
import type { PersonNodeData } from "~/lib/layout/to-react-flow-graph"
import { personDisplayName } from "~/lib/person-name"
import { HANDLE, directionGeometry } from "~/lib/canvas/layout-direction"

export type PersonNodeType = Node<PersonNodeData, "person">

const QUICK_ADD: Array<{ kind: AddActionKind; label: string }> = [
  { kind: "add-parent", label: "+ Parent" },
  { kind: "add-spouse", label: "+ Spouse" },
  { kind: "add-child", label: "+ Child" },
  { kind: "add-sibling", label: "+ Sibling" },
]

export function PersonNode({ id, data }: NodeProps<PersonNodeType>) {
  const { person, treeId, overridden, generation, onBloodline } = data
  const geometry = directionGeometry(
    useAppearanceStore((s) => s.settings.layoutDirection)
  )
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  const avatarSize = useAppearanceStore((s) => s.settings.avatarSize)
  const showPhoto = useAppearanceStore((s) => s.settings.showPhoto)
  const showDates = useAppearanceStore((s) => s.settings.showDates)
  const levelColor = resolveGenerationColor(generation, generationColors)
  const requestAddRelative = useCanvasUIStore((s) => s.requestAddRelative)
  // The node array is controlled, so React Flow's own `selected` prop never
  // makes it back onto these nodes — the canvas UI store is the one source
  // of truth for what's selected, on the canvas and in the detail panel alike.
  const selected = useCanvasUIStore((s) => s.selectedNodeId === id)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const name = personDisplayName(person)
  const dates = [
    formatPartialDate(person.birth),
    formatPartialDate(person.death),
  ]
    .filter(Boolean)
    .join(" – ")

  const card = (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2.5 border border-neutral-500 bg-card px-3 text-center",
        // A softer ring than the selection one, so the selected card still
        // reads as the selected card within a highlighted line.
        onBloodline && !selected && "ring-2 ring-primary/40",
        selected && "ring-2 ring-primary"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: levelColor }}
    >
      <Handle
        type="target"
        position={geometry.inPosition}
        id={HANDLE.in}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={geometry.crossStartPosition}
        id={HANDLE.crossStart}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={geometry.crossEndPosition}
        id={HANDLE.crossEnd}
        isConnectable={false}
      />
      {showPhoto && (
        <PersonAvatar
          photoId={person.photoId}
          size="card"
          sizePx={avatarSize}
        />
      )}
      <div className="flex min-w-0 flex-col gap-px">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xl font-semibold">{name}</span>
          {person.isPlaceholder && <PlaceholderBadge />}
          {person.multipleBirthGroup && (
            <Users
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="One of a multiple birth"
            />
          )}
          {overridden && (
            <Pin className="size-3 shrink-0 text-muted-foreground" />
          )}
        </div>
        {showDates && dates && (
          <span className="truncate text-sm text-muted-foreground">
            {dates}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={geometry.childrenPosition}
        id={HANDLE.children}
        isConnectable={false}
      />
    </div>
  )

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Bottom} offset={8}>
        <div className="flex gap-1">
          {QUICK_ADD.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              className="h-6.5 cursor-pointer bg-foreground px-2.25 font-heading text-9-5 font-semibold tracking-widest text-background uppercase hover:bg-foreground/85"
              onClick={() => requestAddRelative(personNodeId(person.id), kind)}
            >
              {label}
            </button>
          ))}
        </div>
      </NodeToolbar>

      <ContextMenu>
        <ContextMenuTrigger className="relative h-full w-full">
          {card}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {overridden && (
            <ContextMenuItem
              onClick={() => void clearMemberPosition(treeId, person.id)}
            >
              <Pin /> Reset position
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() =>
              requestAddRelative(personNodeId(person.id), "add-child")
            }
          >
            + Add child
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() =>
              requestAddRelative(personNodeId(person.id), "add-spouse")
            }
          >
            + Add spouse
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setRemoveOpen(true)}>
            Remove from tree
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete person…
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <RemoveFromTreeDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        person={person}
        treeId={treeId}
      />
      <DeletePersonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        person={person}
      />
    </>
  )
}

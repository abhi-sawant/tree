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
import { NodeActionsSheet } from "~/components/canvas/node-actions-sheet"
import { DeletePersonDialog } from "~/components/people/delete-person-dialog"
import { PersonAvatar } from "~/components/people/person-avatar"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { RemoveFromTreeDialog } from "~/components/trees/remove-from-tree-dialog"
import { Button } from "~/components/ui/button"
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
import { coverPhotoId } from "~/lib/person-photos"
import { useLongPress } from "~/lib/canvas/use-long-press"
import { useIsMobile } from "~/lib/ui/viewport-tier"

export type PersonNodeType = Node<PersonNodeData, "person">

const QUICK_ADD: Array<{ kind: AddActionKind; label: string }> = [
  { kind: "add-parent", label: "+ Parent" },
  { kind: "add-spouse", label: "+ Spouse" },
  { kind: "add-child", label: "+ Child" },
  { kind: "add-sibling", label: "+ Sibling" },
]

export function PersonNode({ id, data }: NodeProps<PersonNodeType>) {
  const { person, treeId, overridden, colorIndex, onBloodline } = data
  const geometry = directionGeometry(
    useAppearanceStore((s) => s.settings.layoutDirection)
  )
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  const avatarSize = useAppearanceStore((s) => s.settings.avatarSize)
  const showPhoto = useAppearanceStore((s) => s.settings.showPhoto)
  const showDates = useAppearanceStore((s) => s.settings.showDates)
  const levelColor = resolveGenerationColor(colorIndex, generationColors)
  const requestAddRelative = useCanvasUIStore((s) => s.requestAddRelative)
  // The node array is controlled, so React Flow's own `selected` prop never
  // makes it back onto these nodes — the canvas UI store is the one source
  // of truth for what's selected, on the canvas and in the detail panel alike.
  const selected = useCanvasUIStore((s) => s.selectedNodeIds.includes(id))
  // The quick-add buttons act on one person, so they appear only when this
  // card is the whole selection — four toolbars floating under a multi-select
  // would each be offering to add a relative to a different person.
  const onlySelected = useCanvasUIStore(
    (s) => s.selectedNodeIds.length === 1 && s.selectedNodeIds[0] === id
  )
  const [removeOpen, setRemoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const isMobile = useIsMobile()
  const longPress = useLongPress(() => setActionsOpen(true))
  const name = personDisplayName(person)
  const dates = [
    formatPartialDate(person.birth),
    formatPartialDate(person.death),
  ]
    .filter(Boolean)
    .join(" – ")

  const card = (
    <div
      // The wrapper React Flow renders around this carries the full spoken
      // label (see lib/canvas/aria-labels.ts); this only has to say whether the
      // card is the selected one, which is otherwise a coloured ring.
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-lg border border-border bg-card px-3 text-center",
        // A softer ring than the selection one, so the selected card still
        // reads as the selected card within a highlighted line.
        onBloodline && !selected && "ring-2 ring-primary/40",
        selected && "ring-2 ring-primary"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: levelColor }}
    >
      {/* Connectable since Phase 5: dragging between handles records a
          relationship. The side pair means a marriage, the in/children pair a
          parent-child link — see lib/canvas/connect-intent.ts. */}
      <Handle
        type="target"
        position={geometry.inPosition}
        id={HANDLE.in}
        className="size-2!"
      />
      <Handle
        type="source"
        position={geometry.crossStartPosition}
        id={HANDLE.crossStart}
        className="size-2!"
      />
      <Handle
        type="source"
        position={geometry.crossEndPosition}
        id={HANDLE.crossEnd}
        className="size-2!"
      />
      {showPhoto && (
        <PersonAvatar
          photoId={coverPhotoId(person)}
          size="card"
          sizePx={avatarSize}
        />
      )}
      <div className="flex min-w-0 flex-col gap-px">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xl font-semibold">{name}</span>
          {person.isPlaceholder && <PlaceholderBadge />}
          {/* Both icons are decoration for a screen reader: "one of a multiple
              birth" and "placed by hand" are already in the card's spoken
              label, and announcing them here as well reads as a second,
              stranger sentence after the first. */}
          {person.multipleBirthGroup && (
            <span aria-hidden title="One of a multiple birth">
              <Users className="size-3.5 shrink-0 text-muted-foreground" />
            </span>
          )}
          {overridden && (
            <span aria-hidden title="Placed by hand">
              <Pin className="size-3 shrink-0 text-muted-foreground" />
            </span>
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
        className="size-2!"
      />
    </div>
  )

  return (
    <>
      <NodeToolbar
        isVisible={onlySelected}
        position={Position.Bottom}
        offset={8}
      >
        <div className="flex gap-1 max-md:gap-1.5">
          {QUICK_ADD.map(({ kind, label }) => (
            <Button
              key={kind}
              type="button"
              size="xs"
              onClick={() => requestAddRelative(personNodeId(person.id), kind)}
            >
              {label}
            </Button>
          ))}
        </div>
      </NodeToolbar>

      {/* Touch gets an explicit long press rather than the context menu's own:
          on the canvas the gesture has to lose to a drag, since the same
          finger on the same card means "pin it here" if it travels and "show
          me the actions" if it doesn't (see lib/canvas/long-press.ts). What it
          opens is a sheet with room to name each action and say what the
          destructive ones do, and it carries what the toolbar and tree menu
          hold on a wide screen — a long press is the only place "focus on this
          person" and "make root" can live on a phone. */}
      {isMobile ? (
        <div className="relative h-full w-full" {...longPress}>
          {card}
        </div>
      ) : (
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
      )}

      {isMobile && (
        <NodeActionsSheet
          open={actionsOpen}
          onOpenChange={setActionsOpen}
          person={person}
          treeId={treeId}
          overridden={overridden}
          onRemoveFromTree={() => setRemoveOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
      )}

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

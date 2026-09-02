import {
  Crosshair,
  Layers,
  Pencil,
  Pin,
  Plus,
  Trash2,
  TreeDeciduous,
  Unlink,
} from "lucide-react"

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetItem,
  SheetTitle,
} from "~/components/ui/sheet"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { clearMemberPosition } from "~/lib/db/members"
import { reassignRoot } from "~/lib/db/trees"
import { personNodeId } from "~/lib/graph/node-ids"
import { formatPartialDate } from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import { toast } from "~/lib/ui/toast-store"
import type { Person } from "~/lib/types"

interface NodeActionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
  treeId: string
  // Whether this card has been dragged to a position of its own.
  overridden: boolean
  onRemoveFromTree: () => void
  onDelete: () => void
}

// The long-press menu, as a sheet. Base UI's ContextMenu already fires on a
// long press, so the gesture was there; what it opened was a 34px-row popup
// anchored at the finger, holding five of the things you can do to a person.
//
// This carries more than the desktop menu does, and deliberately: on a wide
// screen "focus on this person" and "make root" are one click away in the
// toolbar and the tree menu, neither of which exists on a phone. A long press
// is the only place they can live there.
export function NodeActionsSheet({
  open,
  onOpenChange,
  person,
  treeId,
  overridden,
  onRemoveFromTree,
  onDelete,
}: NodeActionsSheetProps) {
  const setFocus = useCanvasUIStore((s) => s.setFocus)
  const requestEdit = useCanvasUIStore((s) => s.requestEdit)
  const requestAddRelative = useCanvasUIStore((s) => s.requestAddRelative)
  const setSelectMode = useCanvasUIStore((s) => s.setSelectMode)
  const toggleSelected = useCanvasUIStore((s) => s.toggleSelected)

  const nodeId = personNodeId(person.id)
  const close = () => onOpenChange(false)
  const run = (action: () => void) => () => {
    close()
    action()
  }

  const dates = [
    formatPartialDate(person.birth),
    formatPartialDate(person.death),
  ]
    .filter(Boolean)
    .join(" – ")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="border-b border-border">
          <SheetTitle>{personDisplayName(person)}</SheetTitle>
          <p className="text-12-5 text-muted-foreground">
            {[dates || "Dates unknown", overridden && "pinned"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-0.5 pt-2">
          {overridden && (
            <SheetItem
              icon={<Pin className="size-4" />}
              label="Reset position"
              detail="Let the layout place this card again"
              onClick={run(() => void clearMemberPosition(treeId, person.id))}
            />
          )}
          <SheetItem
            icon={<Crosshair className="size-4" />}
            label="Focus on this person"
            detail="Hide everyone outside their line"
            onClick={run(() =>
              setFocus({
                personId: person.id,
                mode: "both",
                generations: Infinity,
              })
            )}
          />
          <SheetItem
            icon={<TreeDeciduous className="size-4" />}
            label="Make root of this tree"
            detail="The tree is drawn outward from the root; generations renumber"
            onClick={run(() => {
              void reassignRoot(treeId, person.id).then(
                () => toast(`${personDisplayName(person)} is now the root`),
                // reassignRoot refuses for someone who isn't a member, which
                // can't happen from a card on this canvas — but the data can
                // change under a long press, in this tab or another.
                () => toast("Couldn't change the root — please try again.")
              )
            })}
          />
          <SheetItem
            icon={<Pencil className="size-4" />}
            label="Edit details"
            onClick={run(() => requestEdit(nodeId))}
          />
          <SheetItem
            icon={<Plus className="size-4" />}
            label="Add relative"
            onClick={run(() => requestAddRelative(nodeId, "add-child"))}
          />
          <SheetItem
            icon={<Layers className="size-4" />}
            label="Select several"
            detail="Start gathering cards to align or move together"
            onClick={run(() => {
              setSelectMode(true)
              toggleSelected(nodeId)
            })}
          />

          <div className="my-2 h-px bg-border" />

          <SheetItem
            icon={<Unlink className="size-4" />}
            label="Remove from this tree"
            detail="Stays in your people library"
            onClick={run(onRemoveFromTree)}
          />
          <SheetItem
            destructive
            icon={<Trash2 className="size-4" />}
            label="Delete person"
            detail="From every tree. Cannot be undone"
            onClick={run(onDelete)}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

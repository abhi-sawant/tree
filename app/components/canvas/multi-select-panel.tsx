import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { alignTargets, type AlignMode } from "~/lib/canvas/align"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useTrees } from "~/lib/db/hooks"
import { setMemberPosition } from "~/lib/db/members"
import {
  PersonIsRootOfTreeError,
  addPersonToTree,
  removeMember,
} from "~/lib/db/trees"
import { toast } from "~/lib/ui/toast-store"
import type { Person } from "~/lib/types"

export interface MultiSelectPanelProps {
  treeId: string
  // People only — a union dot is derived from its couple and has nothing to
  // add, remove or align.
  selectedPeople: Person[]
  positions: Map<string, { x: number; y: number }>
}

export function MultiSelectPanel({
  treeId,
  selectedPeople,
  positions,
}: MultiSelectPanelProps) {
  const clearSelection = useCanvasUIStore((s) => s.select)
  const trees = useTrees()
  const otherTrees = (trees ?? []).filter((tree) => tree.id !== treeId)

  async function handleAlign(mode: AlignMode) {
    const targets = selectedPeople
      .map((person) => {
        const position = positions.get(person.id)
        return position ? { personId: person.id, ...position } : undefined
      })
      .filter((t): t is { personId: string; x: number; y: number } => !!t)

    const moved = alignTargets(targets, mode)
    if (moved.length === 0) {
      toast("Already aligned")
      return
    }
    // Writing a position override is what pins these cards: an aligned row
    // that the next automatic layout could shuffle again would not have been
    // aligned at all.
    for (const target of moved) {
      await setMemberPosition(treeId, target.personId, target.x, target.y)
    }
    toast(moved.length === 1 ? "1 card moved" : `${moved.length} cards moved`)
  }

  async function handleAddToTree(targetTreeId: string, name: string) {
    for (const person of selectedPeople) {
      await addPersonToTree(targetTreeId, person.id)
    }
    toast(`Added ${countLabel(selectedPeople.length)} to ${name}`)
  }

  async function handleRemoveFromTree() {
    let removed = 0
    let blocked = 0
    for (const person of selectedPeople) {
      try {
        await removeMember(treeId, person.id)
        removed++
      } catch (error) {
        // The tree's root can't be removed from it. Skipping and saying so is
        // better than refusing the whole batch over one member — but it has to
        // be said, or the count silently disagrees with what was selected.
        if (error instanceof PersonIsRootOfTreeError) blocked++
        else throw error
      }
    }
    clearSelection(null)
    if (blocked > 0) {
      toast(
        `Removed ${countLabel(removed)} — the tree's root was left in place.`
      )
    } else {
      toast(`Removed ${countLabel(removed)} from this tree`)
    }
  }

  // A strip above the canvas rather than a floating React Flow Panel. The tree
  // toolbar already spans nearly the full width at the top, and the legend and
  // zoom controls take the bottom corners, so every floating position collided
  // with something. Reserving a row also means the bar can never cover a card.
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
      <span className="font-heading text-10 font-semibold tracking-widest uppercase">
        {countLabel(selectedPeople.length)} selected
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs">
              Align
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => void handleAlign("tops")}>
            Align tops
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleAlign("left-edges")}>
            Align left edges
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="xs"
              disabled={otherTrees.length === 0}
            >
              Add to tree
            </Button>
          }
        />
        <DropdownMenuContent>
          {otherTrees.map((tree) => (
            <DropdownMenuItem
              key={tree.id}
              onClick={() => void handleAddToTree(tree.id, tree.name)}
            >
              {tree.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="xs"
        onClick={() => void handleRemoveFromTree()}
      >
        Remove from this tree
      </Button>

      <Button variant="ghost" size="xs" onClick={() => clearSelection(null)}>
        Clear
      </Button>
    </div>
  )
}

function countLabel(count: number): string {
  return count === 1 ? "1 person" : `${count} people`
}

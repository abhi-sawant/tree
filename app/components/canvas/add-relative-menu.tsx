import { ChevronDown } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { UnionNode } from "~/lib/graph/derive-unions"
import type { Person } from "~/lib/types"

export type AddActionKind =
  "add-parent" | "add-spouse" | "add-child" | "add-sibling"
export type AddActionMode = "new" | "existing"
export interface AddAction {
  kind: AddActionKind
  mode: AddActionMode | "record-marriage"
}

interface AddRelativeMenuProps {
  selection:
    { kind: "person"; person: Person } | { kind: "union"; union: UnionNode }
  parentCount: number
  onOpenAction: (action: AddAction) => void
}

interface ActionConfig {
  kind: AddActionKind
  label: string
}

const PERSON_ACTIONS: ActionConfig[] = [
  { kind: "add-parent", label: "Add parent" },
  { kind: "add-spouse", label: "Add spouse" },
  { kind: "add-child", label: "Add child" },
  { kind: "add-sibling", label: "Add sibling" },
]

const UNION_ACTIONS: ActionConfig[] = [
  { kind: "add-child", label: "Add child" },
]

export function AddRelativeMenu({
  selection,
  parentCount,
  onOpenAction,
}: AddRelativeMenuProps) {
  const actions = selection.kind === "union" ? UNION_ACTIONS : PERSON_ACTIONS

  const parentsFull = parentCount >= 2
  // The reason a button is disabled has to be readable, not hovered: a tooltip
  // is the one affordance a touch screen simply does not have, and "why can't
  // I add a parent" is a question the answer to which is a rule of the data
  // model (D7: two parents per child), not an obvious fact.
  const parentsFullReason =
    selection.kind === "person"
      ? `${selection.person.givenName} already has two parents recorded. Remove one first.`
      : "Two parents are already recorded."

  return (
    <div className="flex flex-col gap-2 pt-4">
      <p className="text-sm font-semibold text-muted-foreground">
        Add relative
        {parentsFull && (
          <span className="ml-1.5 font-normal">· 2 of 2 parents</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const disabled = action.kind === "add-parent" && parentCount >= 2

          if (disabled) {
            return (
              <Tooltip key={action.kind}>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="sm" disabled>
                      {action.label}
                    </Button>
                  }
                />
                <TooltipContent>{parentsFullReason}</TooltipContent>
              </Tooltip>
            )
          }

          return (
            <DropdownMenu key={action.kind}>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    {action.label}
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() =>
                    onOpenAction({ kind: action.kind, mode: "new" })
                  }
                >
                  New person
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onOpenAction({ kind: action.kind, mode: "existing" })
                  }
                >
                  Existing person
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
      </div>
      {/* The tooltip's text, written out where a finger can read it. Shown
          below `md` only, so a mouse user still gets it on hover and doesn't
          also get a line of prose they didn't ask for. */}
      {parentsFull && (
        <p className="hidden text-12-5 leading-snug text-muted-foreground max-md:block">
          {parentsFullReason}
        </p>
      )}
    </div>
  )
}

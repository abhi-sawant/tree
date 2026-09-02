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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Add relative
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
                <TooltipContent>
                  {selection.kind === "person" &&
                    `${selection.person.givenName} already has 2 parents recorded.`}
                </TooltipContent>
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
    </div>
  )
}

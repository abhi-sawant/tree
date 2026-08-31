import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { Person } from "~/lib/types"

interface PersonRowActionsProps {
  person: Person
  onOpenInTree: (person: Person) => void
  onEdit: (person: Person) => void
  onDelete: (person: Person) => void
  onAddToTree: (person: Person) => void
  onRemoveFromTree: (person: Person) => void
  onMerge: (person: Person) => void
}

export function PersonRowActions({
  person,
  onOpenInTree,
  onEdit,
  onDelete,
  onAddToTree,
  onRemoveFromTree,
  onMerge,
}: PersonRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontalIcon />
            <span className="sr-only">Actions for {person.givenName}</span>
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onOpenInTree(person)}>
          Open in tree
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(person)}>
          Edit details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddToTree(person)}>
          Add to tree
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRemoveFromTree(person)}>
          Remove from tree
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMerge(person)}>
          Merge with…
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(person)}
        >
          Delete person…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

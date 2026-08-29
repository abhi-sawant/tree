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
  onEdit: (person: Person) => void
  onDelete: (person: Person) => void
  onAddToTree: (person: Person) => void
}

export function PersonRowActions({
  person,
  onEdit,
  onDelete,
  onAddToTree,
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
        <DropdownMenuItem onClick={() => onEdit(person)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddToTree(person)}>Add to tree</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(person)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

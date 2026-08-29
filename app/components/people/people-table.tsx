import { PersonRowActions } from "~/components/people/people-row-actions"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { Badge } from "~/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { formatPartialDate } from "~/lib/partial-date"
import type { Person, Tree } from "~/lib/types"

interface PeopleTableProps {
  people: Person[]
  treesByPersonId: Map<string, Tree[]>
  onEdit: (person: Person) => void
  onDelete: (person: Person) => void
  onAddToTree: (person: Person) => void
}

export function PeopleTable({
  people,
  treesByPersonId,
  onEdit,
  onDelete,
  onAddToTree,
}: PeopleTableProps) {
  if (people.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No people found.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Birth</TableHead>
          <TableHead>Death</TableHead>
          <TableHead>Trees</TableHead>
          <TableHead className="w-0">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => {
          const trees = treesByPersonId.get(person.id) ?? []
          return (
            <TableRow key={person.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {[person.givenName, person.familyName].filter(Boolean).join(" ")}
                  {person.isPlaceholder && <PlaceholderBadge />}
                </div>
              </TableCell>
              <TableCell>{formatPartialDate(person.birth) || "—"}</TableCell>
              <TableCell>{formatPartialDate(person.death) || "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {trees.length > 0
                    ? trees.map((tree) => (
                        <Badge key={tree.id} variant="secondary">
                          {tree.name}
                        </Badge>
                      ))
                    : "—"}
                </div>
              </TableCell>
              <TableCell>
                <PersonRowActions
                  person={person}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddToTree={onAddToTree}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

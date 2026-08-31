import { PersonAvatar } from "~/components/people/person-avatar"
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

const GENERATION_LEVELS = 6

function relativesSummary(counts: RelativeCounts): string {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`
  return [
    plural(counts.parents, "parent"),
    plural(counts.spouses, "spouse"),
    plural(counts.children, "child").replace("childs", "children"),
  ].join(" · ")
}

export interface RelativeCounts {
  parents: number
  spouses: number
  children: number
}

interface PeopleTableProps {
  people: Person[]
  treesByPersonId: Map<string, Tree[]>
  generations: Map<string, number>
  relativeCounts: Map<
    string,
    { parents: number; spouses: number; children: number }
  >
  onOpenInTree: (person: Person) => void
  onEdit: (person: Person) => void
  onDelete: (person: Person) => void
  onAddToTree: (person: Person) => void
  onRemoveFromTree: (person: Person) => void
}

export function PeopleTable({
  people,
  treesByPersonId,
  generations,
  relativeCounts,
  onOpenInTree,
  onEdit,
  onDelete,
  onAddToTree,
  onRemoveFromTree,
}: PeopleTableProps) {
  if (people.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No people found.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Born</TableHead>
          <TableHead>Died</TableHead>
          <TableHead>Generation</TableHead>
          <TableHead>Trees</TableHead>
          <TableHead>Relatives</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => {
          const trees = treesByPersonId.get(person.id) ?? []
          const generation = generations.get(person.id)
          const counts = relativeCounts.get(person.id)
          return (
            <TableRow key={person.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <PersonAvatar photoId={person.photoId} size="sm" />
                  <button
                    type="button"
                    className="cursor-pointer text-13 font-medium hover:underline"
                    onClick={() => onOpenInTree(person)}
                  >
                    {[person.givenName, person.familyName]
                      .filter(Boolean)
                      .join(" ") || "Unnamed"}
                  </button>
                  {person.isPlaceholder && <PlaceholderBadge />}
                </div>
              </TableCell>
              <TableCell>{formatPartialDate(person.birth) || "—"}</TableCell>
              <TableCell>{formatPartialDate(person.death) || "—"}</TableCell>
              <TableCell>
                {generation === undefined ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-heading text-10 font-medium tracking-widest uppercase">
                    <span
                      className="size-2 rounded-xs"
                      style={{
                        background: `var(--level-${generation % GENERATION_LEVELS})`,
                      }}
                    />
                    Gen {generation + 1}
                  </span>
                )}
              </TableCell>
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
              <TableCell className="text-xs text-muted-foreground">
                {counts ? relativesSummary(counts) : "—"}
              </TableCell>
              <TableCell>
                <PersonRowActions
                  person={person}
                  onOpenInTree={onOpenInTree}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddToTree={onAddToTree}
                  onRemoveFromTree={onRemoveFromTree}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

import { EditableCell } from "~/components/people/editable-cell"
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
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { formatPartialDate } from "~/lib/partial-date"
import { useState } from "react"
import type { Person, Tree } from "~/lib/types"
import { personDisplayName, personNameSegments } from "~/lib/person-name"
import type { InlineField } from "~/lib/people/inline-edit"

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
  onMerge: (person: Person) => void
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
  onMerge,
}: PeopleTableProps) {
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  // One cell at a time, held here rather than per row: opening a second
  // editor has to close the first, and a row that owned its own state would
  // leave two inputs open at once.
  const [editing, setEditing] = useState<
    { personId: string; field: InlineField } | undefined
  >(undefined)
  const isEditing = (personId: string, field: InlineField) =>
    editing?.personId === personId && editing.field === field

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
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer"
                    onClick={() => onOpenInTree(person)}
                    aria-label={`Open ${personDisplayName(person)} in the tree`}
                    title="Open in tree"
                  >
                    <PersonAvatar photoId={person.photoId} size="sm" />
                  </button>
                  {/* Given, nickname and family laid out in personNameSegments'
                      order, so the editable cell can't drift from the way the
                      same name is assembled everywhere else. */}
                  <div className="flex min-w-0 flex-1 items-center gap-1 text-13 font-medium">
                    <EditableCell
                      person={person}
                      field="givenName"
                      editing={isEditing(person.id, "givenName")}
                      onEditingChange={(on) =>
                        setEditing(
                          on
                            ? { personId: person.id, field: "givenName" }
                            : undefined
                        )
                      }
                      onTabToNext={() =>
                        setEditing({ personId: person.id, field: "familyName" })
                      }
                    />
                    {personNameSegments(person).nickname && (
                      <span className="shrink-0 text-muted-foreground">
                        {personNameSegments(person).nickname}
                      </span>
                    )}
                    <EditableCell
                      person={person}
                      field="familyName"
                      placeholder="—"
                      editing={isEditing(person.id, "familyName")}
                      onEditingChange={(on) =>
                        setEditing(
                          on
                            ? { personId: person.id, field: "familyName" }
                            : undefined
                        )
                      }
                      onTabToNext={() =>
                        setEditing({ personId: person.id, field: "birthYear" })
                      }
                    />
                  </div>
                  {person.isPlaceholder && <PlaceholderBadge />}
                </div>
              </TableCell>
              <TableCell>
                <EditableCell
                  person={person}
                  field="birthYear"
                  editing={isEditing(person.id, "birthYear")}
                  onEditingChange={(on) =>
                    setEditing(
                      on
                        ? { personId: person.id, field: "birthYear" }
                        : undefined
                    )
                  }
                  onTabToNext={() =>
                    setEditing({ personId: person.id, field: "deathYear" })
                  }
                />
              </TableCell>
              <TableCell>
                <EditableCell
                  person={person}
                  field="deathYear"
                  editing={isEditing(person.id, "deathYear")}
                  onEditingChange={(on) =>
                    setEditing(
                      on
                        ? { personId: person.id, field: "deathYear" }
                        : undefined
                    )
                  }
                />
              </TableCell>
              <TableCell>
                {generation === undefined ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-heading text-10 font-medium tracking-widest uppercase">
                    <span
                      className="size-2 rounded-xs"
                      style={{
                        background: resolveGenerationColor(
                          generation,
                          generationColors
                        ),
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
                  onMerge={onMerge}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

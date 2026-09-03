import { useState } from "react"

import { PersonAvatar } from "~/components/people/person-avatar"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { Button } from "~/components/ui/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetItem,
  SheetTitle,
} from "~/components/ui/sheet"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { formatPartialDate } from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId } from "~/lib/person-photos"
import type { RelativeCounts } from "~/components/people/people-table"
import type { Person, Tree } from "~/lib/types"

interface PeopleListProps {
  people: Person[]
  treesByPersonId: Map<string, Tree[]>
  generations: Map<string, number>
  relativeCounts: Map<string, RelativeCounts>
  onOpenInTree: (person: Person) => void
  onEdit: (person: Person) => void
  onDelete: (person: Person) => void
  onAddToTree: (person: Person) => void
  onRemoveFromTree: (person: Person) => void
  onMerge: (person: Person) => void
}

// The table as a list. Seven nowrap columns come to roughly 1000px of natural
// width, so on a phone the table degrades to a horizontally-scrolling strip
// where nothing is comparable and the actions are always off-screen.
//
// A row keeps the facts the columns carried, in the order a reader scans them:
// who, when, and what makes them findable — generation, children, and the
// other trees they appear in, which is the fact that explains why deleting
// them matters. Editing a field is not offered here: the four editable cells
// are a mouse-and-Tab affordance built around a hover target, and "edit
// details" opens the form that labels every field.
export function PeopleList({
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
}: PeopleListProps) {
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  const [actionsFor, setActionsFor] = useState<Person | undefined>(undefined)

  if (people.length === 0) return null

  return (
    <>
      <ul className="flex flex-col">
        {people.map((person) => {
          const generation = generations.get(person.id)
          const counts = relativeCounts.get(person.id)
          const trees = treesByPersonId.get(person.id) ?? []
          const dates = [
            formatPartialDate(person.birth),
            formatPartialDate(person.death),
          ].filter(Boolean)

          const facts = [
            dates.length === 2
              ? dates.join(" – ")
              : dates.length === 1
                ? `${person.death ? "d." : "b."} ${dates[0]}`
                : "No dates",
            generation !== undefined ? `G${generation + 1}` : undefined,
            counts && counts.children > 0
              ? `${counts.children} ${counts.children === 1 ? "child" : "children"}`
              : undefined,
            trees.length > 1 ? `in ${trees.length} trees` : undefined,
          ].filter(Boolean)

          return (
            <li
              key={person.id}
              className="flex items-center gap-3 border-b border-border last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onOpenInTree(person)}
                className="flex min-h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 pr-1 text-left"
              >
                <PersonAvatar photoId={coverPhotoId(person)} size="md" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-15 font-medium">
                      {personDisplayName(person)}
                    </span>
                    {person.isPlaceholder && <PlaceholderBadge />}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-12-5 text-muted-foreground">
                    {generation !== undefined && (
                      <span
                        className="size-2 flex-none rounded-full"
                        style={{
                          background: resolveGenerationColor(
                            generation,
                            generationColors
                          ),
                        }}
                      />
                    )}
                    {facts.join(" · ")}
                  </span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${personDisplayName(person)}`}
                onClick={() => setActionsFor(person)}
              >
                ⋯
              </Button>
            </li>
          )
        })}
      </ul>

      <Sheet
        open={!!actionsFor}
        onOpenChange={(open) => !open && setActionsFor(undefined)}
      >
        <SheetContent>
          {actionsFor && (
            <>
              <SheetHeader className="border-b border-border">
                <SheetTitle>{personDisplayName(actionsFor)}</SheetTitle>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-0.5 pt-2">
                {/* The same six actions as the row menu on a wide screen, in
                    the same order — one list of things you can do to a person,
                    whatever is holding it. */}
                <RowAction
                  label="Open in tree"
                  person={actionsFor}
                  onSelect={onOpenInTree}
                  onDone={() => setActionsFor(undefined)}
                />
                <RowAction
                  label="Edit details"
                  person={actionsFor}
                  onSelect={onEdit}
                  onDone={() => setActionsFor(undefined)}
                />
                <RowAction
                  label="Add to another tree"
                  person={actionsFor}
                  onSelect={onAddToTree}
                  onDone={() => setActionsFor(undefined)}
                />
                <RowAction
                  label="Remove from a tree"
                  person={actionsFor}
                  onSelect={onRemoveFromTree}
                  onDone={() => setActionsFor(undefined)}
                />
                <RowAction
                  label="Merge with…"
                  person={actionsFor}
                  onSelect={onMerge}
                  onDone={() => setActionsFor(undefined)}
                />
                <div className="my-2 h-px bg-border" />
                <RowAction
                  destructive
                  label="Delete person"
                  detail="From every tree. Cannot be undone"
                  person={actionsFor}
                  onSelect={onDelete}
                  onDone={() => setActionsFor(undefined)}
                />
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function RowAction({
  label,
  detail,
  destructive,
  person,
  onSelect,
  onDone,
}: {
  label: string
  detail?: string
  destructive?: boolean
  person: Person
  onSelect: (person: Person) => void
  onDone: () => void
}) {
  return (
    <SheetItem
      label={label}
      detail={detail}
      destructive={destructive}
      onClick={() => {
        onDone()
        onSelect(person)
      }}
    />
  )
}

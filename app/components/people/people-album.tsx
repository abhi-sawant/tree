import { PersonRowActions } from "~/components/people/people-row-actions"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { PrintPhoto } from "~/components/people/print-photo"
import { formatPartialDate } from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId } from "~/lib/person-photos"
import type { Person } from "~/lib/types"

interface PeopleAlbumProps {
  people: Person[]
  // Any CSS colour per person: the tile behind the initials, chosen by the
  // same colour grouping the tree uses.
  colorOf: (person: Person) => string
  onOpenInTree: (person: Person) => void
  onEdit: (person: Person) => void
  onDelete: (person: Person) => void
  onAddToTree: (person: Person) => void
  onRemoveFromTree: (person: Person) => void
  onMerge: (person: Person) => void
}

function initialsOf(person: Person): string {
  if (person.isPlaceholder) return "?"
  return (
    [person.givenName, person.familyName]
      .map((part) => part?.trim()[0])
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?"
  )
}

// The people list as a page of prints, the same cards the tree draws. Opening
// one centres it in the tree; the ⋯ menu is the same six actions the table's
// rows carry.
export function PeopleAlbum({ people, colorOf, ...actions }: PeopleAlbumProps) {
  if (people.length === 0) return null

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4.5 gap-y-5 max-md:grid-cols-2">
      {people.map((person) => {
        const name = personDisplayName(person)
        const dates = [
          formatPartialDate(person.birth),
          formatPartialDate(person.death),
        ]
          .filter(Boolean)
          .join(" – ")
        return (
          <li key={person.id} className="group/print relative">
            <button
              type="button"
              onClick={() => actions.onOpenInTree(person)}
              aria-label={`${name}${dates ? `, ${dates}` : ""} — open in tree`}
              className="flex h-56 w-full cursor-pointer flex-col rounded-xl bg-card p-2 text-left shadow-card transition-all hover:-translate-y-1 hover:shadow-float max-md:h-52"
            >
              <PrintPhoto
                photoId={coverPhotoId(person)}
                initials={initialsOf(person)}
                color={colorOf(person)}
              />
              <span className="flex flex-none flex-col items-center gap-px px-1 pt-2 pb-1.5 text-center">
                <span className="flex max-w-full items-center gap-1.5">
                  <span className="truncate font-heading text-15 font-bold">
                    {name}
                  </span>
                  {person.isPlaceholder && <PlaceholderBadge />}
                </span>
                <span className="max-w-full truncate text-12-5 font-medium text-muted-foreground">
                  {dates || "No dates"}
                </span>
              </span>
            </button>
            <div className="absolute top-3.5 right-3.5 rounded-lg bg-card/90 opacity-0 transition-opacity group-focus-within/print:opacity-100 group-hover/print:opacity-100 max-md:opacity-100 coarse:opacity-100">
              <PersonRowActions person={person} {...actions} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

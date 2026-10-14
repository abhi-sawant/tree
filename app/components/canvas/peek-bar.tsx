import { Plus } from "lucide-react"

import type { AddActionKind } from "~/components/canvas/add-relative-menu"
import { PrintPhoto } from "~/components/people/print-photo"
import { Button } from "~/components/ui/button"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { personNodeId } from "~/lib/graph/node-ids"
import { formatPartialDate } from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId } from "~/lib/person-photos"
import type { Person, Relationship } from "~/lib/types"

const ADDS: Array<{ kind: AddActionKind; label: string }> = [
  { kind: "add-parent", label: "Parent" },
  { kind: "add-spouse", label: "Partner" },
  { kind: "add-child", label: "Child" },
  { kind: "add-sibling", label: "Sibling" },
]

interface PeekBarProps {
  person: Person
  relationships: Relationship[]
  // The person's card colour, so the tile here matches the one on the canvas.
  color: string
}

// What a selection raises on a wide screen: who this is, the four ways to
// grow their family, and the way into their full record. It lives under the
// canvas rather than beside it so the tree keeps its width until someone asks
// to read or edit a whole person.
export function PeekBar({ person, relationships, color }: PeekBarProps) {
  const requestAddRelative = useCanvasUIStore((s) => s.requestAddRelative)
  const openProfile = useCanvasUIStore((s) => s.openProfile)

  const partners = relationships.filter(
    (r) => r.type === "spouse" && (r.from === person.id || r.to === person.id)
  ).length
  const children = relationships.filter(
    (r) => r.type === "parent-child" && r.from === person.id
  ).length
  const born = formatPartialDate(person.birth)
  const died = formatPartialDate(person.death)
  const facts = [
    born ? `born ${born}` : undefined,
    died ? `died ${died}` : undefined,
    partners > 0
      ? `${partners} ${partners === 1 ? "partner" : "partners"}`
      : undefined,
    children > 0
      ? `${children} ${children === 1 ? "child" : "children"}`
      : undefined,
  ].filter(Boolean)

  const initials =
    [person.givenName, person.familyName]
      .map((part) => part?.trim()[0])
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?"

  return (
    <section
      data-print="hide"
      aria-label="Selected person"
      className="flex flex-none items-center gap-5 border-t border-border bg-card px-6 py-3"
    >
      <div className="flex h-14 w-14 flex-none flex-col rounded-lg bg-card p-1 shadow-card">
        <PrintPhoto
          small
          photoId={coverPhotoId(person)}
          initials={person.isPlaceholder ? "?" : initials}
          color={color}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <h2 className="truncate font-heading text-xl leading-tight font-semibold">
          {personDisplayName(person)}
        </h2>
        <p className="truncate text-13 font-medium text-muted-foreground">
          {facts.join(" · ") || "No dates or relatives recorded yet"}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="mr-1 text-13 font-bold text-muted-foreground">
          Add
        </span>
        {ADDS.map(({ kind, label }) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            onClick={() => requestAddRelative(personNodeId(person.id), kind)}
          >
            <Plus /> {label}
          </Button>
        ))}
      </div>
      <Button size="lg" onClick={openProfile}>
        Open profile
      </Button>
    </section>
  )
}

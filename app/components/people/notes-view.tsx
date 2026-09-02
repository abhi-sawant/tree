import { useMemo } from "react"

import { MarkdownView } from "~/components/markdown/markdown-view"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { personNodeId } from "~/lib/graph/node-ids"
import { NameIndex } from "~/lib/people/name-index"
import type { Person } from "~/lib/types"

interface NotesViewProps {
  notes: string
  // The whole pool, not just this tree: a note can name a relative who hasn't
  // been added to the open canvas, and the link should still say who they are.
  people: Person[]
}

// A person's note, rendered by the shared Markdown walker with the one thing
// that is specific to a note supplied here: what [[a name in brackets]] means.
// The walker builds React elements from parsed data and never an HTML string,
// which is what makes it safe for a note to contain angle brackets.
export function NotesView({ notes, people }: NotesViewProps) {
  const index = useMemo(() => new NameIndex(people), [people])
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)

  return (
    <MarkdownView
      source={notes}
      empty={<p className="text-13 text-muted-foreground">No notes yet.</p>}
      renderPerson={(name) => {
        const resolved = index.resolve(name)
        if (!resolved.ok) {
          // Shown, not hidden, and it says which kind of wrong it is. A link to
          // a name nobody has is usually a typo the reader can fix; one to a
          // name two people share needs them to decide which. Silently
          // rendering either as plain text would leave a note that looks fine
          // and links to nobody.
          return (
            <span
              className="border-b border-dotted border-muted-foreground text-muted-foreground"
              title={
                resolved.reason === "ambiguous"
                  ? `More than one person is called “${name}”, so this link can't point at one of them.`
                  : `No one in this file is called “${name}”.`
              }
            >
              {name}
            </span>
          )
        }
        return (
          <button
            type="button"
            className="cursor-pointer text-primary underline underline-offset-2"
            onClick={() => requestCenter(personNodeId(resolved.id))}
          >
            {name}
          </button>
        )
      }}
    />
  )
}

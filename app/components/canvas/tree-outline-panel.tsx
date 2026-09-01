import { X } from "lucide-react"
import { useMemo } from "react"

import { Button } from "~/components/ui/button"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import {
  buildTreeOutline,
  outlinePersonCount,
  type OutlineEntry,
} from "~/lib/canvas/tree-outline"
import { personNodeId } from "~/lib/graph/node-ids"
import { cn } from "~/lib/utils"
import type { Person, Relationship } from "~/lib/types"

const RELATION_PREFIX = {
  start: "",
  spouse: "Married: ",
  child: "Child: ",
} as const

interface TreeOutlinePanelProps {
  people: Person[]
  relationships: Relationship[]
  // The people with a card on screen right now, taken from the rendered node
  // array — so focus scoping and hidden generations narrow the outline exactly
  // as they narrow the canvas. An outline listing people who are not drawn
  // would be describing a different tree.
  memberIds: Set<string>
}

// The canvas as a nested list.
//
// Rendered outside React Flow's role="application" subtree on purpose: inside
// it, a screen reader's browse mode is suppressed and a list is not a list. It
// also sits before the canvas in the DOM, so Tab reaches the way through the
// tree before the tree itself.
export function TreeOutlinePanel({
  people,
  relationships,
  memberIds,
}: TreeOutlinePanelProps) {
  const toggleOutline = useCanvasUIStore((s) => s.toggleOutline)

  const outline = useMemo(
    () => buildTreeOutline({ people, relationships, memberIds }),
    [people, relationships, memberIds]
  )
  const named = outlinePersonCount(outline)

  return (
    <aside
      data-print="hide"
      aria-labelledby="tree-outline-heading"
      className="flex w-72 flex-none flex-col border-r border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2
          id="tree-outline-heading"
          className="font-heading text-10 font-semibold tracking-widest uppercase"
        >
          Tree outline
        </h2>
        <span className="text-10 text-muted-foreground">
          {named} {named === 1 ? "person" : "people"}
        </span>
        <Button
          variant="ghost"
          size="xs"
          aria-label="Hide the tree outline"
          className="ml-auto"
          onClick={toggleOutline}
        >
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {outline.length === 0 ? (
          <p className="text-11 text-muted-foreground">
            Nobody is on this canvas yet.
          </p>
        ) : (
          <EntryList entries={outline} />
        )}
      </div>
    </aside>
  )
}

function EntryList({ entries }: { entries: OutlineEntry[] }) {
  const select = useCanvasUIStore((s) => s.select)
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)
  const selectedNodeIds = useCanvasUIStore((s) => s.selectedNodeIds)

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => {
        const nodeId = personNodeId(entry.personId)
        const selected = selectedNodeIds.includes(nodeId)
        return (
          <li key={`${entry.personId}-${entry.relation}`}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              // Selecting and centring together: the list is a way *into* the
              // canvas, so following an entry should leave the card both
              // selected and on screen.
              onClick={() => {
                select(nodeId)
                requestCenter(nodeId)
              }}
              className={cn(
                "w-full cursor-pointer px-1 py-0.5 text-left text-12-5 hover:bg-muted",
                selected && "bg-primary/10 font-semibold"
              )}
            >
              <span className="text-muted-foreground">
                {RELATION_PREFIX[entry.relation]}
              </span>
              {entry.label}
              {entry.qualifiers.length > 0 && (
                <span className="text-11 text-muted-foreground">
                  {" "}
                  · {entry.qualifiers.join(" · ")}
                </span>
              )}
            </button>
            {entry.children.length > 0 && (
              <div className="ml-2 border-l border-border pl-2">
                <EntryList entries={entry.children} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

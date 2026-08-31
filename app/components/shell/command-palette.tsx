import { useEffect, useState } from "react"

import { PersonAvatar } from "~/components/people/person-avatar"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { useSearchPeople } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import { formatPartialDate } from "~/lib/partial-date"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import type { Person } from "~/lib/types"

const MAX_RESULTS = 24

interface CommandPaletteProps {
  generations: Map<string, number>
  memberIds: Set<string>
}

export function CommandPalette({
  generations,
  memberIds,
}: CommandPaletteProps) {
  const open = useAppShellStore((s) => s.paletteOpen)
  const setPaletteOpen = useAppShellStore((s) => s.setPaletteOpen)
  const setView = useAppShellStore((s) => s.setView)
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  const [query, setQuery] = useState("")

  const results = useSearchPeople(query)?.slice(0, MAX_RESULTS) ?? []

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setQuery("")
        setPaletteOpen(true)
      }
      if (e.key === "Escape") setPaletteOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setPaletteOpen])

  if (!open) return null

  function handlePick(person: Person) {
    requestCenter(personNodeId(person.id))
    setView("tree")
    setPaletteOpen(false)
  }

  return (
    <div
      role="presentation"
      onClick={() => setPaletteOpen(false)}
      className="fixed inset-0 z-150 flex justify-center bg-black/20 pt-24 backdrop-blur-2xs"
    >
      <div
        role="dialog"
        aria-label="Search people"
        onClick={(e) => e.stopPropagation()}
        className="flex h-fit w-140 flex-col bg-popover shadow-panel ring-1 ring-foreground/10"
      >
        <div className="flex h-13 items-center gap-2.5 border-b border-border px-4">
          <span className="text-muted-foreground">⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anyone in this tree…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <span className="border border-border px-1.5 py-0.5 text-10 font-medium text-muted-foreground">
            ESC
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.map((person) => {
            const generation = generations.get(person.id)
            const dates = [
              formatPartialDate(person.birth),
              formatPartialDate(person.death),
            ]
              .filter(Boolean)
              .join(" – ")
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => handlePick(person)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left hover:bg-muted"
              >
                <PersonAvatar photoId={person.photoId} size="md" />
                <span className="truncate text-13 font-medium">
                  {[person.givenName, person.familyName]
                    .filter(Boolean)
                    .join(" ") || "Unnamed"}
                </span>
                <span className="text-xs text-muted-foreground">{dates}</span>
                <span className="ml-auto flex items-center gap-1.5 font-heading text-9-5 font-medium tracking-widest text-muted-foreground uppercase">
                  {generation !== undefined && memberIds.has(person.id) ? (
                    <>
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
                    </>
                  ) : (
                    "Not in tree"
                  )}
                </span>
              </button>
            )
          })}
          {results.length === 0 && (
            <p className="m-4 text-center text-13 text-muted-foreground">
              No matches.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

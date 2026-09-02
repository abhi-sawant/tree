import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { useEffect, useState } from "react"

import { PersonAvatar } from "~/components/people/person-avatar"
import { Dialog, DialogOverlay, DialogPortal } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { useSearchPeople } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import { formatPartialDate } from "~/lib/partial-date"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import type { Person } from "~/lib/types"
import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId } from "~/lib/person-photos"

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
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setPaletteOpen])

  function handlePick(person: Person) {
    requestCenter(personNodeId(person.id))
    setView("tree")
    setPaletteOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed top-24 left-1/2 z-150 flex h-fit w-140 -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border-strong bg-popover shadow-float outline-none">
          <DialogPrimitive.Title className="sr-only">
            Search people
          </DialogPrimitive.Title>
          <div className="flex h-13 items-center gap-2.5 border-b border-border px-4">
            <span className="text-muted-foreground">⌕</span>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anyone in this tree…"
              className="h-auto flex-1 border-0 bg-transparent p-0 text-sm"
            />
            <span className="rounded-full border border-border px-1.5 py-0.5 text-10 font-medium text-muted-foreground">
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
                  <PersonAvatar photoId={coverPhotoId(person)} size="md" />
                  <span className="truncate text-13 font-medium">
                    {personDisplayName(person)}
                  </span>
                  <span className="text-xs text-muted-foreground">{dates}</span>
                  <span className="ml-auto flex items-center gap-1.5 font-heading text-9-5 font-medium text-muted-foreground">
                    {generation !== undefined && memberIds.has(person.id) ? (
                      <>
                        <span
                          className="size-2 rounded-full"
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
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

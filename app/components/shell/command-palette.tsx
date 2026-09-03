import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { useEffect, useState } from "react"

import { PersonAvatar } from "~/components/people/person-avatar"
import { Dialog, DialogOverlay, DialogPortal } from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { useSearchPeople, useTrees } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import { formatPartialDate } from "~/lib/partial-date"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import type { Person, Tree } from "~/lib/types"
import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId } from "~/lib/person-photos"

const MAX_RESULTS = 24

interface CommandPaletteProps {
  generations: Map<string, number>
  memberIds: Set<string>
  // Opens the add-person form with the given name prefilled — the "nothing
  // matched, so make one" action the search offers when a name isn't there.
  onAddPerson: (givenName: string) => void
}

export function CommandPalette({
  generations,
  memberIds,
  onAddPerson,
}: CommandPaletteProps) {
  const open = useAppShellStore((s) => s.paletteOpen)
  const setPaletteOpen = useAppShellStore((s) => s.setPaletteOpen)
  const setView = useAppShellStore((s) => s.setView)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  const trees = useTrees()
  const [query, setQuery] = useState("")

  const results = useSearchPeople(query)?.slice(0, MAX_RESULTS) ?? []
  const trimmed = query.trim()

  // Trees are matched too, and a typed name that matches nobody can become a
  // person. Search that only ever finds what already exists makes the reader
  // retype the name somewhere else.
  const matchingTrees = (trees ?? []).filter(
    (tree) =>
      trimmed.length > 0 &&
      tree.name.toLowerCase().includes(trimmed.toLowerCase())
  )
  const hasActions = trimmed.length > 0

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

  function handlePickTree(tree: Tree) {
    setActiveTree(tree.id)
    setView("tree")
    setPaletteOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogPortal>
        <DialogOverlay />
        {/* On a phone this is the whole screen rather than a floating box: at
            390px a 560px popup overflowed in both directions, and search with
            a keyboard up wants every row it can get. The width was also the
            one place in the app that escaped the dialog width guard, because
            this popup is built directly on the primitive. */}
        <DialogPrimitive.Popup className="fixed top-24 left-1/2 z-150 flex h-fit w-140 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border-strong bg-popover shadow-float outline-none max-md:inset-0 max-md:h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:rounded-none max-md:border-0">
          <DialogPrimitive.Title className="sr-only">
            Search people
          </DialogPrimitive.Title>
          <div className="flex h-13 items-center gap-2.5 border-b border-border px-4 max-md:h-15 max-md:pt-[env(safe-area-inset-top,0px)]">
            <span className="text-muted-foreground">⌕</span>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people and trees…"
              className="h-auto flex-1 border-0 bg-transparent p-0 text-base md:text-sm"
            />
            {/* A key cap means nothing on a touch screen, so it becomes the
                button that does the same thing. */}
            <span className="rounded-full border border-border px-1.5 py-0.5 text-10 font-medium text-muted-foreground max-md:hidden">
              ESC
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setPaletteOpen(false)}
            >
              Done
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5 max-md:max-h-none max-md:min-h-0 max-md:flex-1 max-md:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {results.length > 0 && (
              <PaletteSectionLabel>
                People · {results.length}
              </PaletteSectionLabel>
            )}
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
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted max-md:min-h-13 max-md:gap-3 max-md:px-3 max-md:py-2.5"
                >
                  <PersonAvatar photoId={coverPhotoId(person)} size="md" />
                  <span className="truncate text-13 font-medium max-md:text-15">
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
              <p className="m-4 text-center text-13 leading-relaxed text-muted-foreground">
                {trimmed
                  ? `No one and nothing matches “${trimmed}”.`
                  : "Search covers names, places and notes, across every tree."}
              </p>
            )}

            {hasActions && (
              <>
                <PaletteSectionLabel>Actions</PaletteSectionLabel>
                {matchingTrees.map((tree) => (
                  <button
                    key={tree.id}
                    type="button"
                    onClick={() => handlePickTree(tree)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-13 hover:bg-muted max-md:min-h-13 max-md:px-3 max-md:text-15"
                  >
                    Open {tree.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPaletteOpen(false)
                    onAddPerson(trimmed)
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-13 hover:bg-muted max-md:min-h-13 max-md:px-3 max-md:text-15"
                >
                  Add a person called “{trimmed}”
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

function PaletteSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-2 pb-1 font-heading text-10 font-semibold text-muted-foreground max-md:px-3 max-md:text-11">
      {children}
    </p>
  )
}

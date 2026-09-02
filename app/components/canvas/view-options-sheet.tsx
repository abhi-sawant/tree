import { useReactFlow } from "@xyflow/react"
import { Check } from "lucide-react"

import { CustomizePanel } from "~/components/canvas/customize-panel"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
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
import {
  useCanvasUIStore,
  useSelectedNodeId,
} from "~/lib/canvas/canvas-ui-store"
import {
  FOCUS_DEPTHS,
  focusDepthLabel,
  type FocusMode,
} from "~/lib/canvas/focus-scope"
import { clearAllPositions } from "~/lib/db/members"
import { parseNodeId } from "~/lib/graph/node-ids"
import { personDisplayName } from "~/lib/person-name"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { toast } from "~/lib/ui/toast-store"
import { cn } from "~/lib/utils"
import { useState } from "react"
import type { Person } from "~/lib/types"

const FOCUS_MODES: Array<{ mode: FocusMode; label: string }> = [
  { mode: "ancestors", label: "Ancestors only" },
  { mode: "descendants", label: "Descendants only" },
  { mode: "both", label: "Ancestors & descendants" },
]

interface ViewOptionsSheetProps {
  treeId: string
  generationCount: number
  people: Person[]
}

// Everything the desktop toolbar spreads across seven controls at the top of
// the canvas, as one sheet. Two of those controls only ever explained
// themselves through a tooltip, which carries nothing on a touch screen, so
// here the explanation is written under the switch.
export function ViewOptionsSheet({
  treeId,
  generationCount,
  people,
}: ViewOptionsSheetProps) {
  const { fitView } = useReactFlow()
  const open = useAppShellStore((s) => s.mobileSheet === "view-options")
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)

  const showBloodline = useCanvasUIStore((s) => s.showBloodline)
  const toggleBloodline = useCanvasUIStore((s) => s.toggleBloodline)
  const showOutline = useCanvasUIStore((s) => s.showOutline)
  const toggleOutline = useCanvasUIStore((s) => s.toggleOutline)
  const selectMode = useCanvasUIStore((s) => s.selectMode)
  const setSelectMode = useCanvasUIStore((s) => s.setSelectMode)
  const hiddenGenerations = useCanvasUIStore((s) => s.hiddenGenerations)
  const toggleGeneration = useCanvasUIStore((s) => s.toggleGeneration)
  const focus = useCanvasUIStore((s) => s.focus)
  const setFocus = useCanvasUIStore((s) => s.setFocus)
  const setFocusMode = useCanvasUIStore((s) => s.setFocusMode)
  const setFocusDepth = useCanvasUIStore((s) => s.setFocusDepth)
  const clearFocus = useCanvasUIStore((s) => s.clearFocus)
  const selectedNodeId = useSelectedNodeId()

  const showPhoto = useAppearanceStore((s) => s.settings.showPhoto)
  const setSetting = useAppearanceStore((s) => s.setSetting)
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )

  const [customizeOpen, setCustomizeOpen] = useState(false)

  const parsed = selectedNodeId ? parseNodeId(selectedNodeId) : undefined
  // Only a person can anchor a focus view; selecting a union dot cannot.
  const selectedPersonId =
    parsed?.kind === "person" ? parsed.personId : undefined
  const nameOf = (personId: string) => {
    const person = people.find((p) => p.id === personId)
    return person ? personDisplayName(person) : "someone"
  }

  const close = () => setMobileSheet(null)

  async function handleRelayout() {
    close()
    await clearAllPositions(treeId)
    toast("Layout recomputed — pinned cards released")
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && close()}>
        <SheetContent>
          <SheetHeader className="border-b border-border">
            <SheetTitle>View</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-1 pt-3">
            <SwitchRow
              label="Highlight bloodline"
              detail="Glows the line of descent from the selected person to the tree root"
              checked={showBloodline}
              onChange={toggleBloodline}
            />
            <SwitchRow
              label="Show tree outline"
              detail="Reads the tree as a nested list of who descends from whom"
              checked={showOutline}
              onChange={toggleOutline}
            />
            <SwitchRow
              label="Photos on cards"
              detail="Turn off for more names on screen"
              checked={showPhoto}
              onChange={() => setSetting("showPhoto", !showPhoto)}
            />
            <SwitchRow
              label="Select several"
              detail="Tap cards to gather them, for aligning or moving between trees"
              checked={selectMode}
              onChange={() => setSelectMode(!selectMode)}
            />

            <SheetSectionLabel>Focus mode</SheetSectionLabel>
            {focus ? (
              <p className="px-3.5 pb-1 text-12-5 text-muted-foreground">
                Showing {nameOf(focus.personId)}'s{" "}
                {focus.mode === "both"
                  ? "ancestors and descendants"
                  : focus.mode}
                , {focusDepthLabel(focus.generations).toLowerCase()}.
              </p>
            ) : (
              <p className="px-3.5 pb-1 text-12-5 text-muted-foreground">
                {selectedPersonId
                  ? `Narrows the canvas to one person's line. Ready to focus on ${nameOf(selectedPersonId)}.`
                  : "Narrows the canvas to one person's line. Select a card first."}
              </p>
            )}
            {FOCUS_MODES.map(({ mode, label }) => (
              <SheetItem
                key={mode}
                label={label}
                disabled={!focus && !selectedPersonId}
                selected={focus?.mode === mode}
                trailing={
                  focus?.mode === mode ? (
                    <Check className="size-4 text-primary" />
                  ) : undefined
                }
                onClick={() => {
                  if (focus) {
                    setFocusMode(mode)
                  } else if (selectedPersonId) {
                    setFocus({
                      personId: selectedPersonId,
                      mode,
                      generations: Infinity,
                    })
                  }
                }}
              />
            ))}
            {focus && (
              <>
                {FOCUS_DEPTHS.map((depth) => (
                  <SheetItem
                    key={String(depth)}
                    label={focusDepthLabel(depth)}
                    selected={focus.generations === depth}
                    trailing={
                      focus.generations === depth ? (
                        <Check className="size-4 text-primary" />
                      ) : undefined
                    }
                    onClick={() => setFocusDepth(depth)}
                  />
                ))}
                {selectedPersonId && selectedPersonId !== focus.personId && (
                  <SheetItem
                    label={`Re-centre on ${nameOf(selectedPersonId)}`}
                    onClick={() =>
                      setFocus({ ...focus, personId: selectedPersonId })
                    }
                  />
                )}
                <SheetItem label="Clear focus" onClick={clearFocus} />
              </>
            )}

            <SheetSectionLabel>Generations shown</SheetSectionLabel>
            <div className="flex flex-wrap gap-2 px-3.5 pb-1">
              {Array.from({ length: generationCount }, (_, generation) => {
                const hidden = hiddenGenerations.includes(generation)
                return (
                  <button
                    key={generation}
                    type="button"
                    aria-pressed={!hidden}
                    onClick={() => toggleGeneration(generation)}
                    className={cn(
                      "flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-13 font-medium",
                      hidden
                        ? "border-border text-muted-foreground"
                        : "border-primary/40 bg-primary/10"
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{
                        background: resolveGenerationColor(
                          generation,
                          generationColors
                        ),
                      }}
                    />
                    G{generation + 1}
                    {hidden && (
                      <span className="text-11 text-muted-foreground">
                        hidden
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => {
                  close()
                  void fitView()
                }}
              >
                Fit to screen
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => {
                  close()
                  setCustomizeOpen(true)
                }}
              >
                Appearance…
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => void handleRelayout()}
              >
                Re-layout, releasing pinned cards
              </Button>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <CustomizePanel open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </>
  )
}

function SwitchRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <Label className="flex-row items-start gap-3 rounded-xl px-3.5 py-3 text-15 font-normal normal-case hover:bg-muted">
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <span className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        <span className="text-12-5 leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
    </Label>
  )
}

function SheetSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 px-3.5 pb-1 font-heading text-11 font-semibold text-muted-foreground">
      {children}
    </p>
  )
}

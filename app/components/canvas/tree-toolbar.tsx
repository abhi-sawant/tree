import { Panel, useReactFlow } from "@xyflow/react"
import {
  Crosshair,
  GitBranch,
  LayoutGrid,
  List,
  Palette,
  X,
} from "lucide-react"
import { useState } from "react"

import { CustomizePanel } from "~/components/canvas/customize-panel"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
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
import { parseNodeId } from "~/lib/graph/node-ids"
import { clearAllPositions } from "~/lib/db/members"
import { personDisplayName } from "~/lib/person-name"
import { toast } from "~/lib/ui/toast-store"
import type { Person } from "~/lib/types"

const FOCUS_MODES: Array<{ mode: FocusMode; label: string }> = [
  { mode: "ancestors", label: "Ancestors only" },
  { mode: "descendants", label: "Descendants only" },
  { mode: "both", label: "Ancestors & descendants" },
]

interface TreeToolbarProps {
  treeId: string
  generationCount: number
  people: Person[]
}

export function TreeToolbar({
  treeId,
  generationCount,
  people,
}: TreeToolbarProps) {
  const { fitView } = useReactFlow()
  const hiddenGenerations = useCanvasUIStore((s) => s.hiddenGenerations)
  const toggleGeneration = useCanvasUIStore((s) => s.toggleGeneration)
  const selectedNodeId = useSelectedNodeId()
  const focus = useCanvasUIStore((s) => s.focus)
  const setFocus = useCanvasUIStore((s) => s.setFocus)
  const setFocusMode = useCanvasUIStore((s) => s.setFocusMode)
  const setFocusDepth = useCanvasUIStore((s) => s.setFocusDepth)
  const clearFocus = useCanvasUIStore((s) => s.clearFocus)
  const showBloodline = useCanvasUIStore((s) => s.showBloodline)
  const toggleBloodline = useCanvasUIStore((s) => s.toggleBloodline)
  const showOutline = useCanvasUIStore((s) => s.showOutline)
  const toggleOutline = useCanvasUIStore((s) => s.toggleOutline)
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const visibleCount = generationCount - hiddenGenerations.length
  const generationLabel =
    hiddenGenerations.length > 0
      ? `${visibleCount} of ${generationCount} gens`
      : `Generations 1–${generationCount}`

  async function handleRelayout() {
    await clearAllPositions(treeId)
    toast("Layout recomputed — pinned cards released")
  }

  const parsed = selectedNodeId ? parseNodeId(selectedNodeId) : undefined
  // Only a person can anchor a focus view; selecting a union dot cannot.
  const selectedPersonId =
    parsed?.kind === "person" ? parsed.personId : undefined
  const nameOf = (personId: string) => {
    const person = people.find((p) => p.id === personId)
    return person ? personDisplayName(person) : "someone"
  }

  return (
    <Panel position="top-left">
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="xs"
          onClick={() => void handleRelayout()}
        >
          <LayoutGrid /> Re-layout
        </Button>
        <Button variant="outline" size="xs" onClick={() => void fitView()}>
          Fit
        </Button>
        <Button
          variant={showBloodline ? "default" : "outline"}
          size="xs"
          aria-pressed={showBloodline}
          title="Glow the line of descent from the selected person to the tree root"
          onClick={toggleBloodline}
        >
          <GitBranch /> Bloodline
        </Button>
        <Button
          variant={showOutline ? "default" : "outline"}
          size="xs"
          aria-pressed={showOutline}
          title="Read the tree as a nested list of who descends from whom"
          onClick={toggleOutline}
        >
          <List /> Outline
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => setCustomizeOpen(true)}
        >
          <Palette /> Customize
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant={focus ? "default" : "outline"} size="xs">
                <Crosshair />
                {focus
                  ? `${nameOf(focus.personId)} · ${focusDepthLabel(focus.generations)}`
                  : "Focus"}
              </Button>
            }
          />
          <DropdownMenuContent>
            {!focus && !selectedPersonId && (
              <DropdownMenuItem disabled>
                Select a person first
              </DropdownMenuItem>
            )}
            {FOCUS_MODES.map(({ mode, label }) => (
              <DropdownMenuCheckboxItem
                key={mode}
                checked={focus?.mode === mode}
                disabled={!focus && !selectedPersonId}
                closeOnClick={false}
                onCheckedChange={() => {
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
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            {focus && (
              <>
                <DropdownMenuSeparator />
                {FOCUS_DEPTHS.map((depth) => (
                  <DropdownMenuCheckboxItem
                    key={String(depth)}
                    checked={focus.generations === depth}
                    closeOnClick={false}
                    onCheckedChange={() => setFocusDepth(depth)}
                  >
                    {focusDepthLabel(depth)}
                  </DropdownMenuCheckboxItem>
                ))}
                {selectedPersonId && selectedPersonId !== focus.personId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        setFocus({ ...focus, personId: selectedPersonId })
                      }
                    >
                      Re-centre on {nameOf(selectedPersonId)}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearFocus}>
                  <X /> Clear focus
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="xs">
                {generationLabel}
              </Button>
            }
          />
          <DropdownMenuContent>
            {Array.from({ length: generationCount }, (_, generation) => (
              <DropdownMenuCheckboxItem
                key={generation}
                checked={!hiddenGenerations.includes(generation)}
                onCheckedChange={() => toggleGeneration(generation)}
                closeOnClick={false}
              >
                <span
                  className="size-2 shrink-0 rounded-xs"
                  style={{
                    background: resolveGenerationColor(
                      generation,
                      generationColors
                    ),
                  }}
                />
                Generation {generation + 1}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CustomizePanel open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </Panel>
  )
}

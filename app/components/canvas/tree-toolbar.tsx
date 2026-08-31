import { Panel, useReactFlow } from "@xyflow/react"
import { LayoutGrid } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { clearAllPositions } from "~/lib/db/members"
import { toast } from "~/lib/ui/toast-store"

const GENERATION_LEVELS = 6

interface TreeToolbarProps {
  treeId: string
  generationCount: number
}

export function TreeToolbar({ treeId, generationCount }: TreeToolbarProps) {
  const { fitView } = useReactFlow()
  const hiddenGenerations = useCanvasUIStore((s) => s.hiddenGenerations)
  const toggleGeneration = useCanvasUIStore((s) => s.toggleGeneration)

  const visibleCount = generationCount - hiddenGenerations.length
  const generationLabel =
    hiddenGenerations.length > 0
      ? `${visibleCount} of ${generationCount} gens`
      : `Generations 1–${generationCount}`

  async function handleRelayout() {
    await clearAllPositions(treeId)
    toast("Layout recomputed — pinned cards released")
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
                    background: `var(--level-${generation % GENERATION_LEVELS})`,
                  }}
                />
                Generation {generation + 1}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Panel>
  )
}

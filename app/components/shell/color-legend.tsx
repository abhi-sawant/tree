import { useMemo } from "react"

import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { surnameLegend } from "~/lib/canvas/color-groups"
import { useMembers, usePeople } from "~/lib/db/hooks"

// What the card colours on the canvas mean. Only surname colouring has a
// legend worth listing — one row per family name — and the others say how the
// colours are being chosen instead, so the swatches never appear to mean
// something they don't.
export function ColorLegend({ activeTreeId }: { activeTreeId?: string }) {
  const people = usePeople()
  const members = useMembers()
  const colorBy = useAppearanceStore((s) => s.settings.colorBy)
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )

  const rows = useMemo(() => {
    if (colorBy !== "surname" || !people || !members) return []
    const inTree = new Set(
      members.filter((m) => m.treeId === activeTreeId).map((m) => m.personId)
    )
    return surnameLegend(people.filter((p) => inTree.has(p.id)))
  }, [colorBy, people, members, activeTreeId])

  return (
    <div className="flex flex-col gap-0.5">
      <p className="mx-1 mb-1.5 text-13 font-bold text-muted-foreground">
        Family colours
      </p>
      {colorBy !== "surname" && (
        <p className="mx-1 text-xs leading-snug text-muted-foreground">
          Cards are coloured by{" "}
          {colorBy === "generation" ? "generation" : "branch of the family"}.
          Change it under View options on the tree.
        </p>
      )}
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-sm font-semibold"
        >
          <span
            aria-hidden
            className="size-3.5 flex-none rounded-sm"
            style={{
              background: resolveGenerationColor(row.index, generationColors),
            }}
          />
          <span className="truncate">{row.label}</span>
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            {row.count}
          </span>
        </div>
      ))}
    </div>
  )
}

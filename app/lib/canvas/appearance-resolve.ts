import { GENERATION_LEVELS } from "~/lib/canvas/appearance-store"

// Cycles through a fixed palette so generations keep reading as distinct
// colors even in a tree deep enough to run past the palette's length —
// distinguishing them exactly (vs. wrapping) would need an unbounded set of
// colors, which stops being visually distinguishable well before this does.
export function resolveGenerationColor(
  generation: number,
  colors: (string | null)[]
): string {
  const index = generation % GENERATION_LEVELS
  return colors[index] ?? `var(--level-${index})`
}

export function resolveEdgeColor(
  custom: string | null,
  cssVar: "--edge-spouse" | "--edge-parent-child"
): string {
  return custom ?? `var(${cssVar})`
}

// Native <input type="color"> only accepts #rrggbb, but the app's defaults
// are theme-adaptive OKLCH CSS variables — so the customize panel needs a
// concrete hex swatch to show before a user overrides a color. Letting the
// browser's own color parser (via canvas) do the OKLCH->RGB conversion beats
// hand-picking approximate hex constants that would drift from app.css.
export function cssColorToHex(cssColor: string): string {
  if (typeof document === "undefined") return "#000000"
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return "#000000"
  ctx.fillStyle = cssColor
  const normalized = ctx.fillStyle
  if (normalized.startsWith("#")) return normalized
  const channels = normalized.match(/\d+/g)
  if (!channels) return "#000000"
  const [r, g, b] = channels.map(Number)
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
}

export function getCssVariableHex(varName: string): string {
  if (typeof window === "undefined") return "#000000"
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  return cssColorToHex(raw || "#000000")
}

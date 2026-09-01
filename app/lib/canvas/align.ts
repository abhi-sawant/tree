// Aligning a handful of hand-placed cards. Only two operations, named for what
// they do to the cards rather than borrowing a drawing tool's six-way
// vocabulary: a family tree has exactly two things you want to straighten — a
// row of siblings that has drifted out of line, and a column of descent.
export type AlignMode = "tops" | "left-edges"

export interface AlignTarget {
  personId: string
  x: number
  y: number
}

export function alignModeLabel(mode: AlignMode): string {
  return mode === "tops" ? "Align tops" : "Align left edges"
}

// Everyone snaps to the topmost card (or the leftmost), not to the average.
// The average moves every card a little, including the ones that were already
// where the user wanted them; snapping to an extreme leaves at least one card
// exactly where it was, so the result is something you can predict before you
// click and undo by dragging one card back.
//
// Returns only the cards whose position actually changes, so aligning an
// already-aligned row writes nothing.
export function alignTargets(
  targets: AlignTarget[],
  mode: AlignMode
): AlignTarget[] {
  if (targets.length < 2) return []

  if (mode === "tops") {
    const top = Math.min(...targets.map((t) => t.y))
    return targets.filter((t) => t.y !== top).map((t) => ({ ...t, y: top }))
  }

  const left = Math.min(...targets.map((t) => t.x))
  return targets.filter((t) => t.x !== left).map((t) => ({ ...t, x: left }))
}

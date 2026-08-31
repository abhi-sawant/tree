import { Position } from "@xyflow/react"

// ELK's own vocabulary, passed straight through as elk.direction.
export type LayoutDirection = "DOWN" | "RIGHT"

// Handle ids are named by role rather than by side, so switching direction moves
// where a handle sits without renaming it — the edge builder keeps referring to
// the same three handles either way.
export const HANDLE = {
  // Where a parent-child link arrives.
  in: "in",
  // Where a parent-child link leaves.
  children: "children",
  // The two sides a marriage line can use, ordered along the cross axis: for
  // DOWN that is left then right, for RIGHT it is top then bottom.
  crossStart: "cross-start",
  crossEnd: "cross-end",
} as const

export interface DirectionGeometry {
  inPosition: Position
  childrenPosition: Position
  crossStartPosition: Position
  crossEndPosition: Position
}

export function directionGeometry(
  direction: LayoutDirection
): DirectionGeometry {
  if (direction === "RIGHT") {
    return {
      inPosition: Position.Left,
      childrenPosition: Position.Right,
      crossStartPosition: Position.Top,
      crossEndPosition: Position.Bottom,
    }
  }
  return {
    inPosition: Position.Top,
    childrenPosition: Position.Bottom,
    crossStartPosition: Position.Left,
    crossEndPosition: Position.Right,
  }
}

// Generations advance along the main axis; siblings and spouses spread along the
// cross axis. Every piece of direction-dependent geometry reduces to this.
export function isVertical(direction: LayoutDirection): boolean {
  return direction === "DOWN"
}

export function directionLabel(direction: LayoutDirection): string {
  return direction === "DOWN" ? "Top to bottom" : "Left to right"
}

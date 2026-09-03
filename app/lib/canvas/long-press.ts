// A press that stays put for long enough to mean "tell me more about this",
// as opposed to a tap (select) or a drag (move the card, or pan the canvas).
//
// Written out rather than taken from the context-menu primitive because on the
// canvas a long press has to lose to a drag: the same finger, on the same
// card, starting the same way, means "pin this here" if it travels and "show
// me the actions" if it doesn't. That decision is this module's whole job, and
// it is pure so the thresholds can be tested rather than felt.

// Long enough not to fire on a slow tap, short enough that a reader holding a
// card deliberately doesn't conclude nothing is going to happen. The same
// 500ms Base UI's own context menu uses.
export const LONG_PRESS_MS = 500

// Movement past this cancels it. A finger resting on glass wanders a few
// pixels without its owner intending anything; React Flow's own drag
// threshold is set to the same number, so the gesture that cancels a long
// press is exactly the gesture that starts a drag — there is no band of
// movement where both or neither happen.
export const LONG_PRESS_SLOP_PX = 8

export interface PressPoint {
  x: number
  y: number
}

export function movedTooFar(from: PressPoint, to: PressPoint): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  // Squared distance, to keep the comparison exact and cheap on a move event
  // that fires at pointer rate.
  return dx * dx + dy * dy > LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX
}

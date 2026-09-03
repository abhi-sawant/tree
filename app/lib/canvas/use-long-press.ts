import { useCallback, useEffect, useRef } from "react"

import {
  LONG_PRESS_MS,
  movedTooFar,
  type PressPoint,
} from "~/lib/canvas/long-press"

// Pointer handlers to spread onto an element that should respond to a long
// press. Only used on touch: on a mouse the same actions are on the
// right-click menu, which is the gesture people already expect there.
export function useLongPress(onLongPress: () => void): {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
} {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const origin = useRef<PressPoint | undefined>(undefined)
  // Read through a ref so the handlers stay stable across renders — they are
  // spread onto a canvas card that re-renders on every selection change.
  const handler = useRef(onLongPress)
  handler.current = onLongPress

  const cancel = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
    origin.current = undefined
  }, [])

  // A press held while the component unmounts (a card filtered out by a
  // generation toggle, say) must not fire into nothing.
  useEffect(() => cancel, [cancel])

  return {
    onPointerDown: (event) => {
      // Touch and pen only. A mouse long-press is an accident, not an
      // instruction, and the right-click menu already covers that pointer.
      if (event.pointerType === "mouse") return
      cancel()
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        timer.current = undefined
        handler.current()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (event) => {
      if (!origin.current) return
      if (movedTooFar(origin.current, { x: event.clientX, y: event.clientY })) {
        // The press became a drag, which on a card means "pin it here".
        cancel()
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  }
}

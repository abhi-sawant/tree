import { useEffect } from "react"

import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import {
  selectedNodeIdOf,
  useCanvasUIStore,
} from "~/lib/canvas/canvas-ui-store"
import {
  addRelativeKindForKey,
  arrowKeyToStep,
  isTypingTarget,
  stepToRelative,
} from "~/lib/canvas/keyboard-navigation"
import { parseNodeId, personNodeId } from "~/lib/graph/node-ids"
import type { Person, Relationship } from "~/lib/types"

export interface CanvasKeyboardOptions {
  people: Person[]
  relationships: Relationship[]
  // The people actually rendered right now, taken from the node array so it
  // already accounts for focus scoping and hidden generations.
  visiblePersonIds: Set<string>
}

// Keyboard driving for the canvas: arrows walk the family, Enter edits, and
// P/S/C open an add-relative form on the selected person.
//
// Bound to the window rather than to a canvas element because the canvas has no
// focusable wrapper to hang it on and a click on a card would otherwise have to
// also take DOM focus for the arrows to work. The listener's lifetime is the
// hook's, and the hook only lives inside the tree view, so the shortcuts are
// scoped to the canvas by mounting rather than by focus.
export function useCanvasKeyboard({
  people,
  relationships,
  visiblePersonIds,
}: CanvasKeyboardOptions): void {
  const direction = useAppearanceStore((s) => s.settings.layoutDirection)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Every binding here is a bare key, so a field would otherwise never see
      // its own keystrokes — typing "Pieter" into a name would fire add-parent.
      if (isTypingTarget(event.target)) return
      // Leave every accelerator alone: ⌘K opens the palette, ⌘S is the
      // browser's, and neither should be read as "add spouse".
      if (event.metaKey || event.ctrlKey || event.altKey) return

      // Read at the moment of the keypress rather than through the hook's
      // props, so the effect doesn't have to re-subscribe on every selection
      // change — and so a stale closure can never act on the wrong person.
      const state = useCanvasUIStore.getState()
      // Only ever acts on a single selection: "add a child to these five
      // people" is not a thing a keystroke should be able to mean.
      const selectedNodeId = selectedNodeIdOf(state.selectedNodeIds)
      const parsed = selectedNodeId ? parseNodeId(selectedNodeId) : undefined
      // A union dot is a marriage, not a person: it has no parents of its own
      // and no row to walk along, so the shortcuts simply don't apply to it.
      if (parsed?.kind !== "person") return
      const personId = parsed.personId

      const step = arrowKeyToStep(event.key, direction)
      if (step) {
        const target = stepToRelative(personId, step, {
          people,
          relationships,
          visiblePersonIds,
        })
        // Swallow the arrow either way. Half-consuming them would let the
        // canvas scroll sideways the moment you reached the end of a row.
        event.preventDefault()
        if (target) state.requestCenter(personNodeId(target))
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        state.requestEdit(personNodeId(personId))
        return
      }

      const kind = addRelativeKindForKey(event.key)
      if (kind) {
        event.preventDefault()
        state.requestAddRelative(personNodeId(personId), kind)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [people, relationships, visiblePersonIds, direction])
}

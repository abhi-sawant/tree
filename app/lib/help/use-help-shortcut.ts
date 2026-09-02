import { useEffect } from "react"

import { isTypingTarget } from "~/lib/canvas/keyboard-navigation"
import { useAppShellStore } from "~/lib/ui/app-shell-store"

// The key the whole world uses for "explain this". Bound at the shell rather
// than on the canvas, because being stuck is not something that only happens
// in one view.
export const HELP_KEY = "?"

export function useHelpShortcut(): void {
  const setView = useAppShellStore((s) => s.setView)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== HELP_KEY) return
      // A bare printable key, so the same guard the canvas shortcuts use: a
      // question mark typed into a note must reach the note.
      if (isTypingTarget(event.target)) return
      // ⌘? and Ctrl+? belong to the browser and to screen readers.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      setView("help")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setView])
}

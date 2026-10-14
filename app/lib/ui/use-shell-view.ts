import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router"

import { useAppShellStore } from "~/lib/ui/app-shell-store"
import {
  DEFAULT_VIEW,
  VIEW_PATHS,
  nextNavState,
  originView,
  viewFromPath,
  type ShellView,
} from "~/lib/ui/routes"

// The current view is the URL; nothing else holds it.
export function useView(): ShellView {
  return viewFromPath(useLocation().pathname) ?? DEFAULT_VIEW
}

// The bottom-bar view the current sub-screen was opened from.
export function usePreviousView(): ShellView {
  return originView(useLocation().state)
}

export function useSetView(): (view: ShellView) => void {
  const navigate = useNavigate()
  const location = useLocation()
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)
  const current = useView()

  return useCallback(
    (view: ShellView) => {
      // A sheet belongs to the screen it was opened from.
      setMobileSheet(null)
      if (view === current) return
      navigate(VIEW_PATHS[view], {
        state: nextNavState(current, location.state, view),
      })
    },
    [navigate, setMobileSheet, current, location.state]
  )
}

export function useGoBack(): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)

  return useCallback(() => {
    setMobileSheet(null)
    navigate(VIEW_PATHS[originView(location.state)])
  }, [navigate, setMobileSheet, location.state])
}

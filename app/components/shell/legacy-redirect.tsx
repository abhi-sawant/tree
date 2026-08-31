import { useEffect } from "react"
import { Navigate } from "react-router"

import { useAppShellStore, type ShellView } from "~/lib/ui/app-shell-store"

interface LegacyRedirectProps {
  view: ShellView
  treeId?: string
}

// Views live in shell state rather than the URL now, so the old paths hand
// their intent to the store on the way to "/".
export function LegacyRedirect({ view, treeId }: LegacyRedirectProps) {
  useEffect(() => {
    if (treeId) useAppShellStore.getState().setActiveTree(treeId)
    useAppShellStore.getState().setView(view)
  }, [view, treeId])

  return <Navigate to="/" replace />
}

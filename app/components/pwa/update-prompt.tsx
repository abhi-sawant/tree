import { useRegisterSW } from "virtual:pwa-register/react"

import { Button } from "~/components/ui/button"

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-3 border bg-card p-3 text-sm shadow-lg">
      <span>An update is available.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  )
}

import { useRegisterSW } from "virtual:pwa-register/react"

import { Button } from "~/components/ui/button"

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-float max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] max-md:mx-4 max-md:w-auto max-md:flex-wrap">
      <span>An update is available.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  )
}

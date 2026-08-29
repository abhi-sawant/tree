import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"

const DISMISSED_KEY = "pwa-install-dismissed"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<
    BeforeInstallPromptEvent | undefined
  >(undefined)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY)) return

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredEvent(e as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      )
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1")
    setDeferredEvent(undefined)
  }

  async function install() {
    if (!deferredEvent) return
    await deferredEvent.prompt()
    await deferredEvent.userChoice
    setDeferredEvent(undefined)
  }

  if (!deferredEvent) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit items-center gap-3 rounded-md border bg-card p-3 text-sm shadow-lg">
      <span>Install Family Tree for offline use.</span>
      <Button size="sm" onClick={install}>
        Install
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        Dismiss
      </Button>
    </div>
  )
}

import { useToastStore } from "~/lib/ui/toast-store"

// Bottom-anchored, so on a phone it has to clear the nav bar. z-300 keeps it
// above every sheet: a toast confirming what a sheet just did has to be
// readable from inside it.
export function Toaster() {
  const message = useToastStore((s) => s.message)
  if (!message) return null

  return (
    <div
      data-print="hide"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-300 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.75 text-center text-12-5 font-medium text-background shadow-float max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
    >
      {message}
    </div>
  )
}

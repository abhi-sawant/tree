import { useToastStore } from "~/lib/ui/toast-store"

export function Toaster() {
  const message = useToastStore((s) => s.message)
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-300 -translate-x-1/2 bg-foreground px-4 py-2.75 text-12-5 font-medium text-background shadow-toast"
    >
      {message}
    </div>
  )
}

import { ChevronLeft } from "lucide-react"

import { Button } from "~/components/ui/button"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useIsMobile } from "~/lib/ui/viewport-tier"

// The header a pushed screen wears on a phone. Insights, Health, Settings and
// Help are reached from More rather than from the bottom bar, so each needs to
// say what it is and offer a way back — the bar can only light the tab they
// were opened from, which says where you came from and not where you are.
//
// Renders nothing on a wide screen, where the sidebar's highlighted row
// already answers both questions and there is nothing to go back from.
export function MobileScreenHeader({
  title,
  detail,
  actions,
  onBack,
}: {
  title: string
  detail?: React.ReactNode
  actions?: React.ReactNode
  // Overrides the default "leave this screen". A screen with a step inside it
  // — Help's list, then a topic — has to step back within itself first, or
  // back skips the level the reader is actually on.
  onBack?: () => void
}) {
  const isMobile = useIsMobile()
  const goBack = useAppShellStore((s) => s.goBack)
  if (!isMobile) return null

  return (
    <header
      data-print="hide"
      className="flex h-14 flex-none items-center gap-1 border-b border-border pr-2 pl-1"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Back"
        onClick={onBack ?? goBack}
      >
        <ChevronLeft />
      </Button>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-heading text-base font-semibold">
          {title}
        </span>
        {detail && (
          <span className="truncate text-11 text-muted-foreground">
            {detail}
          </span>
        )}
      </div>
      {actions && (
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      )}
    </header>
  )
}

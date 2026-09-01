import { Button } from "~/components/ui/button"
import type { StalenessVerdict } from "~/lib/backup/staleness"

interface BackupNudgeBannerProps {
  verdict: StalenessVerdict
  onExport: () => void
  exporting?: boolean
  onDismiss: () => void
}

// Inline and one line tall, between the topbar and the view. Deliberately not a
// modal and not a toast: a modal would interrupt the data entry it is warning
// about, and a toast would vanish before it was read. It sits where the app's
// own chrome is, and can be sent away.
//
// Coloured with --primary rather than a warning colour, because there is no
// warning token in the palette and Phase 3 already declined to invent colour
// values — the same reasoning that left high-contrast mode undone. This is not
// an error anyway: it is the app asking for attention, which is what --primary
// is for.
export function BackupNudgeBanner({
  verdict,
  onExport,
  exporting,
  onDismiss,
}: BackupNudgeBannerProps) {
  if (!verdict.stale) return null

  return (
    <div
      data-print="hide"
      className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-primary/30 bg-primary/8 px-4 py-2"
    >
      <span className="text-12-5 leading-snug">
        {verdict.neverExported
          ? `You've been building this for ${verdict.days} days and haven't exported a backup yet.`
          : `Your last backup was ${verdict.days} days ago, and there have been changes since.`}{" "}
        <span className="text-muted-foreground">
          Everything lives in this browser, which can clear it without warning.
        </span>
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="xs" disabled={exporting} onClick={onExport}>
          {exporting ? "Exporting…" : "Back up now"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onDismiss}
          aria-label="Dismiss backup reminder"
        >
          Later
        </Button>
      </div>
    </div>
  )
}

import { Button } from "~/components/ui/button"

interface TabNoticeProps {
  peerCount: number
  dataReplaced: boolean
}

// Two different notices, and the difference matters. A second tab is worth
// knowing about but is not a problem — Dexie's liveQuery keeps both in step, so
// this is a quiet line. A restore in another tab *is* a problem: everything on
// screen refers to records that no longer exist, and the next edit would write
// them back.
export function TabNotice({ peerCount, dataReplaced }: TabNoticeProps) {
  if (dataReplaced) {
    return (
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-destructive/40 bg-destructive/10 px-4 py-2">
        <span className="text-12-5 leading-snug text-destructive">
          Another tab restored a backup, so everything here is out of date.
          Reload before making any change — editing now would write these old
          records back over the restored ones.
        </span>
        <Button
          size="xs"
          className="ml-auto"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    )
  }

  if (peerCount === 0) return null

  return (
    <div className="flex flex-none items-center border-b border-border bg-muted/40 px-4 py-1.5">
      <span className="text-11 leading-snug text-muted-foreground">
        Also open in{" "}
        {peerCount === 1 ? "another tab" : `${peerCount} other tabs`}. Edits
        appear in both; automatic backups run in one of them.
      </span>
    </div>
  )
}

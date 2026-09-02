import { useLiveQuery } from "dexie-react-hooks"
import { useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  ATTACHMENT_ACCEPT,
  attachmentProblem,
  isPdfAttachment,
} from "~/lib/attachments"
import {
  addAttachment,
  deleteAttachment,
  listAttachments,
  renameAttachment,
} from "~/lib/db/attachments"
import { triggerDownload } from "~/lib/download"
import { formatBytes } from "~/lib/storage-breakdown"
import { toast } from "~/lib/ui/toast-store"
import type { Attachment } from "~/lib/types"

interface PersonAttachmentsPanelProps {
  personId: string
}

// The person's file drawer: scans, certificates, letters. Deliberately plain —
// a list of names, sizes and a download button. There is no viewer, because
// every browser already has a better PDF and image viewer than this app could
// build, and the file the user gets back is byte-identical to the one they
// added.
export function PersonAttachmentsPanel({
  personId,
}: PersonAttachmentsPanelProps) {
  const attachments = useLiveQuery(() => listAttachments(personId), [personId])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  // Every refusal, not just the last: dropping five files where three are too
  // large should say so three times, or the count silently disagrees with what
  // the user selected.
  const [problems, setProblems] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string | undefined>(undefined)

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ""
    if (files.length === 0) return

    setBusy(true)
    const refused: string[] = []
    let added = 0
    try {
      for (const file of files) {
        // Checked here as well as inside addAttachment so the whole batch is
        // reported at once rather than one thrown error at a time.
        const problem = attachmentProblem(file)
        if (problem) {
          refused.push(problem)
          continue
        }
        try {
          await addAttachment(personId, file, file)
          added += 1
        } catch {
          refused.push(`“${file.name}” couldn't be stored, so it wasn't added.`)
        }
      }
    } finally {
      setBusy(false)
    }
    setProblems(refused)
    if (added > 0) toast(added === 1 ? "File added" : `${added} files added`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? "Adding…" : "Add a document"}
        </Button>
        <span className="text-11 text-muted-foreground">
          PDFs and images, stored as they are
        </span>
      </div>

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1">
          {problems.map((problem, i) => (
            <li key={i} className="text-12-5 text-destructive">
              {problem}
            </li>
          ))}
        </ul>
      )}

      {attachments?.length === 0 && (
        <p className="text-13 text-muted-foreground">
          No documents yet. Birth and marriage certificates, wills, letters and
          register pages all belong here.
        </p>
      )}

      <ul className="flex flex-col">
        {(attachments ?? []).map((attachment) => (
          <AttachmentRow
            key={attachment.id}
            attachment={attachment}
            renaming={renaming === attachment.id}
            onStartRename={() => setRenaming(attachment.id)}
            onEndRename={() => setRenaming(undefined)}
          />
        ))}
      </ul>

      <input
        ref={fileInputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void handleFilesSelected(e)}
      />
    </div>
  )
}

function AttachmentRow({
  attachment,
  renaming,
  onStartRename,
  onEndRename,
}: {
  attachment: Attachment
  renaming: boolean
  onStartRename: () => void
  onEndRename: () => void
}) {
  const [draft, setDraft] = useState(attachment.name)

  async function commitRename() {
    await renameAttachment(attachment.id, draft)
    onEndRename()
  }

  // Two rows rather than one. The panel is 340px wide, and a filename sharing a
  // line with a size and two buttons truncates to about eight characters —
  // "Birth ce…" identifies nothing, which is the one job the name has.
  return (
    <li className="flex flex-col gap-1 border-t border-border py-2 first:border-t-0">
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          className="h-7 text-12-5"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename()
            // Escape abandons, matching the inline editor in the people table.
            if (e.key === "Escape") {
              setDraft(attachment.name)
              onEndRename()
            }
          }}
        />
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="w-full cursor-text truncate text-left text-12-5"
                onClick={onStartRename}
              >
                {attachment.name}
              </button>
            }
          />
          <TooltipContent>Rename</TooltipContent>
        </Tooltip>
      )}
      <div className="flex items-center gap-2">
        <span className="font-heading text-9-5 font-semibold text-muted-foreground">
          {isPdfAttachment(attachment.mime) ? "PDF" : "IMG"}
        </span>
        <span className="text-11 text-muted-foreground tabular-nums">
          {formatBytes(attachment.size)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => triggerDownload(attachment.blob, attachment.name)}
        >
          Download
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            void deleteAttachment(attachment.id).then(() =>
              toast("File removed")
            )
          }
        >
          Remove
        </Button>
      </div>
    </li>
  )
}

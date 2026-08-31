import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { getLastExportDate } from "~/lib/db/app-meta"
import { triggerDownload } from "~/lib/download"
import { gedcomFilename } from "~/lib/export/filenames"
import { exportGedcom } from "~/lib/export/gedcom"
import { InvalidBackupError, importBackup } from "~/lib/export/json"
import { isStoragePersisted } from "~/lib/storage"
import { toast } from "~/lib/ui/toast-store"

interface SettingsViewProps {
  onExportBackup: () => void
  exportToken: number
}

export function SettingsView({
  onExportBackup,
  exportToken,
}: SettingsViewProps) {
  const [inputKey, setInputKey] = useState(0)
  const [pendingFile, setPendingFile] = useState<File | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [importing, setImporting] = useState(false)
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined)
  const [lastExport, setLastExport] = useState<string | undefined>(undefined)

  useEffect(() => {
    void isStoragePersisted().then(setPersisted)
  }, [])
  useEffect(() => {
    void getLastExportDate().then(setLastExport)
  }, [exportToken])

  async function handleExportGedcom() {
    const blob = await exportGedcom()
    triggerDownload(blob, gedcomFilename())
    toast("GEDCOM exported")
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setError(undefined)
      setPendingFile(file)
    }
  }

  function closeImportDialog() {
    setPendingFile(undefined)
    setInputKey((key) => key + 1)
  }

  async function handleConfirmImport() {
    if (!pendingFile) return
    setImporting(true)
    try {
      await importBackup(pendingFile)
      window.location.reload()
    } catch (err) {
      setImporting(false)
      closeImportDialog()
      setError(
        err instanceof InvalidBackupError
          ? err.message
          : "Import failed unexpectedly — no data was changed."
      )
    }
  }

  return (
    <div className="flex max-w-155 flex-1 flex-col gap-7 overflow-y-auto p-6">
      <section className="flex flex-col gap-2">
        <SectionHeading>Storage</SectionHeading>
        <div className="flex items-center gap-2 border border-border p-3">
          <span
            className={
              persisted
                ? "size-2 rounded-full bg-success"
                : "size-2 rounded-full bg-muted-foreground"
            }
          />
          <span className="font-heading text-10 font-semibold tracking-widest uppercase">
            {persisted === undefined
              ? "Checking…"
              : persisted
                ? "Persistent storage granted"
                : "Not persisted"}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Last export{" "}
            {lastExport ? new Date(lastExport).toLocaleString() : "never"}
          </span>
        </div>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Everything lives in this browser. Nothing is uploaded — export a
          backup regularly.
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Export</SectionHeading>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          The JSON backup covers every person, relationship, tree and photo.
          GEDCOM 5.5.1 covers everyone in the pool, for use in other genealogy
          software. PNG and PDF capture the open canvas — export those from the
          Tree view's Export menu.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExportBackup}>JSON backup</Button>
          <Button variant="outline" onClick={() => void handleExportGedcom()}>
            GEDCOM 5.5.1
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Import backup</SectionHeading>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Restoring replaces everything currently stored. This can't be undone.
        </p>
        <Label className="max-w-sm flex-col items-start gap-2 text-sm font-normal normal-case">
          Choose backup file
          <Input
            key={inputKey}
            type="file"
            accept="application/json"
            onChange={handleFileSelected}
          />
        </Label>
        {error && <p className="max-w-md text-sm text-destructive">{error}</p>}
      </section>

      <AlertDialog
        open={!!pendingFile}
        onOpenChange={(open) => !open && closeImportDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all current data?</AlertDialogTitle>
            <AlertDialogDescription>
              Importing "{pendingFile?.name}" wipes every person, relationship,
              tree, and photo currently stored and replaces them with the
              contents of this file. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={importing}
              onClick={handleConfirmImport}
            >
              {importing ? "Importing…" : "Replace data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xs font-semibold tracking-widest uppercase">
      {children}
    </h2>
  )
}

import { useState } from "react"
import { useNavigate } from "react-router"

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
import { triggerDownload } from "~/lib/download"
import { gedcomFilename } from "~/lib/export/filenames"
import { exportGedcom } from "~/lib/export/gedcom"
import {
  InvalidBackupError,
  exportBackup,
  importBackup,
} from "~/lib/export/json"

function backupFilename(): string {
  const date = new Date().toISOString().slice(0, 10)
  return `family-tree-backup-${date}.json`
}

export default function Settings() {
  const navigate = useNavigate()
  const [inputKey, setInputKey] = useState(0)
  const [pendingFile, setPendingFile] = useState<File | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [importing, setImporting] = useState(false)

  async function handleExport() {
    const blob = await exportBackup()
    triggerDownload(blob, backupFilename())
  }

  async function handleExportGedcom() {
    const blob = await exportGedcom()
    triggerDownload(blob, gedcomFilename())
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
      navigate("/")
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
    <div className="flex flex-col gap-8 p-6">
      <h1 className="font-heading text-lg font-semibold tracking-wider uppercase">
        Settings
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold tracking-wider uppercase">
          Export backup
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Download every person, relationship, tree, and photo as a single JSON
          file.
        </p>
        <div>
          <Button onClick={handleExport}>Export backup</Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold tracking-wider uppercase">
          Export GEDCOM
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Download every person and relationship as a GEDCOM 5.5.1 file, for
          use in other genealogy software. Always covers everyone in the pool,
          not just the currently open tree.
        </p>
        <div>
          <Button onClick={handleExportGedcom}>Export GEDCOM</Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold tracking-wider uppercase">
          Import backup
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Restore from a JSON backup file. This replaces all current data — it
          can't be undone.
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

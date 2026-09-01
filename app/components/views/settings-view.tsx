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
import { Select } from "~/components/ui/select"
import { BackupFolderPanel } from "~/components/views/backup-folder-panel"
import { SnapshotsPanel } from "~/components/views/snapshots-panel"
import { StoragePanel } from "~/components/views/storage-panel"
import { getLastExportDate } from "~/lib/db/app-meta"
import { triggerDownload } from "~/lib/download"
import {
  anniversariesIcsFilename,
  gedcomFilename,
  gedcomZipFilename,
} from "~/lib/export/filenames"
import { exportGedcom, exportGedcomZip } from "~/lib/export/gedcom"
import { exportAnniversariesIcs } from "~/lib/export/ics"
import {
  InvalidBackupError,
  importBackup,
  type ImportBackupResult,
} from "~/lib/export/json"
import { announceDataReplaced } from "~/lib/db/use-tab-presence"
import { isStoragePersisted } from "~/lib/storage"
import {
  THEME_OPTIONS,
  useThemeStore,
  type ThemePreference,
} from "~/lib/ui/theme-store"
import { toast } from "~/lib/ui/toast-store"

interface SettingsViewProps {
  onExportBackup: () => void
  exportingBackup?: boolean
  exportToken: number
  // This tab's identity, so a restore can tell the other tabs their view of the
  // data no longer exists.
  tabId: string
}

export function SettingsView({
  onExportBackup,
  exportingBackup,
  exportToken,
  tabId,
}: SettingsViewProps) {
  const [inputKey, setInputKey] = useState(0)
  const [pendingFile, setPendingFile] = useState<File | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportBackupResult | undefined>(
    undefined
  )
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined)
  const [lastExport, setLastExport] = useState<string | undefined>(undefined)

  useEffect(() => {
    void isStoragePersisted().then(setPersisted)
  }, [])
  useEffect(() => {
    void getLastExportDate().then(setLastExport)
  }, [exportToken])

  async function handleExportGedcom() {
    try {
      const blob = await exportGedcom()
      triggerDownload(blob, gedcomFilename())
      toast("GEDCOM exported")
    } catch {
      toast("GEDCOM export failed — nothing was downloaded")
    }
  }

  async function handleExportGedcomZip() {
    try {
      const blob = await exportGedcomZip()
      triggerDownload(blob, gedcomZipFilename())
      toast("GEDCOM and photos exported")
    } catch {
      toast("GEDCOM export failed — nothing was downloaded")
    }
  }

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  async function handleExportIcs() {
    try {
      const blob = await exportAnniversariesIcs()
      triggerDownload(blob, anniversariesIcsFilename())
      toast("Anniversaries exported")
    } catch {
      toast("Calendar export failed — nothing was downloaded")
    }
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
      const imported = await importBackup(pendingFile)
      // Every other tab is now showing people who no longer exist. Told before
      // this tab reloads, because the reload tears down its channel.
      announceDataReplaced(tabId)
      // Reloading destroys any toast before it can render, so a partial
      // restore has to be reported in the dialog the user is already looking
      // at. The clean case keeps the original straight-to-reload behaviour.
      if (imported.missingPhotoIds.length === 0) {
        window.location.reload()
        return
      }
      setResult(imported)
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
        <StoragePanel />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Appearance</SectionHeading>
        <Label className="max-w-56 flex-col items-start gap-1.5 text-sm font-normal normal-case">
          Theme
          <Select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
          >
            {THEME_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Saved in this browser and applied before the page paints, so switching
          to dark doesn&apos;t flash white on every load.
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Backup folder</SectionHeading>
        <BackupFolderPanel />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Snapshots</SectionHeading>
        <SnapshotsPanel tabId={tabId} />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Export</SectionHeading>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          The backup is a .zip holding every person, relationship, tree and
          photo — restore it here to move everything to another browser or
          device. GEDCOM is for other genealogy software: the .zip carries
          photos alongside the .ged, the plain .ged is text only. PNG and PDF
          capture the open canvas — export those from the Tree view's Export
          menu. The .ics file holds birthdays and wedding anniversaries as
          yearly repeating all-day events, for any calendar app; it needs a full
          date, so people recorded with only a year are left out.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={exportingBackup} onClick={onExportBackup}>
            {exportingBackup ? "Exporting…" : "Backup (.zip)"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleExportGedcomZip()}
          >
            GEDCOM + photos (.zip)
          </Button>
          <Button variant="outline" onClick={() => void handleExportGedcom()}>
            GEDCOM 5.5.1 (no photos)
          </Button>
          <Button variant="outline" onClick={() => void handleExportIcs()}>
            Anniversaries (.ics)
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Import backup</SectionHeading>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Restoring replaces everything currently stored. This can't be undone.
          Accepts a .zip backup, or a .json backup from an older version.
        </p>
        <Label className="max-w-sm flex-col items-start gap-2 text-sm font-normal normal-case">
          Choose backup file
          <Input
            key={inputKey}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={handleFileSelected}
          />
        </Label>
        {error && <p className="max-w-md text-sm text-destructive">{error}</p>}
      </section>

      <AlertDialog
        open={!!result}
        onOpenChange={(open) => !open && window.location.reload()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restored, with some photos missing
            </AlertDialogTitle>
            <AlertDialogDescription>
              Restored {result?.counts.people} people and{" "}
              {result?.counts.photos} photos. {result?.missingPhotoIds.length}{" "}
              photos couldn't be read from this file and were skipped — those
              people now show the default avatar. Everything else came through
              intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => window.location.reload()}>
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingFile && !result}
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

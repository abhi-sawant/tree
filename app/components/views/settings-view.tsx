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
  peopleCsvFilename,
} from "~/lib/export/filenames"
import { exportGedcom, exportGedcomZip } from "~/lib/export/gedcom"
import { buildCsvBlob } from "~/lib/export/csv"
import { InvalidCsvError, peopleToCsvRows } from "~/lib/export/people-csv"
import {
  importPeopleCsv,
  type CsvImportSummary,
} from "~/lib/db/import-people-csv"
import { db } from "~/lib/db/db"
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
  // New people from a CSV join the open tree, or they'd exist in the pool and
  // appear on no canvas — which reads as the import having done nothing.
  treeId: string
}

export function SettingsView({
  onExportBackup,
  exportingBackup,
  exportToken,
  tabId,
  treeId,
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

  const [csvInputKey, setCsvInputKey] = useState(0)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<CsvImportSummary | undefined>(
    undefined
  )
  const [csvError, setCsvError] = useState<string | undefined>(undefined)

  async function handleExportCsv() {
    try {
      const [people, relationships] = await Promise.all([
        db.people.toArray(),
        db.relationships.toArray(),
      ])
      triggerDownload(
        buildCsvBlob(peopleToCsvRows({ people, relationships })),
        peopleCsvFilename()
      )
      toast("People exported")
    } catch {
      toast("CSV export failed — nothing was downloaded")
    }
  }

  async function handleCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setCsvInputKey((key) => key + 1)
    if (!file) return

    setCsvError(undefined)
    setCsvImporting(true)
    try {
      const summary = await importPeopleCsv(await file.text(), { treeId })
      setCsvResult(summary)
    } catch (err) {
      setCsvError(
        err instanceof InvalidCsvError
          ? err.message
          : "Couldn't read that file — nothing was changed."
      )
    } finally {
      setCsvImporting(false)
    }
  }

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
      if (
        imported.missingPhotoIds.length === 0 &&
        imported.missingAttachmentIds.length === 0
      ) {
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
          The backup is a .zip holding every person, relationship, tree, photo
          and document — restore it here to move everything to another browser
          or device. GEDCOM is for other genealogy software: the .zip carries
          photos alongside the .ged, the plain .ged is text only. Documents
          aren't carried either way: GEDCOM 5.5.1's media formats don't include
          PDF, and importers tend to drop an OBJE they can't classify rather
          than keep it. PNG and PDF capture the open canvas — export those from
          the Tree view's Export menu. The .ics file holds birthdays and wedding
          anniversaries as yearly repeating all-day events, for any calendar
          app; it needs a full date, so people recorded with only a year are
          left out.
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
        <SectionHeading>Spreadsheet (CSV)</SectionHeading>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          One row per person, with parents and spouses referred to by name — the
          shape families already keep this data in. Importing <em>adds</em> to
          what's here: rows create people or update ones they carry an id for,
          and links are only ever added, never removed. It carries names, sex,
          dates and notes only, so photos, custom fields, marriage dates and how
          a parent-child link came about stay untouched by a round trip. For a
          complete copy, use the backup below.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void handleExportCsv()}>
            Export people (.csv)
          </Button>
          <Label className="flex-col items-start gap-2 text-sm font-normal normal-case">
            <Input
              key={csvInputKey}
              type="file"
              accept=".csv,text/csv"
              disabled={csvImporting}
              onChange={(e) => void handleCsvSelected(e)}
            />
          </Label>
        </div>
        {csvImporting && (
          <p className="text-sm text-muted-foreground">Importing…</p>
        )}
        {csvError && (
          <p className="max-w-md text-sm text-destructive">{csvError}</p>
        )}
        {csvResult && <CsvImportReport result={csvResult} />}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Import backup</SectionHeading>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Restoring replaces everything currently stored — people, photos and
          documents alike. This can't be undone. Accepts a .zip backup, or a
          .json backup from an older version.
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
              Restored, with some files missing
            </AlertDialogTitle>
            <AlertDialogDescription>
              Restored {result?.counts.people} people, {result?.counts.photos}{" "}
              photos and {result?.counts.attachments} documents.{" "}
              {(result?.missingPhotoIds.length ?? 0) > 0 && (
                <>
                  {result?.missingPhotoIds.length} photos couldn't be read from
                  this file and were skipped — those people now show the default
                  avatar.{" "}
                </>
              )}
              {(result?.missingAttachmentIds.length ?? 0) > 0 && (
                <>
                  {result?.missingAttachmentIds.length} documents couldn't be
                  read and were skipped.{" "}
                </>
              )}
              Everything else came through intact.
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
              tree, photo and document currently stored and replaces them with
              the contents of this file. This can't be undone.
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

// Reports what landed and, at equal weight, what didn't. A count of successes
// with no account of the rest is how a mistyped parent name disappears without
// anyone noticing — the failure this format is most prone to.
function CsvImportReport({ result }: { result: CsvImportSummary }) {
  return (
    <div className="flex flex-col gap-2 border border-border p-3">
      <p className="text-13">
        {result.created} added · {result.updated} updated · {result.linksAdded}{" "}
        links recorded
      </p>
      {result.problems.length > 0 && (
        <>
          <p className="font-heading text-9-5 font-semibold tracking-widest text-muted-foreground uppercase">
            {result.problems.length === 1
              ? "1 thing was skipped"
              : `${result.problems.length} things were skipped`}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {result.problems.map((problem, i) => (
              <li key={i} className="text-12-5 text-muted-foreground">
                {problem}
              </li>
            ))}
          </ul>
        </>
      )}
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

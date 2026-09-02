import { useTreeExport } from "~/components/canvas/use-tree-export"
import { triggerDownload } from "~/lib/download"
import {
  anniversariesIcsFilename,
  gedcomFilename,
  gedcomZipFilename,
} from "~/lib/export/filenames"
import { exportGedcom, exportGedcomZip } from "~/lib/export/gedcom"
import { exportAnniversariesIcs } from "~/lib/export/ics"
import { useRedaction } from "~/lib/export/use-redaction"
import { toast } from "~/lib/ui/toast-store"

export interface ExportAction {
  id: string
  label: string
  // Shown under the label on a phone, where there is room for it and the
  // reader has no tooltip to fall back on. The desktop menu shows labels only.
  detail: string
  disabled?: boolean
  run: () => void
}

interface ExportActionsInput {
  treeName: string
  // PNG and PDF capture the live React Flow viewport, so they only mean
  // anything while the canvas is on screen.
  canvasAvailable: boolean
  onExportBackup: () => void
  exportingBackup?: boolean
  onExportFamilyBook: () => void
  exportingFamilyBook?: boolean
}

// One list, two surfaces: the desktop Export menu and the mobile Export sheet.
// Kept here rather than in either of them because a format that exists in one
// and not the other is a format the reader can only reach on some devices
// (D23).
export function useExportActions({
  treeName,
  canvasAvailable,
  onExportBackup,
  exportingBackup,
  onExportFamilyBook,
  exportingFamilyBook,
}: ExportActionsInput): ExportAction[] {
  const { exportPng, exportPdf } = useTreeExport(treeName)
  // Read here rather than passed in, so both surfaces are wired to the same
  // setting by construction. D30: redaction is a decision about what leaves
  // the machine, and an export path that quietly ignores it is the one bug in
  // this area that cannot be taken back.
  const { redactLiving } = useRedaction()

  // Every failure has to say so: these are all fire-and-forget from a click
  // handler, so an unhandled rejection would look like nothing happening.
  const guarded =
    (run: () => Promise<unknown>, ok: string, failed: string) => () => {
      void run().then(
        () => toast(ok),
        () => toast(failed)
      )
    }

  return [
    {
      id: "backup",
      label: exportingBackup ? "Exporting…" : "Backup file (.zip)",
      detail: "Everything, restorable",
      disabled: exportingBackup,
      run: onExportBackup,
    },
    {
      id: "gedcom-zip",
      label: "GEDCOM + photos (.zip)",
      detail: "For other genealogy apps",
      run: guarded(
        () => exportGedcomZip(new Date(), { redactLiving }),
        "GEDCOM and photos exported",
        "GEDCOM export failed — nothing was downloaded"
      ),
    },
    {
      id: "gedcom",
      label: "GEDCOM 5.5.1 (.ged)",
      detail: "No photos",
      run: guarded(
        () => exportGedcom({ redactLiving }),
        "GEDCOM exported",
        "GEDCOM export failed — nothing was downloaded"
      ),
    },
    {
      id: "png",
      label: "Picture of the tree (.png)",
      detail: canvasAvailable
        ? "Current layout, 2× scale"
        : "Open the tree view first",
      disabled: !canvasAvailable,
      run: () => void exportPng(),
    },
    {
      id: "pdf",
      label: "Picture of the tree (.pdf)",
      detail: canvasAvailable
        ? "Current layout, one page"
        : "Open the tree view first",
      disabled: !canvasAvailable,
      run: () => void exportPdf(),
    },
    {
      id: "family-book",
      label: exportingFamilyBook ? "Building…" : "Family book (.pdf)",
      detail: "A page each, this tree only",
      disabled: exportingFamilyBook,
      run: onExportFamilyBook,
    },
    {
      id: "ics",
      label: "Anniversaries (.ics)",
      detail: "Birthdays and marriages, for a calendar",
      run: guarded(
        () => exportAnniversariesIcs(),
        "Anniversaries exported",
        "Calendar export failed — nothing was downloaded"
      ),
    },
  ]
}

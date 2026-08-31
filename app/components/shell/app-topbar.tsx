import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { useTreeExport } from "~/components/canvas/use-tree-export"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { AddExistingPersonDialog } from "~/components/trees/add-existing-person-dialog"
import { ChangeRootDialog } from "~/components/trees/change-root-dialog"
import { DeleteTreeDialog } from "~/components/trees/delete-tree-dialog"
import { RenameTreeDialog } from "~/components/trees/rename-tree-dialog"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { triggerDownload } from "~/lib/download"
import {
  anniversariesIcsFilename,
  gedcomFilename,
  gedcomZipFilename,
} from "~/lib/export/filenames"
import { exportGedcom, exportGedcomZip } from "~/lib/export/gedcom"
import { exportAnniversariesIcs } from "~/lib/export/ics"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { toast } from "~/lib/ui/toast-store"
import { cn } from "~/lib/utils"
import type { Tree } from "~/lib/types"

type TreeDialog =
  "rename" | "delete" | "change-root" | "add-existing" | undefined

interface AppTopbarProps {
  tree: Tree
  trees: Tree[]
  memberCount: number
  generationCount: number
  rootName: string
  onCreateTree: () => void
  onExportBackup: () => void
  exportingBackup?: boolean
}

export function AppTopbar({
  tree,
  trees,
  memberCount,
  generationCount,
  rootName,
  onCreateTree,
  onExportBackup,
  exportingBackup,
}: AppTopbarProps) {
  const view = useAppShellStore((s) => s.view)
  const setView = useAppShellStore((s) => s.setView)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const { exportPng, exportPdf } = useTreeExport(tree.name)

  const [dialog, setDialog] = useState<TreeDialog>(undefined)
  const [addPersonOpen, setAddPersonOpen] = useState(false)

  // PNG and PDF capture the live React Flow viewport, so they only mean
  // anything while the canvas is on screen.
  const canvasExportsAvailable = view === "tree"

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

  async function handleExportIcs() {
    try {
      const blob = await exportAnniversariesIcs()
      triggerDownload(blob, anniversariesIcsFilename())
      toast("Anniversaries exported")
    } catch {
      toast("Calendar export failed — nothing was downloaded")
    }
  }

  return (
    <header className="relative z-30 flex h-15 flex-none items-center justify-between gap-4 border-b border-border px-4">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex cursor-pointer flex-col gap-0.5 text-left"
            >
              <span className="flex items-center gap-1.5 font-heading text-15 font-semibold tracking-wider uppercase">
                {tree.name}
                <ChevronDown className="size-3 text-muted-foreground" />
              </span>
              <span className="text-11 text-muted-foreground">
                {memberCount} people · {generationCount} generations · root{" "}
                {rootName}
              </span>
            </button>
          }
        />
        <DropdownMenuContent className="min-w-56">
          {trees.map((t) => (
            <DropdownMenuItem
              key={t.id}
              disabled={t.id === tree.id}
              onClick={() => {
                setActiveTree(t.id)
                setView("tree")
              }}
            >
              {t.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCreateTree}>New tree…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            Rename tree
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("change-root")}>
            Change root
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("add-existing")}>
            Add existing person
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDialog("delete")}
          >
            Delete tree
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-2">
        <div className="flex border border-border">
          <ViewTab
            label="Tree"
            active={view === "tree"}
            onClick={() => setView("tree")}
          />
          <ViewTab
            label="Table"
            active={view === "table"}
            onClick={() => setView("table")}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                Export <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!canvasExportsAvailable}
              onClick={() => void exportPng()}
            >
              PNG image
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canvasExportsAvailable}
              onClick={() => void exportPdf()}
            >
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportingBackup}
              onClick={onExportBackup}
            >
              {exportingBackup ? "Exporting…" : "Backup (.zip)"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExportGedcomZip()}>
              GEDCOM + photos (.zip)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExportGedcom()}>
              GEDCOM 5.5.1 (no photos)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExportIcs()}>
              Anniversaries (.ics)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={() => setAddPersonOpen(true)}>
          + Add person
        </Button>
      </div>

      <RenameTreeDialog
        open={dialog === "rename"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        tree={tree}
      />
      <ChangeRootDialog
        open={dialog === "change-root"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        tree={tree}
      />
      <AddExistingPersonDialog
        open={dialog === "add-existing"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        treeId={tree.id}
      />
      <DeleteTreeDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        tree={tree}
        onDeleted={() => {
          setDialog(undefined)
          toast("Tree deleted")
        }}
      />
      {addPersonOpen && (
        <PersonFormDialog
          open={addPersonOpen}
          onOpenChange={setAddPersonOpen}
          treeId={tree.id}
        />
      )}
    </header>
  )
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 cursor-pointer px-3 font-heading text-10 font-semibold tracking-widest uppercase",
        active
          ? "bg-foreground text-background"
          : "bg-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

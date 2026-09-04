import { ChevronDown, Plus, Search } from "lucide-react"
import { useState } from "react"

import { TreeSwitcherSheet } from "~/components/shell/topbar-sheets"
import type { ExportAction } from "~/components/shell/export-actions"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { AddExistingPersonDialog } from "~/components/trees/add-existing-person-dialog"
import { ChangeRootDialog } from "~/components/trees/change-root-dialog"
import { DeleteTreeDialog } from "~/components/trees/delete-tree-dialog"
import { RenameTreeDialog } from "~/components/trees/rename-tree-dialog"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useRedaction } from "~/lib/export/use-redaction"
import { usePeople } from "~/lib/db/hooks"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useIsMobile } from "~/lib/ui/viewport-tier"
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
  exportActions: ExportAction[]
}

export function AppTopbar({
  tree,
  trees,
  memberCount,
  generationCount,
  rootName,
  onCreateTree,
  exportActions,
}: AppTopbarProps) {
  const view = useAppShellStore((s) => s.view)
  const setView = useAppShellStore((s) => s.setView)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setPaletteOpen = useAppShellStore((s) => s.setPaletteOpen)
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)
  const isMobile = useIsMobile()
  const people = usePeople()
  const { redactLiving, setRedactLiving, presumedLivingCount } = useRedaction()

  const [dialog, setDialog] = useState<TreeDialog>(undefined)
  const [addPersonOpen, setAddPersonOpen] = useState(false)

  // The tree's identity, shared by both layouts. The root name is dropped on a
  // phone: three facts don't fit one line at 390px, and which tree is open
  // plus how big it is are the two the reader is choosing between.
  const treeTitle = (
    <>
      <span
        className={cn(
          "flex items-center gap-1.5 font-heading font-semibold",
          isMobile ? "text-base" : "text-15"
        )}
      >
        <span className="truncate">{tree.name}</span>
        <ChevronDown className="size-3 flex-none text-muted-foreground" />
      </span>
      <span
        className={cn(
          "truncate text-muted-foreground",
          isMobile ? "text-11" : "text-11"
        )}
      >
        {memberCount} people · {generationCount} generations
        {!isMobile && <> · root {rootName}</>}
      </span>
    </>
  )

  const viewSwitch = (
    <div className="flex gap-0.5 rounded-full border border-border p-0.5">
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
  )

  const treeDialogs = (
    <>
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
    </>
  )

  // ── Phone ────────────────────────────────────────────────────────────────
  // One row: identity and the two things worth a permanent button (search,
  // add). The view switch, Export and view-options overflow used to live in a
  // second row here, but each duplicated a control that already exists
  // elsewhere on a phone — People in the bottom bar, Export there too, and
  // view-options in the canvas's own corner stack — so the row is gone.
  if (isMobile) {
    return (
      <header
        data-print="hide"
        className="relative z-30 flex h-14 flex-none items-center gap-1 border-b border-border pr-2 pl-4"
      >
        <button
          type="button"
          onClick={() => setMobileSheet("tree-switcher")}
          className="flex min-w-0 cursor-pointer flex-col gap-0.5 text-left"
        >
          {treeTitle}
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Search ${people?.length ?? 0} people`}
          className="ml-auto"
          onClick={() => setPaletteOpen(true)}
        >
          <Search />
        </Button>
        <Button
          size="icon-sm"
          aria-label="Add person"
          onClick={() => setAddPersonOpen(true)}
        >
          <Plus />
        </Button>

        <TreeSwitcherSheet
          tree={tree}
          trees={trees}
          people={people ?? []}
          onRename={() => setDialog("rename")}
          onChangeRoot={() => setDialog("change-root")}
          onAddExisting={() => setDialog("add-existing")}
          onCreateTree={onCreateTree}
          onDelete={() => setDialog("delete")}
        />
        {treeDialogs}
      </header>
    )
  }

  // ── Tablet and desktop ───────────────────────────────────────────────────
  return (
    <header
      data-print="hide"
      className="relative z-30 flex h-15 flex-none items-center justify-between gap-4 border-b border-border px-4"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 cursor-pointer flex-col gap-0.5 text-left"
            >
              {treeTitle}
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
        {viewSwitch}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                Export <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuCheckboxItem
              checked={redactLiving}
              closeOnClick={false}
              onCheckedChange={setRedactLiving}
            >
              Redact living people
            </DropdownMenuCheckboxItem>
            <div className="px-2 pb-1.5 text-11 leading-snug text-muted-foreground">
              {presumedLivingCount === 0
                ? "Everyone recorded has a death date or was born long enough ago to presume one."
                : `Withholds the name, dates, notes and photos of ${presumedLivingCount} ${presumedLivingCount === 1 ? "person" : "people"} with no recorded death. The canvas shows exactly what will be exported.`}
            </div>
            <DropdownMenuSeparator />
            {exportActions.map((action) => (
              <DropdownMenuItem
                key={action.id}
                disabled={action.disabled}
                onClick={action.run}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={() => setAddPersonOpen(true)}>
          + Add person
        </Button>
      </div>

      {treeDialogs}
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
        "h-7.5 cursor-pointer rounded-full px-3 font-heading text-xs font-semibold",
        active
          ? "bg-foreground text-background"
          : "bg-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

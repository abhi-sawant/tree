import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Download,
  HeartPulse,
  Images,
  Network,
  Plus,
  Search,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"
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
import { BrandMark } from "~/components/shell/brand-mark"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useSetView, useView } from "~/lib/ui/use-shell-view"
import type { ShellView } from "~/lib/ui/routes"
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
  const view = useView()
  const setView = useSetView()
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
  // One bar carries everything that used to be split between a rail and a
  // header: where you are (the tabs), who you are looking for (search), and the
  // two things you do most (export, add). Labels drop to icons below xl, so the
  // same bar fits a tablet without a second layout.
  return (
    <header
      data-print="hide"
      className="relative z-30 flex h-18 flex-none items-center gap-3 border-b border-border bg-card px-5 xl:gap-5"
    >
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <span className="font-heading text-xl font-bold tracking-tight max-[1500px]:hidden">
          Family Tree
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Tree: ${tree.name}`}
              className="flex h-10 max-w-48 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-card px-3 text-sm font-semibold hover:border-foreground/60"
            >
              <span className="truncate">{tree.name}</span>
              <ChevronDown className="size-3.5 flex-none text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent className="min-w-56">
          <div className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            {memberCount} people · {generationCount} generations · root{" "}
            {rootName}
          </div>
          <DropdownMenuSeparator />
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

      <nav aria-label="Main" className="flex h-full items-stretch">
        {TOP_TABS.map(({ label, target, icon: Icon }) => {
          const active = view === target
          return (
            <button
              key={target}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={label}
              title={label}
              onClick={() => setView(target)}
              className={cn(
                "relative flex cursor-pointer items-center gap-2 px-3 text-15 font-semibold whitespace-nowrap transition-colors",
                active
                  ? "text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-1 after:rounded-t-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4.5" />
              <span className="max-[1360px]:hidden">{label}</span>
            </button>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="mx-auto flex h-11 max-w-lg min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 border-transparent bg-background px-4 text-left font-medium text-muted-foreground hover:border-border hover:bg-card"
      >
        <Search className="size-4.5 flex-none" />
        <span className="truncate">Find anyone…</span>
        <kbd className="ml-auto flex-none rounded-md border border-border bg-card px-1.5 text-11 font-bold max-lg:hidden">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Export">
                <Download className="size-4.5" />
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          title="Settings"
          className={view === "settings" ? "bg-muted" : undefined}
          onClick={() => setView("settings")}
        >
          <Settings className="size-4.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Help"
          title="Help (?)"
          className={view === "help" ? "bg-muted" : undefined}
          onClick={() => setView("help")}
        >
          <CircleHelp className="size-4.5" />
        </Button>
      </div>

      <Button size="lg" onClick={() => setAddPersonOpen(true)}>
        <UserPlus className="size-4" />
        <span className="max-[1360px]:hidden">Add person</span>
      </Button>

      {treeDialogs}
    </header>
  )
}

const TOP_TABS: Array<{ label: string; target: ShellView; icon: LucideIcon }> =
  [
    { label: "Tree", target: "tree", icon: Network },
    { label: "People", target: "table", icon: Users },
    { label: "Photos", target: "photos", icon: Images },
    { label: "Insights", target: "insights", icon: BarChart3 },
    { label: "Health check", target: "health", icon: HeartPulse },
  ]

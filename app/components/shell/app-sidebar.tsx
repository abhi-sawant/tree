import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import { useMembers, usePeople } from "~/lib/db/hooks"
import { getLastExportDate } from "~/lib/db/app-meta"
import { isStoragePersisted } from "~/lib/storage"
import { useAppShellStore, type ShellView } from "~/lib/ui/app-shell-store"
import { cn } from "~/lib/utils"
import type { Tree } from "~/lib/types"

interface AppSidebarProps {
  trees: Tree[]
  activeTreeId: string | undefined
  onCreateTree: () => void
  onExportBackup: () => void
  exportingBackup?: boolean
  // Bumped by whatever last wrote a backup, so the "Last backup" line
  // refreshes without the sidebar having to poll app-meta.
  exportToken: number
}

export function AppSidebar({
  trees,
  activeTreeId,
  onCreateTree,
  onExportBackup,
  exportingBackup,
  exportToken,
}: AppSidebarProps) {
  const people = usePeople()
  const members = useMembers()
  const view = useAppShellStore((s) => s.view)
  const setView = useAppShellStore((s) => s.setView)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setPaletteOpen = useAppShellStore((s) => s.setPaletteOpen)

  const [persisted, setPersisted] = useState<boolean | undefined>(undefined)
  const [lastExport, setLastExport] = useState<string | undefined>(undefined)

  useEffect(() => {
    void isStoragePersisted().then(setPersisted)
  }, [])
  useEffect(() => {
    void getLastExportDate().then(setLastExport)
  }, [exportToken])

  const memberCount = (treeId: string) =>
    (members ?? []).filter((m) => m.treeId === treeId).length

  return (
    <div
      data-print="hide"
      className="flex w-53 flex-none flex-col gap-4.5 border-r border-border bg-sidebar px-3 py-4"
    >
      <div className="flex items-center gap-2 px-1">
        <div className="flex size-5.5 items-center justify-center bg-primary font-heading text-11 font-bold text-primary-foreground">
          FT
        </div>
        <span className="font-heading text-xs font-semibold tracking-widest uppercase">
          Family Tree
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-8 cursor-pointer items-center gap-1.5 border border-border bg-background px-2 text-left hover:bg-muted"
      >
        <span className="text-11 text-muted-foreground">⌕</span>
        <span className="text-xs text-muted-foreground">
          Search {people?.length ?? 0} people
        </span>
        <span className="ml-auto border border-border px-1 text-10 font-medium text-muted-foreground">
          ⌘K
        </span>
      </button>

      <div className="flex flex-col gap-0.5">
        <SidebarLabel>Trees</SidebarLabel>
        {trees.map((tree) => {
          const active = tree.id === activeTreeId
          return (
            <button
              key={tree.id}
              type="button"
              onClick={() => {
                setActiveTree(tree.id)
                setView("tree")
              }}
              className={cn(
                "flex h-8.5 w-full cursor-pointer items-center gap-2 border-l-2 px-2 text-left hover:bg-muted",
                active
                  ? "border-primary bg-primary/10"
                  : "border-transparent bg-transparent"
              )}
            >
              <span className="truncate text-xs font-semibold">
                {tree.name}
              </span>
              <span className="ml-auto text-11 text-muted-foreground">
                {memberCount(tree.id)}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={onCreateTree}
          className="flex h-8.5 w-full cursor-pointer items-center px-2.5 text-left text-xs text-muted-foreground hover:bg-muted"
        >
          + New tree
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <SidebarLabel>Library</SidebarLabel>
        <SidebarNavItem
          label="People"
          target="table"
          view={view}
          onSelect={setView}
        />
        <SidebarNavItem
          label="Photo wall"
          target="photos"
          view={view}
          onSelect={setView}
        />
        <SidebarNavItem
          label="Insights"
          target="insights"
          view={view}
          onSelect={setView}
        />
        <SidebarNavItem
          label="Health"
          target="health"
          view={view}
          onSelect={setView}
        />
        <SidebarNavItem
          label="Settings"
          target="settings"
          view={view}
          onSelect={setView}
        />
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border border-border bg-background p-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              persisted ? "bg-success" : "bg-muted-foreground"
            )}
          />
          <span className="font-heading text-10 font-semibold tracking-widest uppercase">
            {persisted === undefined
              ? "Checking storage"
              : persisted
                ? "Storage persisted"
                : "Not persisted"}
          </span>
        </div>
        <p className="text-11 leading-snug text-muted-foreground">
          Last backup{" "}
          {lastExport ? new Date(lastExport).toLocaleDateString() : "never"}.
        </p>
        <Button
          variant="link"
          size="xs"
          className="h-auto justify-start p-0 text-11 tracking-normal normal-case"
          disabled={exportingBackup}
          onClick={onExportBackup}
        >
          {exportingBackup ? "Exporting…" : "Export now"}
        </Button>
      </div>
    </div>
  )
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-1 mb-1.5 font-heading text-10 font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function SidebarNavItem({
  label,
  target,
  view,
  onSelect,
}: {
  label: string
  target: ShellView
  view: ShellView
  onSelect: (view: ShellView) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(target)}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center px-2.5 text-left text-xs hover:bg-muted",
        view === target ? "bg-accent" : "bg-transparent"
      )}
    >
      {label}
    </button>
  )
}

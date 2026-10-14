import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useMembers, usePeople } from "~/lib/db/hooks"
import { getLastExportDate } from "~/lib/db/app-meta"
import { isStoragePersisted } from "~/lib/storage"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useSetView, useView } from "~/lib/ui/use-shell-view"
import type { ShellView } from "~/lib/ui/routes"
import { cn } from "~/lib/utils"
import type { Tree } from "~/lib/types"
import {
  BarChart3,
  CirclePlus,
  HeartPulse,
  HelpCircle,
  Images,
  Search,
  Settings,
  ShieldCheck,
  Trees as TreesIcon,
  Users,
} from "lucide-react"
import { ColorLegend } from "~/components/shell/color-legend"

// One list, three consumers: the desktop rail, the tablet icon rail and the
// mobile More page all offer the same destinations, and a nav item that exists
// in two of the three is how a feature quietly becomes unreachable on a phone
// (D23 — share the rule, not the copy).
//
// `onBottomBar` marks the two the mobile bottom bar already carries, so the
// More page can leave them out without a second list to keep in step.
const NAV_ITEMS: Array<{
  label: string
  target: ShellView
  icon: typeof Users
  hint?: string
  onBottomBar?: boolean
}> = [
  { label: "People", target: "table", icon: Users, onBottomBar: true },
  { label: "Photo wall", target: "photos", icon: Images, onBottomBar: true },
  { label: "Insights", target: "insights", icon: BarChart3 },
  { label: "Health", target: "health", icon: HeartPulse },
  { label: "Settings", target: "settings", icon: Settings },
  { label: "Help", target: "help", icon: HelpCircle, hint: "?" },
]

export interface SidebarContentProps {
  trees: Tree[]
  activeTreeId: string | undefined
  onCreateTree: () => void
  onExportBackup: () => void
  exportingBackup?: boolean
  // Bumped by whatever last wrote a backup, so the "Last backup" line
  // refreshes without the sidebar having to poll app-meta.
  exportToken: number
  // "full" is the desktop side panel, "page" the mobile More screen.
  variant: "full" | "page"
  // Mobile only: dismiss the More page.
  onClose?: () => void
}

export function SidebarContent({
  trees,
  activeTreeId,
  onCreateTree,
  onExportBackup,
  exportingBackup,
  exportToken,
  variant,
  onClose,
}: SidebarContentProps) {
  const people = usePeople()
  const members = useMembers()
  const view = useView()
  const setView = useSetView()
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setPaletteOpen = useAppShellStore((s) => s.setPaletteOpen)
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)

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

  const openTree = (treeId: string) => {
    setActiveTree(treeId)
    setView("tree")
  }

  if (variant === "full") {
    return (
      <>
        <div className="flex flex-col gap-0.5">
          <SidebarLabel>Your trees</SidebarLabel>
          {trees.map((tree) => {
            const active = tree.id === activeTreeId
            return (
              <button
                key={tree.id}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => openTree(tree.id)}
                className={cn(
                  "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-semibold hover:bg-muted",
                  active && "bg-muted"
                )}
              >
                <TreesIcon className="size-4.5 flex-none text-muted-foreground" />
                <span className="truncate">{tree.name}</span>
                <span className="ml-auto text-xs font-medium text-muted-foreground">
                  {memberCount(tree.id)}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={onCreateTree}
            className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-semibold text-primary hover:bg-accent"
          >
            <CirclePlus className="size-4.5 flex-none" />
            New tree
          </button>
        </div>

        <ColorLegend activeTreeId={activeTreeId} />

        <div className="mt-auto flex flex-col gap-1 px-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-semibold text-foreground/80">
            <ShieldCheck
              className={cn(
                "size-4",
                persisted ? "text-success" : "text-muted-foreground"
              )}
            />
            {persisted === undefined
              ? "Checking storage"
              : persisted
                ? "Saved on this device"
                : "Storage not persisted"}
          </span>
          <span>
            Last backup{" "}
            {lastExport ? new Date(lastExport).toLocaleDateString() : "never"}
          </span>
          <button
            type="button"
            disabled={exportingBackup}
            onClick={onExportBackup}
            className="w-fit cursor-pointer font-semibold text-primary underline underline-offset-4 disabled:opacity-50"
          >
            {exportingBackup ? "Exporting…" : "Back up now"}
          </button>
        </div>
      </>
    )
  }

  const page = variant === "page"

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-1",
          page && "h-14 gap-3 border-b border-border px-4"
        )}
      >
        <div
          className={cn(
            "flex size-5.5 items-center justify-center rounded-lg bg-primary font-heading text-11 font-bold text-primary-foreground",
            page && "size-6.5 text-xs"
          )}
        >
          FT
        </div>
        <span
          className={cn(
            "font-heading text-xs font-semibold",
            page && "text-base"
          )}
        >
          Family Tree
        </span>
        {page && onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="ml-auto"
            onClick={onClose}
          >
            ✕
          </Button>
        )}
      </div>

      <div className={cn("flex flex-col gap-4.5", page && "px-4 pt-4")}>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "w-full justify-start gap-1.5 px-2 tracking-normal normal-case",
            page && "h-12 gap-2.5 px-4"
          )}
        >
          <Search className="text-muted-foreground" />
          <span
            className={cn("text-xs text-muted-foreground", page && "text-sm")}
          >
            Search {people?.length ?? 0} people
          </span>
          {!page && (
            <span className="ml-auto rounded-full border border-border px-1 text-10 font-medium text-muted-foreground">
              ⌘K
            </span>
          )}
        </Button>

        <div className="flex flex-col gap-0.5">
          <SidebarLabel>Trees</SidebarLabel>
          {trees.map((tree) => {
            const active = tree.id === activeTreeId
            return (
              <button
                key={tree.id}
                type="button"
                onClick={() => openTree(tree.id)}
                className={cn(
                  "flex h-8.5 w-full cursor-pointer items-center gap-2 rounded-full px-2 text-left hover:bg-muted",
                  page && "h-13 gap-3 rounded-xl px-3.5",
                  active ? "bg-primary/10" : "bg-transparent"
                )}
              >
                <span className={cn("truncate text-xs font-semibold")}>
                  {tree.name}
                </span>
                <span className={cn("ml-auto text-xs text-muted-foreground")}>
                  {memberCount(tree.id)}
                </span>
              </button>
            )
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCreateTree}
            className={cn(
              "w-full justify-start tracking-normal normal-case",
              page && "h-12 px-3.5 text-primary"
            )}
          >
            + New tree
          </Button>
        </div>

        <div className="flex flex-col gap-0.5">
          <SidebarLabel>Library</SidebarLabel>
          {NAV_ITEMS.filter((item) => !(page && item.onBottomBar)).map(
            ({ label, target, hint }) => (
              <button
                key={target}
                type="button"
                onClick={() => setView(target)}
                className={cn(
                  "flex h-8 w-full cursor-pointer items-center rounded-full px-2.5 text-left text-xs hover:bg-muted",
                  page && "h-13 rounded-xl px-3.5 text-15",
                  view === target ? "bg-accent" : "bg-transparent"
                )}
              >
                {label}
                {page ? (
                  <span className="ml-auto text-muted-foreground">›</span>
                ) : (
                  hint && (
                    <span className="ml-auto rounded-full border border-border px-1 text-10 font-medium text-muted-foreground">
                      {hint}
                    </span>
                  )
                )}
              </button>
            )
          )}
          {/* The canvas outline is a rail on a wide screen and a screen of its
              own on a phone, so it is only listed where it is a destination. */}
          {page && <TreeOutlineNavItem />}
        </div>
      </div>

      <div
        className={cn(
          "mt-auto flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5",
          page &&
            "mx-4 mb-[calc(1rem+env(safe-area-inset-bottom,0px))] gap-2 rounded-xl p-3.5"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              persisted ? "bg-success" : "bg-muted-foreground"
            )}
          />
          <span
            className={cn(
              "font-heading text-10 font-semibold",
              page && "text-12-5"
            )}
          >
            {persisted === undefined
              ? "Checking storage"
              : persisted
                ? "Storage persisted"
                : "Not persisted"}
          </span>
        </div>
        <p
          className={cn(
            "text-xs leading-snug text-muted-foreground",
            page && "text-xs"
          )}
        >
          Last backup{" "}
          {lastExport ? new Date(lastExport).toLocaleDateString() : "never"}.
        </p>
        <Button
          variant="link"
          size="xs"
          className={cn(
            "h-auto justify-start p-0 text-11 tracking-normal normal-case",
            page && "text-12-5"
          )}
          disabled={exportingBackup}
          onClick={onExportBackup}
        >
          {exportingBackup ? "Exporting…" : "Export now"}
        </Button>
      </div>
    </>
  )
}

// The outline lives in the canvas UI store rather than being a ShellView, so
// it needs its own row instead of joining NAV_ITEMS.
function TreeOutlineNavItem() {
  const setView = useSetView()
  return (
    <button
      type="button"
      onClick={() => {
        // Turning the outline on and going to the canvas is one action on a
        // phone: the outline IS the screen there, not a panel beside one.
        setView("tree")
        const { showOutline, toggleOutline } = useCanvasUIStore.getState()
        if (!showOutline) toggleOutline()
      }}
      className="flex h-13 w-full cursor-pointer items-center rounded-xl px-3.5 text-left text-15 hover:bg-muted"
    >
      Tree outline
      <span className="ml-auto text-muted-foreground">›</span>
    </button>
  )
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-1 mb-1.5 text-13 font-bold text-muted-foreground">
      {children}
    </p>
  )
}

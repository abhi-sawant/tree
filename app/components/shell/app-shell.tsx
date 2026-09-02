import { useEffect, useMemo, useState } from "react"

import { AppSidebar } from "~/components/shell/app-sidebar"
import { AppTopbar } from "~/components/shell/app-topbar"
import { MobileBottomNav } from "~/components/shell/mobile-bottom-nav"
import { BackupNudgeBanner } from "~/components/shell/backup-nudge"
import { TabNotice } from "~/components/shell/tab-notice"
import { CommandPalette } from "~/components/shell/command-palette"
import { CreateTreeDialog } from "~/components/trees/create-tree-dialog"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { Toaster } from "~/components/ui/toast"
import { HealthView } from "~/components/views/health-view"
import { HelpView } from "~/components/views/help-view"
import { InsightsView } from "~/components/views/insights-view"
import { MoreView } from "~/components/views/more-view"
import { PhotoWallView } from "~/components/views/photo-wall-view"
import { SettingsView } from "~/components/views/settings-view"
import { TableView } from "~/components/views/table-view"
import { TreeView } from "~/components/views/tree-view"
import { useBackupNudge } from "~/lib/backup/use-backup-nudge"
import { useHelpShortcut } from "~/lib/help/use-help-shortcut"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useTreeMembers } from "~/lib/db/hooks"
import { clearBackupNudgeDismissal, setLastExportDate } from "~/lib/db/app-meta"
import { triggerDownload } from "~/lib/download"
import { backupFilename, familyBookFilename } from "~/lib/export/filenames"
import { buildFamilyBookPdf } from "~/lib/export/family-book-export"
import { usePrivacyStore } from "~/lib/ui/privacy-store"
import { exportBackup } from "~/lib/export/json"
import type { UnionNode } from "~/lib/graph/derive-unions"
import type { TabPresenceState } from "~/lib/db/use-tab-presence"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useIsMobile } from "~/lib/ui/viewport-tier"
import { toast } from "~/lib/ui/toast-store"
import type { Person, Relationship, Tree } from "~/lib/types"

interface AppShellProps {
  tree: Tree
  trees: Tree[]
  people: Person[]
  relationships: Relationship[]
  unions: UnionNode[]
  generations: Map<string, number>
  tabs: TabPresenceState
}

export function AppShell({
  tree,
  trees,
  people,
  relationships,
  unions,
  generations,
  tabs,
}: AppShellProps) {
  const view = useAppShellStore((s) => s.view)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setView = useAppShellStore((s) => s.setView)
  const treeMembers = useTreeMembers(tree.id)
  const isMobile = useIsMobile()
  // "?" opens the help from wherever the reader is, not only the canvas.
  useHelpShortcut()

  // A node selected in a previously-open tree has no meaning in this one,
  // and neither does a generation hidden there. This lives here rather than
  // in TreeView because TreeView unmounts whenever the table or settings
  // view is showing, and remounting it must not throw the selection away.
  const select = useCanvasUIStore((s) => s.select)
  const resetHiddenGenerations = useCanvasUIStore(
    (s) => s.resetHiddenGenerations
  )
  const clearFocus = useCanvasUIStore((s) => s.clearFocus)
  useEffect(() => {
    select(null)
    resetHiddenGenerations()
    clearFocus()
  }, [tree.id, select, resetHiddenGenerations, clearFocus])

  const [createTreeOpen, setCreateTreeOpen] = useState(false)
  const [addPersonOpen, setAddPersonOpen] = useState(false)
  // Set when the add form is opened from search with a name already typed.
  const [addPersonPrefill, setAddPersonPrefill] = useState<string | undefined>(
    undefined
  )
  const [exportingBackup, setExportingBackup] = useState(false)
  const [exportingBook, setExportingBook] = useState(false)
  const redactLiving = usePrivacyStore((s) => s.redactLiving)
  // Nudged after every backup so the sidebar and Settings re-read app-meta.
  const [exportToken, setExportToken] = useState(0)

  const backupNudge = useBackupNudge(people, exportToken)

  const memberIds = useMemo(
    () => new Set((treeMembers ?? []).map((m) => m.personId)),
    [treeMembers]
  )

  // Generation numbering shown in the chrome is scoped to this tree — a
  // relative who only exists in another tree shouldn't inflate the count.
  const generationCount = useMemo(() => {
    let max = -1
    for (const personId of memberIds) {
      const generation = generations.get(personId)
      if (generation !== undefined && generation > max) max = generation
    }
    return max + 1
  }, [memberIds, generations])

  const rootName = useMemo(() => {
    const root = people.find((p) => p.id === tree.rootPersonId)
    if (!root) return "—"
    return (
      [root.givenName, root.familyName].filter(Boolean).join(" ") || "Unnamed"
    )
  }, [people, tree.rootPersonId])

  // Every call site is `() => void handleExportBackup()`, so an unhandled
  // rejection here would vanish silently — the user would click Export and see
  // nothing at all happen. Reading every photo into one archive is also the
  // most likely thing in the app to run out of memory, so it has to report.
  async function handleExportBackup() {
    if (exportingBackup) return
    setExportingBackup(true)
    try {
      const blob = await exportBackup()
      triggerDownload(blob, backupFilename())
      // Only on success: "Last export" is a storage-risk signal, and a date
      // written after a failed export would be actively misleading.
      await setLastExportDate()
      // A dismissal that outlived the thing it dismissed would swallow the next
      // nudge a week into the following month.
      await clearBackupNudgeDismissal()
      setExportToken((t) => t + 1)
      toast("Backup exported")
    } catch {
      toast("Backup export failed — nothing was downloaded")
    } finally {
      setExportingBackup(false)
    }
  }

  // Scoped to the open tree's members, not the whole pool: a family book is a
  // document about one family, and a book of everyone the browser happens to
  // hold is not a thing anyone would hand to a relative.
  async function handleExportFamilyBook() {
    if (exportingBook) return
    const members = people.filter((person) => memberIds.has(person.id))
    if (members.length === 0) {
      toast("Nothing to print — this tree has no people in it yet")
      return
    }
    setExportingBook(true)
    try {
      const blob = await buildFamilyBookPdf({
        tree,
        people: members,
        relationships,
        generations,
        redactLiving,
      })
      triggerDownload(blob, familyBookFilename(tree.name))
      toast("Family book exported")
    } catch {
      toast("Family book export failed — nothing was downloaded")
    } finally {
      setExportingBook(false)
    }
  }

  const sidebarProps = {
    trees,
    activeTreeId: tree.id,
    onCreateTree: () => setCreateTreeOpen(true),
    onExportBackup: () => void handleExportBackup(),
    exportingBackup,
    exportToken,
  }

  return (
    // h-dvh rather than h-svh: with a bottom bar in the layout, sizing to the
    // *small* viewport leaves the bar permanently under the browser's own
    // chrome on a phone.
    <div data-print="flow" className="flex h-dvh w-full max-md:flex-col">
      <AppSidebar {...sidebarProps} />

      <div data-print="flow" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* On a phone the topbar is the *canvas* chrome — the tree's name, the
            view switch, export. Every other view owns its own header there
            (People its count and add button, Settings a back arrow), because a
            tree title above the photo wall names something the reader is not
            looking at. On a wide screen it is the shell's header as before. */}
        {(!isMobile || view === "tree") && (
          <AppTopbar
            tree={tree}
            trees={trees}
            memberCount={memberIds.size}
            generationCount={generationCount}
            rootName={rootName}
            onCreateTree={() => setCreateTreeOpen(true)}
            onExportBackup={() => void handleExportBackup()}
            exportingBackup={exportingBackup}
            onExportFamilyBook={() => void handleExportFamilyBook()}
            exportingFamilyBook={exportingBook}
          />
        )}

        <TabNotice
          peerCount={tabs.peerCount}
          dataReplaced={tabs.dataReplaced}
        />

        <BackupNudgeBanner
          verdict={backupNudge.verdict}
          exporting={exportingBackup}
          onExport={() => void handleExportBackup()}
          onDismiss={backupNudge.dismiss}
        />

        {view === "tree" && (
          <TreeView
            tree={tree}
            people={people}
            relationships={relationships}
            unions={unions}
            generations={generations}
            generationCount={generationCount}
            onAddPerson={() => setAddPersonOpen(true)}
          />
        )}
        {view === "table" && (
          <TableView
            relationships={relationships}
            generations={generations}
            totalPeople={people.length}
          />
        )}
        {view === "photos" && (
          <PhotoWallView tree={tree} people={people} memberIds={memberIds} />
        )}
        {view === "insights" && (
          <InsightsView
            tree={tree}
            people={people.filter((person) => memberIds.has(person.id))}
            relationships={relationships}
          />
        )}
        {view === "health" && (
          <HealthView
            people={people}
            relationships={relationships}
            memberIds={memberIds}
          />
        )}
        {view === "help" && <HelpView />}
        {view === "more" && <MoreView {...sidebarProps} />}
        {view === "settings" && (
          <SettingsView
            onExportBackup={() => void handleExportBackup()}
            exportingBackup={exportingBackup}
            exportToken={exportToken}
            tabId={tabs.tabId}
            treeId={tree.id}
          />
        )}
      </div>

      {isMobile && <MobileBottomNav />}

      <CommandPalette
        generations={generations}
        memberIds={memberIds}
        onAddPerson={(givenName) => {
          setAddPersonPrefill(givenName || undefined)
          setAddPersonOpen(true)
        }}
      />
      <Toaster />

      <CreateTreeDialog
        open={createTreeOpen}
        onOpenChange={setCreateTreeOpen}
        onCreated={(newTree) => {
          setCreateTreeOpen(false)
          setActiveTree(newTree.id)
          setView("tree")
          toast("Tree created")
        }}
      />
      {addPersonOpen && (
        <PersonFormDialog
          open={addPersonOpen}
          onOpenChange={(open) => {
            setAddPersonOpen(open)
            if (!open) setAddPersonPrefill(undefined)
          }}
          treeId={tree.id}
          prefill={
            addPersonPrefill ? { givenName: addPersonPrefill } : undefined
          }
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from "react"

import { AppSidebar } from "~/components/shell/app-sidebar"
import { AppTopbar } from "~/components/shell/app-topbar"
import { BackupNudgeBanner } from "~/components/shell/backup-nudge"
import { CommandPalette } from "~/components/shell/command-palette"
import { CreateTreeDialog } from "~/components/trees/create-tree-dialog"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { Toaster } from "~/components/ui/toast"
import { HealthView } from "~/components/views/health-view"
import { InsightsView } from "~/components/views/insights-view"
import { SettingsView } from "~/components/views/settings-view"
import { TableView } from "~/components/views/table-view"
import { TreeView } from "~/components/views/tree-view"
import { useBackupNudge } from "~/lib/backup/use-backup-nudge"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useTreeMembers } from "~/lib/db/hooks"
import { clearBackupNudgeDismissal, setLastExportDate } from "~/lib/db/app-meta"
import { triggerDownload } from "~/lib/download"
import { backupFilename } from "~/lib/export/filenames"
import { exportBackup } from "~/lib/export/json"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { toast } from "~/lib/ui/toast-store"
import type { Person, Relationship, Tree } from "~/lib/types"

interface AppShellProps {
  tree: Tree
  trees: Tree[]
  people: Person[]
  relationships: Relationship[]
  unions: UnionNode[]
  generations: Map<string, number>
}

export function AppShell({
  tree,
  trees,
  people,
  relationships,
  unions,
  generations,
}: AppShellProps) {
  const view = useAppShellStore((s) => s.view)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setView = useAppShellStore((s) => s.setView)
  const treeMembers = useTreeMembers(tree.id)

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
  const [exportingBackup, setExportingBackup] = useState(false)
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

  return (
    <div className="flex h-svh w-full">
      <AppSidebar
        trees={trees}
        activeTreeId={tree.id}
        onCreateTree={() => setCreateTreeOpen(true)}
        onExportBackup={() => void handleExportBackup()}
        exportingBackup={exportingBackup}
        exportToken={exportToken}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          tree={tree}
          trees={trees}
          memberCount={memberIds.size}
          generationCount={generationCount}
          rootName={rootName}
          onCreateTree={() => setCreateTreeOpen(true)}
          onExportBackup={() => void handleExportBackup()}
          exportingBackup={exportingBackup}
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
        {view === "settings" && (
          <SettingsView
            onExportBackup={() => void handleExportBackup()}
            exportingBackup={exportingBackup}
            exportToken={exportToken}
          />
        )}
      </div>

      <CommandPalette generations={generations} memberIds={memberIds} />
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
          onOpenChange={setAddPersonOpen}
          treeId={tree.id}
        />
      )}
    </div>
  )
}

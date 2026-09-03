import { ReactFlowProvider } from "@xyflow/react"
import { useEffect, useMemo, useState } from "react"

import { AppShell } from "~/components/shell/app-shell"
import { CreateTreeDialog } from "~/components/trees/create-tree-dialog"
import { Button } from "~/components/ui/button"
import { Toaster } from "~/components/ui/toast"
import { TooltipProvider } from "~/components/ui/tooltip"
import { useAutoSnapshots } from "~/lib/backup/use-auto-snapshots"
import { useFolderBackup } from "~/lib/backup/use-folder-backup"
import { usePeople, useRelationships, useTrees } from "~/lib/db/hooks"
import { useChangeStamp } from "~/lib/db/use-change-stamp"
import { useTabPresence } from "~/lib/db/use-tab-presence"
import { loadSampleTree } from "~/lib/demo/load-sample-tree"
import { SAMPLE_PERSON_COUNT } from "~/lib/demo/sample-tree"
import { computeGenerations } from "~/lib/graph/compute-generations"
import { deriveUnions } from "~/lib/graph/derive-unions"
import { getLastTreeId } from "~/lib/last-tree"
import { resolveActiveTreeId, useAppShellStore } from "~/lib/ui/app-shell-store"
import { watchSystemTheme } from "~/lib/ui/theme-store"
import { toast } from "~/lib/ui/toast-store"

export default function App() {
  // Document-level, so it belongs here rather than in any one view.
  useEffect(watchSystemTheme, [])
  // Subscribes to every write in the app, so it has to outlive any one view —
  // and has to be mounted above the early returns below, or a snapshot would
  // stop being taken whenever the boot skeleton showed.
  // Elects one tab to do the automatic backup work, so two open tabs don't both
  // deflate every photo. Must be above the early returns below for the same
  // reason the snapshot subscription is.
  const tabs = useTabPresence()
  useAutoSnapshots(tabs.isLeader)
  useFolderBackup(tabs.isLeader)
  // Not gated: the stamp is a single tiny write, and whichever tab made the
  // change is the one that should record that it happened.
  useChangeStamp()

  const trees = useTrees()
  const people = usePeople()
  const relationships = useRelationships()

  const activeTreeId = useAppShellStore((s) => s.activeTreeId)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)

  const resolvedTreeId = useMemo(
    () =>
      resolveActiveTreeId(
        (trees ?? []).map((t) => t.id),
        activeTreeId,
        getLastTreeId()
      ),
    [trees, activeTreeId]
  )

  // Write the resolution back so "last opened tree" survives a reload and the
  // sidebar highlights the same row the canvas is showing.
  useEffect(() => {
    if (resolvedTreeId && resolvedTreeId !== activeTreeId) {
      setActiveTree(resolvedTreeId)
    }
  }, [resolvedTreeId, activeTreeId, setActiveTree])

  const unions = useMemo(
    () =>
      people && relationships ? deriveUnions(people, relationships).unions : [],
    [people, relationships]
  )

  const generations = useMemo(
    () =>
      people && relationships
        ? computeGenerations(people, relationships)
        : new Map<string, number>(),
    [people, relationships]
  )

  if (
    trees === undefined ||
    people === undefined ||
    relationships === undefined
  ) {
    return <BootSkeleton />
  }

  const tree = trees.find((t) => t.id === resolvedTreeId)

  if (!tree) {
    return <WelcomeState />
  }

  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <AppShell
          tree={tree}
          trees={trees}
          people={people}
          relationships={relationships}
          unions={unions}
          generations={generations}
          tabs={tabs}
        />
      </ReactFlowProvider>
    </TooltipProvider>
  )
}

// Deliberately the shape of the shell that is about to replace it, per tier —
// a skeleton in the wrong shape is a layout jump at the worst possible moment,
// when the reader is still deciding whether the app opened at all.
function BootSkeleton() {
  return (
    <div className="flex h-dvh w-full max-md:flex-col">
      <div className="flex w-53 flex-none flex-col gap-4.5 border-r border-border bg-sidebar px-3 py-4 max-md:hidden md:max-lg:w-14 md:max-lg:items-center md:max-lg:px-2">
        <div className="flex items-center gap-2 px-1 md:max-lg:px-0">
          <div className="flex size-5.5 items-center justify-center rounded-lg bg-primary font-heading text-11 font-bold text-primary-foreground">
            FT
          </div>
          <span className="font-heading text-xs font-semibold md:max-lg:hidden">
            Family Tree
          </span>
        </div>
        <div className="h-8 bg-muted md:max-lg:size-9 md:max-lg:rounded-full" />
        <div className="flex flex-col gap-1.5 md:max-lg:hidden">
          <div className="h-3 w-3/5 bg-muted" />
          <div className="h-7 bg-muted" />
          <div className="h-7 bg-muted/60" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-15 flex-none items-center border-b border-border px-4 max-md:h-14">
          <div className="h-3.5 w-30 bg-muted" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-13 font-medium text-muted-foreground">
            Opening your trees…
          </p>
        </div>
      </div>

      <div className="hidden flex-none grid-cols-4 gap-1 border-t border-border bg-sidebar px-2.5 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-md:grid">
        {[0, 1, 2, 3].map((slot) => (
          <div key={slot} className="flex h-13 items-center justify-center">
            <div className="h-3 w-11 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

function WelcomeState() {
  const [createOpen, setCreateOpen] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)

  // The one moment the sample family is most worth offering: there is nothing
  // here yet, so there is nothing it could be confused with, and "what does a
  // filled-in tree even look like" is the question in the way of starting.
  async function handleLoadSample() {
    if (loadingSample) return
    setLoadingSample(true)
    try {
      const { treeId } = await loadSampleTree()
      setActiveTree(treeId)
    } catch {
      toast("Couldn't add the sample family")
      setLoadingSample(false)
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center p-6 max-md:justify-between max-md:px-7 max-md:pt-16 max-md:pb-9">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center max-md:my-auto max-md:w-full max-md:gap-4.5">
        <div className="flex size-8.5 items-center justify-center rounded-lg bg-primary font-heading text-13 font-bold text-primary-foreground max-md:size-11 max-md:text-15">
          FT
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className="font-heading text-lg font-semibold max-md:text-2xl max-md:tracking-tight">
            Start your family tree
          </h1>
          <p className="text-sm text-muted-foreground max-md:text-15 max-md:leading-relaxed">
            Everything stays on this device. Add one person to begin, or open
            the sample family to look around first.
          </p>
        </div>
        {/* Stacked and full-width on a phone: three buttons of different
            widths, centred, read as a pile rather than a set of choices. */}
        <div className="flex flex-col items-center gap-1 max-md:mt-1.5 max-md:w-full max-md:gap-2.5">
          <Button
            className="max-md:h-13 max-md:w-full"
            onClick={() => setCreateOpen(true)}
          >
            Create a tree
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-13 max-md:w-full"
            disabled={loadingSample}
            onClick={() => void handleLoadSample()}
          >
            {loadingSample ? "Adding…" : "Open sample family"}
          </Button>
          <p className="text-11 text-muted-foreground max-md:text-12-5">
            {SAMPLE_PERSON_COUNT} invented people you can delete in one click
            from Settings.
          </p>
        </div>
      </div>

      <p className="text-11 text-muted-foreground max-md:text-center max-md:text-12-5 md:hidden">
        Works offline. Nothing is uploaded.
      </p>

      <CreateTreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(tree) => setActiveTree(tree.id)}
      />
      <Toaster />
    </div>
  )
}

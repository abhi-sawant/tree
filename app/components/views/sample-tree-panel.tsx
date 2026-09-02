import { useLiveQuery } from "dexie-react-hooks"
import { useState } from "react"

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
import {
  getSampleTreeStatus,
  loadSampleTree,
  removeSampleTree,
  type RemoveSampleTreeResult,
} from "~/lib/demo/load-sample-tree"
import { SAMPLE_PERSON_COUNT, SAMPLE_TREE_NAME } from "~/lib/demo/sample-tree"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { toast } from "~/lib/ui/toast-store"

export function SampleTreePanel() {
  const status = useLiveQuery(() => getSampleTreeStatus(), [])
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setView = useAppShellStore((s) => s.setView)

  const [loading, setLoading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removed, setRemoved] = useState<RemoveSampleTreeResult | undefined>(
    undefined
  )

  const present = status?.treePresent === true
  const personCount = status?.personCount ?? 0

  async function handleLoad() {
    if (loading) return
    setLoading(true)
    try {
      const { treeId } = await loadSampleTree()
      setActiveTree(treeId)
      setView("tree")
      toast(present ? "Sample family restored" : "Sample family added")
    } catch {
      toast("Couldn't add the sample family")
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove() {
    if (removing) return
    setRemoving(true)
    try {
      const result = await removeSampleTree()
      setConfirmRemove(false)
      // Reported in a panel rather than a toast whenever there is something to
      // account for — a broken link or a person left behind is the kind of
      // thing that must not scroll past in two seconds.
      if (
        result.keptPeople.length > 0 ||
        result.linksToOwnDataRemoved > 0 ||
        result.photosRemoved > 0 ||
        result.documentsRemoved > 0
      ) {
        setRemoved(result)
      } else {
        toast("Sample family removed")
      }
    } catch {
      toast("Couldn't remove the sample family")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-12-5 leading-relaxed text-muted-foreground">
        {SAMPLE_PERSON_COUNT} invented people across four generations, in a tree
        called &ldquo;
        {SAMPLE_TREE_NAME}&rdquo;, to look around before you enter anything of
        your own. It shows the things a real family needs and a blank canvas
        can&apos;t demonstrate: a remarriage, a marriage that ended, twins, an
        adoption, maiden names and an approximate date. It carries no photos —
        bundling faces for people who don&apos;t exist would grow the offline
        install for nothing. Adding it never touches data already here, and it
        goes in its own tree so nothing of yours is mixed in with it.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-13">
          {present
            ? `Loaded — ${personCount} sample ${personCount === 1 ? "person" : "people"} in this browser.`
            : personCount > 0
              ? `The sample tree is gone, but ${personCount} sample ${personCount === 1 ? "person" : "people"} ${personCount === 1 ? "is" : "are"} still here.`
              : "Not loaded."}
        </span>
        <div className="ml-auto flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void handleLoad()}
          >
            {loading
              ? "Working…"
              : present
                ? "Reset to how it shipped"
                : "Add the sample family"}
          </Button>
          {personCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(true)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <AlertDialog
        open={confirmRemove}
        onOpenChange={(open) => !open && !removing && setConfirmRemove(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the sample family?</AlertDialogTitle>
            <AlertDialogDescription>
              {personCount} sample {personCount === 1 ? "person" : "people"} and
              the tree they sit in are deleted, along with anything you changed
              about them or attached to them. Everyone you entered yourself is
              kept, including anyone you added to the sample tree — they stay in
              your own trees. If you linked one of your relatives to a sample
              person, that link goes too, because the person on the other end of
              it does. A snapshot taken while the sample was here still contains
              it, so rolling back to one would bring it back — delete those from
              Snapshots if you would rather it couldn&apos;t.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={() => void handleRemove()}
            >
              {removing ? "Removing…" : "Remove sample family"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {removed && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-13">
            Removed {removed.peopleRemoved}{" "}
            {removed.peopleRemoved === 1 ? "person" : "people"}.
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {removed.linksToOwnDataRemoved > 0 && (
              <li className="text-12-5 text-muted-foreground">
                {removed.linksToOwnDataRemoved}{" "}
                {removed.linksToOwnDataRemoved === 1
                  ? "relationship joining one of your people to a sample person was"
                  : "relationships joining your people to sample people were"}{" "}
                removed with them.
              </li>
            )}
            {removed.photosRemoved > 0 && (
              <li className="text-12-5 text-muted-foreground">
                {removed.photosRemoved}{" "}
                {removed.photosRemoved === 1 ? "photo" : "photos"} you had added
                to a sample person{" "}
                {removed.photosRemoved === 1 ? "was" : "were"} deleted.
              </li>
            )}
            {removed.documentsRemoved > 0 && (
              <li className="text-12-5 text-muted-foreground">
                {removed.documentsRemoved}{" "}
                {removed.documentsRemoved === 1 ? "document" : "documents"} you
                had added to a sample person{" "}
                {removed.documentsRemoved === 1 ? "was" : "were"} deleted.
              </li>
            )}
            {removed.keptPeople.map((kept) => (
              <li key={kept.id} className="text-12-5 text-muted-foreground">
                {kept.name} was kept — {kept.reason}. Change that tree&apos;s
                root person, or delete the tree, and remove again.
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => setRemoved(undefined)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}

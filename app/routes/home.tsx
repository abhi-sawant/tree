import { useEffect, useState } from "react"
import { useNavigate } from "react-router"

import { CreateTreeDialog } from "~/components/trees/create-tree-dialog"
import { Button } from "~/components/ui/button"
import { useTrees } from "~/lib/db/hooks"
import { getLastTreeId, setLastTreeId } from "~/lib/last-tree"

export default function Home() {
  const navigate = useNavigate()
  const trees = useTrees()
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!trees || trees.length === 0) return

    const lastId = getLastTreeId()
    const target = trees.find((t) => t.id === lastId) ?? trees[0]
    navigate(`/tree/${target.id}`, { replace: true })
  }, [trees, navigate])

  if (!trees || trees.length > 0) {
    return null
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="font-heading text-lg font-semibold tracking-wider uppercase">
          Welcome
        </h1>
        <p className="text-sm text-muted-foreground">
          Create your first tree to get started.
        </p>
        <Button onClick={() => setCreateOpen(true)}>Create your first tree</Button>
      </div>

      <CreateTreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(tree) => {
          setLastTreeId(tree.id)
          navigate(`/tree/${tree.id}`)
        }}
      />
    </div>
  )
}

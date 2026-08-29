import { Panel } from "@xyflow/react"
import { LayoutGrid } from "lucide-react"

import { Button } from "~/components/ui/button"
import { clearAllPositions } from "~/lib/db/members"

interface TreeToolbarProps {
  treeId: string
}

export function TreeToolbar({ treeId }: TreeToolbarProps) {
  return (
    <Panel position="top-left">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void clearAllPositions(treeId)}
      >
        <LayoutGrid /> Re-layout tree
      </Button>
    </Panel>
  )
}

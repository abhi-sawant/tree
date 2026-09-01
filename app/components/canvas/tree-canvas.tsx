import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  useReactFlow,
  type Edge,
  type IsValidConnection,
  type Node,
  type OnConnect,
  type OnNodeDrag,
} from "@xyflow/react"
import { Maximize2, Minus, Plus } from "lucide-react"
import { useEffect, useMemo } from "react"

import { PersonNode } from "~/components/canvas/person-node"
import { MultiSelectPanel } from "~/components/canvas/multi-select-panel"
import { TreeOutlinePanel } from "~/components/canvas/tree-outline-panel"
import { TreeToolbar } from "~/components/canvas/tree-toolbar"
import { UnionNode } from "~/components/canvas/union-node"
import {
  connectRefusalMessage,
  connectionShape,
  resolveConnection,
} from "~/lib/canvas/connect-intent"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useCanvasKeyboard } from "~/lib/canvas/use-canvas-keyboard"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import {
  resolveEdgeColor,
  resolveGenerationColor,
} from "~/lib/canvas/appearance-resolve"
import { setMemberPosition } from "~/lib/db/members"
import { addRelationship } from "~/lib/db/relationships"
import { toast } from "~/lib/ui/toast-store"
import { parseNodeId } from "~/lib/graph/node-ids"
import type { Person, Relationship } from "~/lib/types"

const nodeTypes = { person: PersonNode, union: UnionNode }

// React Flow's own description of a node — the one thing a screen reader reads
// out on every single card — says to press delete to remove it and the arrow
// keys to move it around. Neither is true here: elementsSelectable is off,
// nothing is bound to Delete, and the arrows walk the family rather than
// dragging a card. A description that is wrong is worse than none, so it is
// replaced with the keys this app actually binds.
//
// Both variants, because which one React Flow renders depends on its own
// keyboard-a11y flag and only one of them is ever on screen — overriding the
// one and not the other leaves the wrong text showing half the time. Verified
// in the browser: overriding only `default` left the original wording in place.
const NODE_KEYS_DESCRIPTION =
  "Arrow keys move to a relative. Enter edits this person. P, S and C add a parent, spouse or child. Turn on the tree outline for the whole tree as a list."

const ARIA_LABEL_CONFIG = {
  "node.a11yDescription.default": NODE_KEYS_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": NODE_KEYS_DESCRIPTION,
}

interface TreeCanvasProps {
  treeId: string
  generationCount: number
  people: Person[]
  relationships: Relationship[]
  nodes: Node[]
  edges: Edge[]
}

export function TreeCanvas({
  treeId,
  generationCount,
  people,
  relationships,
  nodes,
  edges,
}: TreeCanvasProps) {
  const select = useCanvasUIStore((s) => s.select)
  const toggleSelected = useCanvasUIStore((s) => s.toggleSelected)
  const selectedNodeIds = useCanvasUIStore((s) => s.selectedNodeIds)
  // Derived from the rendered node array rather than from membership, so focus
  // scoping and hidden generations are already accounted for — the keyboard can
  // only reach a card that is genuinely on screen.
  const visiblePersonIds = useMemo(() => {
    const ids = new Set<string>()
    for (const node of nodes) {
      const parsed = parseNodeId(node.id)
      if (parsed?.kind === "person") ids.add(parsed.personId)
    }
    return ids
  }, [nodes])
  useCanvasKeyboard({ people, relationships, visiblePersonIds })
  const showOutline = useCanvasUIStore((s) => s.showOutline)

  // Bulk actions are about people, so union dots in the selection are dropped
  // rather than counted: a union has no membership of its own to add or remove
  // and no position to align, being pinned to the midpoint of its couple.
  const selectedPeople = useMemo(() => {
    const peopleById = new Map(people.map((p) => [p.id, p]))
    return selectedNodeIds.flatMap((nodeId) => {
      const parsed = parseNodeId(nodeId)
      if (parsed?.kind !== "person") return []
      const person = peopleById.get(parsed.personId)
      return person ? [person] : []
    })
  }, [selectedNodeIds, people])

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const node of nodes) {
      const parsed = parseNodeId(node.id)
      if (parsed?.kind === "person") map.set(parsed.personId, node.position)
    }
    return map
  }, [nodes])
  const appearance = useAppearanceStore((s) => s.settings)
  const legend = [
    {
      color: resolveEdgeColor(
        appearance.parentChildColor,
        "--edge-parent-child"
      ),
      label: "Parent–child",
    },
    {
      color: resolveEdgeColor(appearance.spouseColor, "--edge-spouse"),
      label: "Marriage",
    },
    {
      color: resolveGenerationColor(0, appearance.generationColors),
      label: "Generation colour",
    },
  ]

  // Only the geometric half of the check gates the drag itself, so a drag that
  // names a real relationship always lands and is explained afterwards if it
  // cannot be recorded. A connector that silently refuses to drop tells the
  // user nothing except that the canvas seems broken.
  const isValidConnection: IsValidConnection = (connection) =>
    connectionShape(connection) !== undefined

  const handleConnect: OnConnect = (connection) => {
    const resolution = resolveConnection(connection, relationships)
    if (!resolution) return
    if (!resolution.ok) {
      toast(connectRefusalMessage(resolution.reason))
      return
    }

    const { intent } = resolution
    // Both people already have a card on this canvas, so they are already
    // members — this is the relationship write and nothing else.
    const input =
      intent.kind === "spouse"
        ? {
            type: "spouse" as const,
            from: intent.personIds[0],
            to: intent.personIds[1],
          }
        : {
            type: "parent-child" as const,
            from: intent.parentId,
            to: intent.childId,
          }

    void addRelationship(input).then(
      () =>
        toast(
          intent.kind === "spouse"
            ? "Marriage recorded"
            : "Parent-child link added"
        ),
      // resolveConnection has already ruled out everything addRelationship
      // rejects, so reaching here means the data changed under the drag —
      // in another tab, or in the moment between the drop and the write.
      () => toast("Couldn't record that link — please try again.")
    )
  }

  const handleNodeDragStop: OnNodeDrag = (_event, node) => {
    const parsed = parseNodeId(node.id)
    if (parsed?.kind !== "person") return
    void setMemberPosition(
      treeId,
      parsed.personId,
      node.position.x,
      node.position.y
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      {selectedPeople.length > 1 && (
        <MultiSelectPanel
          treeId={treeId}
          selectedPeople={selectedPeople}
          positions={positions}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {showOutline && (
          <TreeOutlinePanel
            people={people}
            relationships={relationships}
            memberIds={visiblePersonIds}
          />
        )}
        <ReactFlow
          className="min-w-0 flex-1"
          // The wrapper React Flow renders already carries role="application";
          // without a name it is announced as an unlabelled application region.
          aria-label="Family tree canvas"
          ariaLabelConfig={ARIA_LABEL_CONFIG}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable
          nodesConnectable
          // Loose lets a link be drawn from either end — dragging up from a child's
          // parent handle is the same link as dragging down from the parent's. The
          // handles are typed source/target for the *rendered* edges' sake, which
          // strict mode would otherwise read as a rule about which way a user may
          // draw one.
          connectionMode={ConnectionMode.Loose}
          onConnect={handleConnect}
          isValidConnection={isValidConnection}
          // Selection is ours, not React Flow's: the node array is controlled and
          // we deliberately don't feed node changes back into it, so React Flow's
          // internal selection would never reach the nodes. Click handlers keep
          // the canvas and the detail panel reading from one source of truth.
          elementsSelectable={false}
          // Shift or ⌘/Ctrl extends the selection; a plain click replaces it. This
          // rather than React Flow's own box selection, which needs
          // elementsSelectable and would put a second selection model alongside
          // the store's — see the note on elementsSelectable above.
          onNodeClick={(event, node) =>
            event.shiftKey || event.metaKey || event.ctrlKey
              ? toggleSelected(node.id)
              : select(node.id)
          }
          onPaneClick={() => select(null)}
          onNodeDragStop={handleNodeDragStop}
          fitView
          // Cards are designed at 184x60; letting fitView magnify a small tree
          // past 1:1 blows them up out of all proportion.
          fitViewOptions={{ maxZoom: 1 }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="var(--canvas-dot)"
          />
          <TreeToolbar
            treeId={treeId}
            generationCount={generationCount}
            people={people}
          />
          <Panel position="bottom-left">
            <div className="flex gap-3 border border-border bg-card px-2.5 py-2">
              {legend.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span
                    className="h-0.5 w-2"
                    style={{ background: item.color }}
                  />
                  <span className="font-heading text-9-5 font-medium tracking-wider text-muted-foreground uppercase">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <ZoomControls />
          <CenterOnPendingNode nodes={nodes} />
        </ReactFlow>
      </div>
    </div>
  )
}

// Honours a centre request made while the canvas was unmounted (switching
// back from the table, or picking someone in the command palette): waits for
// the node to actually exist before asking React Flow to move to it.
function CenterOnPendingNode({ nodes }: { nodes: Node[] }) {
  const { fitView } = useReactFlow()
  const pendingCenterNodeId = useCanvasUIStore((s) => s.pendingCenterNodeId)
  const clearPendingCenter = useCanvasUIStore((s) => s.clearPendingCenter)

  useEffect(() => {
    if (!pendingCenterNodeId) return
    if (!nodes.some((n) => n.id === pendingCenterNodeId)) return
    void fitView({
      nodes: [{ id: pendingCenterNodeId }],
      maxZoom: 1,
      duration: 200,
    })
    clearPendingCenter()
  }, [pendingCenterNodeId, nodes, fitView, clearPendingCenter])

  return null
}

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <Panel position="bottom-right">
      <div className="flex flex-col border border-border bg-card">
        <button
          type="button"
          aria-label="Zoom in"
          className="size-7 cursor-pointer border-b border-border text-13 hover:bg-muted"
          onClick={() => void zoomIn()}
        >
          <Plus className="mx-auto size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className="size-7 cursor-pointer border-b border-border text-13 hover:bg-muted"
          onClick={() => void zoomOut()}
        >
          <Minus className="mx-auto size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Fit view"
          className="size-7 cursor-pointer hover:bg-muted"
          onClick={() => void fitView()}
        >
          <Maximize2 className="mx-auto size-3" />
        </button>
      </div>
    </Panel>
  )
}

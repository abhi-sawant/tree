import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type IsValidConnection,
  type Node,
  type OnConnect,
  type OnNodeDrag,
} from "@xyflow/react"
import { Maximize2, Minus, Plus, SlidersHorizontal } from "lucide-react"
import { useEffect, useMemo } from "react"

import { PersonNode } from "~/components/canvas/person-node"
import { Button } from "~/components/ui/button"
import { MultiSelectPanel } from "~/components/canvas/multi-select-panel"
import { TreeOutlinePanel } from "~/components/canvas/tree-outline-panel"
import { TreeToolbar } from "~/components/canvas/tree-toolbar"
import { ViewOptionsSheet } from "~/components/canvas/view-options-sheet"
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
import { LONG_PRESS_SLOP_PX } from "~/lib/canvas/long-press"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useIsMobile } from "~/lib/ui/viewport-tier"
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

// The touch reading of the same sentence. Neither the arrow keys nor the
// letter shortcuts exist for a finger, and a description that lists keys
// nobody has is worse than none — which is why the original React Flow text
// was replaced in the first place.
const NODE_TOUCH_DESCRIPTION =
  "Long-press this card for its actions. Drag it to pin it in place. Turn on the tree outline for the whole tree as a list."

function ariaLabelConfig(touch: boolean) {
  const description = touch ? NODE_TOUCH_DESCRIPTION : NODE_KEYS_DESCRIPTION
  return {
    "node.a11yDescription.default": description,
    "node.a11yDescription.keyboardDisabled": description,
  }
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
  const selectMode = useCanvasUIStore((s) => s.selectMode)
  const isMobile = useIsMobile()

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
      {/* `relative` so the outline can take the whole area on a phone, where
          it is the screen rather than a rail beside the canvas. */}
      <div className="relative flex min-h-0 flex-1">
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
          ariaLabelConfig={ariaLabelConfig(isMobile)}
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
            // Touch has no modifier keys, so the same intent is expressed by
            // turning on "select several" first (see the view-options sheet
            // and the long-press menu). Without it, MultiSelectPanel and
            // everything behind it are unreachable on a phone.
            event.shiftKey || event.metaKey || event.ctrlKey || selectMode
              ? toggleSelected(node.id)
              : select(node.id)
          }
          onPaneClick={() => select(null)}
          onNodeDragStop={handleNodeDragStop}
          // A drag writes a permanent position override (the Pin icon), so a
          // stray few pixels while tapping a card would silently un-manage its
          // layout. The same number the long press uses to decide it has
          // become a drag, so the two can never both fire — or neither.
          nodeDragThreshold={LONG_PRESS_SLOP_PX}
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
          {/* The seven-control toolbar needs a row 500px wide. On a phone the
              same controls are one sheet, opened from the ☰ in the corner
              stack and from the topbar's overflow. */}
          {!isMobile && (
            <TreeToolbar
              treeId={treeId}
              generationCount={generationCount}
              people={people}
            />
          )}
          <Panel position="bottom-left">
            {/* The legend explains three edge colours. On a phone it would
                cover a quarter of the canvas to do it, and the same three
                colours are named in Appearance — so what sits here instead is
                the one thing you cannot read off the canvas: how far in you
                are zoomed. */}
            {isMobile ? (
              <ZoomReadout />
            ) : (
              <div className="flex gap-3 rounded-lg border border-border bg-card px-2.5 py-2 shadow-card">
                {legend.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <span
                      className="h-0.5 w-2"
                      style={{ background: item.color }}
                    />
                    <span className="font-heading text-9-5 font-medium text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <ZoomControls mobile={isMobile} />
          <CenterOnPendingNode nodes={nodes} />
        </ReactFlow>
      </div>

      {isMobile && (
        <ViewOptionsSheet
          treeId={treeId}
          generationCount={generationCount}
          people={people}
        />
      )}
    </div>
  )
}

// Zoom has no visible scale on a canvas that can hold a whole family, and
// pinching past a useful range is easy — so the level is stated, along with
// the gesture that changes it, which nothing else on screen says.
function ZoomReadout() {
  const zoom = useStore((state) => state.transform[2])
  return (
    <span className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-11 font-medium text-muted-foreground">
      {Math.round(zoom * 100)}% · pinch to zoom
    </span>
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

function ZoomControls({ mobile }: { mobile: boolean }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)

  // 28px buttons under a thumb are a coin toss, and these are the controls a
  // reader reaches for most on a canvas they cannot see all of. On a phone
  // they become a 48px stack, with the view-options sheet on the end — the
  // corner is the one place on the canvas that is always reachable.
  const size = mobile ? "icon-lg" : "icon-xs"

  return (
    <Panel position="bottom-right">
      <div
        className={
          mobile
            ? "flex flex-col overflow-hidden rounded-full border border-border bg-card shadow-float"
            : "flex flex-col border border-border bg-card"
        }
      >
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-label="Zoom in"
          className="rounded-none border-b border-border"
          onClick={() => void zoomIn()}
        >
          <Plus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-label="Zoom out"
          className="rounded-none border-b border-border"
          onClick={() => void zoomOut()}
        >
          <Minus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-label="Fit view"
          className={mobile ? "rounded-none border-b border-border" : ""}
          onClick={() => void fitView()}
        >
          <Maximize2 />
        </Button>
        {mobile && (
          <Button
            type="button"
            variant="ghost"
            size={size}
            aria-label="View options"
            className="rounded-none"
            onClick={() => setMobileSheet("view-options")}
          >
            <SlidersHorizontal />
          </Button>
        )}
      </div>
    </Panel>
  )
}

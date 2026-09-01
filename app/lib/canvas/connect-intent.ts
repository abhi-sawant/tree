import { HANDLE } from "~/lib/canvas/layout-direction"
import { parseNodeId } from "~/lib/graph/node-ids"
import type { Relationship } from "~/lib/types"

// What a completed drag between two handles means. Named by relationship
// rather than by which end the drag started from: a link is the same link
// whether it was drawn parent-downwards or child-upwards.
export type ConnectIntent =
  | { kind: "parent-child"; parentId: string; childId: string }
  | { kind: "spouse"; personIds: [string, string] }

export type ConnectRefusal =
  "self" | "already-related" | "too-many-parents" | "cycle"

export type ConnectResolution =
  { ok: true; intent: ConnectIntent } | { ok: false; reason: ConnectRefusal }

// React Flow's Connection, narrowed to what this needs and made tolerant of
// the nulls it hands back.
export interface CanvasConnection {
  source?: string | null
  target?: string | null
  sourceHandle?: string | null
  targetHandle?: string | null
}

interface Endpoint {
  personId: string
  handle: string
}

function endpoint(
  nodeId: string | null | undefined,
  handle: string | null | undefined
): Endpoint | undefined {
  if (!nodeId || !handle) return undefined
  const parsed = parseNodeId(nodeId)
  // Union dots are deliberately not connectable. A couple's shared child is
  // already one click away in the union's own Add child → Existing person
  // panel, and a drag that silently wrote two parent links at once would be a
  // much bigger action than it looks.
  if (parsed?.kind !== "person") return undefined
  return { personId: parsed.personId, handle }
}

// The shape a drag has, from its two handles alone — no data involved. This is
// what drives React Flow's live valid/invalid feedback, so it must answer
// purely geometrically: whether these two handles *could* mean something.
//
// Handles are read rather than the source/target roles, because ConnectionMode
// .Loose lets a drag start at either end. Dragging up from a child's parent
// handle to their parent's child handle is the same link as dragging down.
export function connectionShape(
  connection: CanvasConnection
): ConnectIntent | undefined {
  const a = endpoint(connection.source, connection.sourceHandle)
  const b = endpoint(connection.target, connection.targetHandle)
  if (!a || !b) return undefined
  if (a.personId === b.personId) return undefined

  const isCross = (handle: string) =>
    handle === HANDLE.crossStart || handle === HANDLE.crossEnd
  if (isCross(a.handle) && isCross(b.handle)) {
    return { kind: "spouse", personIds: [a.personId, b.personId] }
  }

  const parent = [a, b].find((e) => e.handle === HANDLE.children)
  const child = [a, b].find((e) => e.handle === HANDLE.in)
  if (parent && child && parent.personId !== child.personId) {
    return {
      kind: "parent-child",
      parentId: parent.personId,
      childId: child.personId,
    }
  }

  // Anything else — two child handles, a child handle to a side handle — names
  // no relationship, so there is nothing to offer.
  return undefined
}

function parentsOf(relationships: Relationship[], childId: string): string[] {
  return relationships
    .filter((r) => r.type === "parent-child" && r.to === childId)
    .map((r) => r.from)
}

// Walks up from `startId` looking for `targetId`. Mirrors the check
// addRelationship makes against the database, so a drag is refused with an
// explanation instead of being accepted and then thrown out by the write.
function isAncestorOf(
  relationships: Relationship[],
  targetId: string,
  startId: string
): boolean {
  const seen = new Set<string>()
  let frontier = [startId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      const parents = parentsOf(relationships, id)
      if (parents.includes(targetId)) return true
      next.push(...parents)
    }
    frontier = next
  }
  return false
}

function alreadyRelated(
  relationships: Relationship[],
  a: string,
  b: string
): boolean {
  return relationships.some(
    (r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)
  )
}

// The full answer, data included. Deliberately separate from connectionShape:
// only the geometric half drives the drag's valid/invalid styling, so a drag
// that names a real relationship always completes and is then explained if it
// can't be recorded. Rejecting it mid-drag instead would leave the user with a
// connector that refuses to land and no idea why — indistinguishable from the
// canvas simply not working.
export function resolveConnection(
  connection: CanvasConnection,
  relationships: Relationship[]
): ConnectResolution | undefined {
  const intent = connectionShape(connection)
  if (!intent) return undefined

  const [a, b] =
    intent.kind === "spouse"
      ? intent.personIds
      : [intent.parentId, intent.childId]

  if (a === b) return { ok: false, reason: "self" }

  // Two people are related in exactly one way or not at all. The app has no
  // representation for a second link between the same pair — a remarriage is
  // an edit to the existing spouse row's dates, not another row — so a drag
  // between people already joined is a mis-drop, not a new fact.
  if (alreadyRelated(relationships, a, b)) {
    return { ok: false, reason: "already-related" }
  }

  if (intent.kind === "parent-child") {
    if (parentsOf(relationships, intent.childId).length >= 2) {
      return { ok: false, reason: "too-many-parents" }
    }
    if (isAncestorOf(relationships, intent.childId, intent.parentId)) {
      return { ok: false, reason: "cycle" }
    }
  }

  return { ok: true, intent }
}

export function connectRefusalMessage(reason: ConnectRefusal): string {
  switch (reason) {
    case "self":
      return "A person can't be related to themselves."
    case "already-related":
      return "Those two are already recorded as related."
    case "too-many-parents":
      return "That person already has 2 parents recorded."
    case "cycle":
      return "That would create a cycle — one of them is already an ancestor of the other."
  }
}

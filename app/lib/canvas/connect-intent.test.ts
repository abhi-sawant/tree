import { describe, expect, it } from "vitest"

import {
  connectRefusalMessage,
  connectionShape,
  resolveConnection,
} from "~/lib/canvas/connect-intent"
import { HANDLE } from "~/lib/canvas/layout-direction"
import { personNodeId, unionNodeId } from "~/lib/graph/node-ids"
import type { Relationship } from "~/lib/types"

function drag(from: string, fromHandle: string, to: string, toHandle: string) {
  return {
    source: personNodeId(from),
    sourceHandle: fromHandle,
    target: personNodeId(to),
    targetHandle: toHandle,
  }
}

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to }
}

describe("connectionShape", () => {
  it("reads a child handle onto a parent handle as a parent-child link", () => {
    expect(
      connectionShape(drag("dad", HANDLE.children, "kid", HANDLE.in))
    ).toEqual({ kind: "parent-child", parentId: "dad", childId: "kid" })
  })

  // ConnectionMode.Loose lets the drag start at either end, and the link it
  // names is the same either way.
  it("reads the same link dragged the other way round", () => {
    expect(
      connectionShape(drag("kid", HANDLE.in, "dad", HANDLE.children))
    ).toEqual({ kind: "parent-child", parentId: "dad", childId: "kid" })
  })

  it("reads two side handles as a marriage", () => {
    expect(
      connectionShape(drag("a", HANDLE.crossEnd, "b", HANDLE.crossStart))
    ).toEqual({ kind: "spouse", personIds: ["a", "b"] })
    expect(
      connectionShape(drag("a", HANDLE.crossStart, "b", HANDLE.crossStart))
    ).toEqual({ kind: "spouse", personIds: ["a", "b"] })
  })

  it("names nothing for a handle pair that means nothing", () => {
    expect(
      connectionShape(drag("a", HANDLE.children, "b", HANDLE.children))
    ).toBeUndefined()
    expect(
      connectionShape(drag("a", HANDLE.in, "b", HANDLE.in))
    ).toBeUndefined()
    expect(
      connectionShape(drag("a", HANDLE.children, "b", HANDLE.crossStart))
    ).toBeUndefined()
  })

  it("refuses a drag onto the same person", () => {
    expect(
      connectionShape(drag("a", HANDLE.children, "a", HANDLE.in))
    ).toBeUndefined()
  })

  // Union dots stay non-connectable: the same child link is one click away in
  // the union's own panel, and a drag writing two parent rows at once would be
  // a far bigger action than it looks.
  it("refuses a drag touching a union dot", () => {
    expect(
      connectionShape({
        source: unionNodeId(["a", "b"]),
        sourceHandle: HANDLE.children,
        target: personNodeId("kid"),
        targetHandle: HANDLE.in,
      })
    ).toBeUndefined()
  })

  it("refuses a drag with a missing end or handle", () => {
    expect(
      connectionShape({
        source: personNodeId("a"),
        sourceHandle: HANDLE.children,
        target: null,
        targetHandle: HANDLE.in,
      })
    ).toBeUndefined()
    expect(
      connectionShape({
        source: personNodeId("a"),
        sourceHandle: null,
        target: personNodeId("b"),
        targetHandle: HANDLE.in,
      })
    ).toBeUndefined()
  })
})

describe("resolveConnection", () => {
  it("accepts a fresh parent-child link", () => {
    const result = resolveConnection(
      drag("dad", HANDLE.children, "kid", HANDLE.in),
      []
    )
    expect(result).toEqual({
      ok: true,
      intent: { kind: "parent-child", parentId: "dad", childId: "kid" },
    })
  })

  it("accepts a fresh marriage", () => {
    const result = resolveConnection(
      drag("a", HANDLE.crossEnd, "b", HANDLE.crossStart),
      []
    )
    expect(result).toEqual({
      ok: true,
      intent: { kind: "spouse", personIds: ["a", "b"] },
    })
  })

  it("has nothing to say about a drag that names no relationship", () => {
    expect(
      resolveConnection(drag("a", HANDLE.children, "b", HANDLE.children), [])
    ).toBeUndefined()
  })

  // The app stores at most one link per pair, so a second drag between them is
  // a mis-drop rather than a new fact. Without this, addRelationship would
  // happily write a duplicate row and draw a doubled edge.
  it("refuses a pair that is already related, whichever way round", () => {
    const existing = [parentChild("dad", "kid")]
    expect(
      resolveConnection(
        drag("dad", HANDLE.children, "kid", HANDLE.in),
        existing
      )
    ).toEqual({ ok: false, reason: "already-related" })
    expect(
      resolveConnection(
        drag("dad", HANDLE.crossEnd, "kid", HANDLE.crossStart),
        existing
      )
    ).toEqual({ ok: false, reason: "already-related" })
  })

  it("refuses a married pair being married again", () => {
    expect(
      resolveConnection(drag("a", HANDLE.crossEnd, "b", HANDLE.crossStart), [
        spouse("b", "a"),
      ])
    ).toEqual({ ok: false, reason: "already-related" })
  })

  it("refuses a third parent", () => {
    const existing = [parentChild("dad", "kid"), parentChild("mum", "kid")]
    expect(
      resolveConnection(
        drag("other", HANDLE.children, "kid", HANDLE.in),
        existing
      )
    ).toEqual({ ok: false, reason: "too-many-parents" })
  })

  // Mirrors addRelationship's own check, so the drag is explained rather than
  // accepted and then thrown out by the write.
  it("refuses a link that would close a cycle", () => {
    const existing = [parentChild("grandpa", "dad"), parentChild("dad", "kid")]
    expect(
      resolveConnection(
        drag("kid", HANDLE.children, "grandpa", HANDLE.in),
        existing
      )
    ).toEqual({ ok: false, reason: "cycle" })
  })

  it("allows an unrelated link in a tree that has cycles elsewhere", () => {
    const existing = [parentChild("grandpa", "dad"), parentChild("dad", "kid")]
    expect(
      resolveConnection(
        drag("grandma", HANDLE.children, "dad", HANDLE.in),
        existing
      )
    ).toEqual({
      ok: true,
      intent: { kind: "parent-child", parentId: "grandma", childId: "dad" },
    })
  })

  // A spouse link never closes a lineage cycle and has no parent cap, so
  // neither check should fire on one.
  it("lets a marriage stand between people in the same lineage's tree", () => {
    const existing = [
      parentChild("grandpa", "dad"),
      parentChild("grandpa", "aunt"),
    ]
    expect(
      resolveConnection(
        drag("dad", HANDLE.crossEnd, "outsider", HANDLE.crossStart),
        existing
      )
    ).toEqual({
      ok: true,
      intent: { kind: "spouse", personIds: ["dad", "outsider"] },
    })
  })
})

describe("connectRefusalMessage", () => {
  it("gives every refusal a reason the reader can act on", () => {
    for (const reason of [
      "self",
      "already-related",
      "too-many-parents",
      "cycle",
    ] as const) {
      expect(connectRefusalMessage(reason).length).toBeGreaterThan(10)
    }
  })
})

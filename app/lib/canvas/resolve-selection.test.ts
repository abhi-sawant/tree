import { describe, expect, it } from "vitest"

import { resolveSelection } from "~/lib/canvas/resolve-selection"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { personNodeId, unionNodeId } from "~/lib/graph/node-ids"
import type { Person } from "~/lib/types"

const id = () => crypto.randomUUID()

function person(overrides: Partial<Person> = {}): Person {
  const now = Date.now()
  return {
    id: id(),
    givenName: "Test",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("resolveSelection", () => {
  it("returns undefined for a null nodeId", () => {
    expect(resolveSelection(null, [], [])).toBeUndefined()
  })

  it("resolves a person node id to the matching Person", () => {
    const a = person({ givenName: "Ada" })
    const result = resolveSelection(personNodeId(a.id), [a], [])
    expect(result).toEqual({ kind: "person", person: a })
  })

  it("returns undefined when the person no longer exists", () => {
    const a = person()
    const result = resolveSelection(personNodeId(id()), [a], [])
    expect(result).toBeUndefined()
  })

  it("resolves a union node id regardless of parent order", () => {
    const a = person()
    const b = person()
    const union: UnionNode = {
      id: unionNodeId([a.id, b.id]),
      kind: "implicit",
      parents: [a.id, b.id],
    }

    const byAB = resolveSelection(unionNodeId([a.id, b.id]), [a, b], [union])
    const byBA = resolveSelection(unionNodeId([b.id, a.id]), [a, b], [union])
    expect(byAB).toEqual({ kind: "union", union })
    expect(byBA).toEqual({ kind: "union", union })
  })

  it("returns undefined for an unparseable node id", () => {
    expect(resolveSelection("not-a-real-id", [], [])).toBeUndefined()
  })
})

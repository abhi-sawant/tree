import { describe, expect, it } from "vitest"

import { parseNodeId, personNodeId, unionNodeId } from "~/lib/graph/node-ids"

describe("personNodeId / parseNodeId", () => {
  it("round-trips a person id", () => {
    const nodeId = personNodeId("abc-123")
    expect(nodeId).toBe("person:abc-123")
    expect(parseNodeId(nodeId)).toEqual({ kind: "person", personId: "abc-123" })
  })
})

describe("unionNodeId / parseNodeId", () => {
  it("is independent of parent order", () => {
    expect(unionNodeId(["a", "b"])).toBe(unionNodeId(["b", "a"]))
  })

  it("round-trips to the two parent ids", () => {
    const nodeId = unionNodeId(["a-id", "b-id"])
    const parsed = parseNodeId(nodeId)
    expect(parsed?.kind).toBe("union")
    if (parsed?.kind === "union") {
      expect(parsed.parents.slice().sort()).toEqual(["a-id", "b-id"].sort())
    }
  })
})

describe("parseNodeId", () => {
  it("returns undefined for an unrecognized id", () => {
    expect(parseNodeId("something-else")).toBeUndefined()
  })
})

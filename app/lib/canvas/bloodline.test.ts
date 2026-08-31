import { describe, expect, it } from "vitest"

import { bloodlineToRoot } from "~/lib/canvas/bloodline"
import { unionNodeId } from "~/lib/graph/node-ids"
import type { Relationship } from "~/lib/types"

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to }
}

// root(+rootSpouse) -> child(+childSpouse) -> grandchild
const LINE: Relationship[] = [
  spouse("root", "rootSpouse"),
  parentChild("root", "child"),
  parentChild("rootSpouse", "child"),
  spouse("child", "childSpouse"),
  parentChild("child", "grandchild"),
  parentChild("childSpouse", "grandchild"),
]

describe("bloodlineToRoot", () => {
  it("returns just the person when they are the root", () => {
    expect(bloodlineToRoot(LINE, "root", "root")).toEqual({
      personIds: ["root"],
      unionIds: [],
    })
  })

  it("traces upward from a descendant to the root", () => {
    const line = bloodlineToRoot(LINE, "grandchild", "root")
    expect(line?.personIds).toEqual(["grandchild", "child", "root"])
  })

  it("traces downward when the root is the ancestor's own start point", () => {
    const line = bloodlineToRoot(LINE, "root", "grandchild")
    expect(line?.personIds).toEqual(["root", "child", "grandchild"])
  })

  it("names every union the path runs through", () => {
    // Each step's child has two parents, so the renderer draws a union dot for
    // both and the highlight has to cover them.
    const line = bloodlineToRoot(LINE, "grandchild", "root")
    expect(line?.unionIds.sort()).toEqual(
      [
        unionNodeId(["root", "rootSpouse"]),
        unionNodeId(["child", "childSpouse"]),
      ].sort()
    )
  })

  it("names no union for a single-parent step", () => {
    const line = bloodlineToRoot(
      [parentChild("root", "child")],
      "child",
      "root"
    )
    expect(line?.unionIds).toEqual([])
  })

  it("goes up and back down to reach a cousin", () => {
    const relationships = [
      parentChild("gp", "a"),
      parentChild("gp", "b"),
      parentChild("a", "me"),
      parentChild("b", "cousin"),
    ]
    const line = bloodlineToRoot(relationships, "me", "cousin")
    expect(line?.personIds).toEqual(["me", "a", "gp", "b", "cousin"])
  })

  it("takes the shortest of several routes", () => {
    const relationships = [
      parentChild("root", "direct"),
      parentChild("direct", "target"),
      parentChild("root", "long1"),
      parentChild("long1", "long2"),
      parentChild("long2", "target"),
    ]
    const line = bloodlineToRoot(relationships, "target", "root")
    expect(line?.personIds).toHaveLength(3)
  })

  it("never steps through a marriage", () => {
    // in-law and root share only a marriage, so no bloodline connects them.
    const relationships = [
      spouse("inLaw", "child"),
      parentChild("root", "child"),
    ]
    expect(bloodlineToRoot(relationships, "inLaw", "root")).toBeUndefined()
  })

  it("is undefined when nothing connects the two", () => {
    expect(bloodlineToRoot(LINE, "grandchild", "stranger")).toBeUndefined()
  })

  it("terminates on a cyclic graph from a cousin marriage", () => {
    const relationships = [
      parentChild("gp", "a"),
      parentChild("gp", "b"),
      parentChild("a", "x"),
      parentChild("b", "y"),
      spouse("x", "y"),
      parentChild("x", "z"),
      parentChild("y", "z"),
    ]
    const line = bloodlineToRoot(relationships, "z", "gp")
    expect(line?.personIds[0]).toBe("z")
    expect(line?.personIds.at(-1)).toBe("gp")
  })
})

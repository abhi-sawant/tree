import { describe, expect, it } from "vitest"

import {
  addRelativeKindForKey,
  arrowKeyToStep,
  isTypingTarget,
  stepToRelative,
  type NavigationGraph,
} from "~/lib/canvas/keyboard-navigation"
import type { Person, Relationship } from "~/lib/types"

function person(
  id: string,
  createdAt: number,
  extra: Partial<Person> = {}
): Person {
  return {
    id,
    givenName: id,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  }
}

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to }
}

function graphOf(
  people: Person[],
  relationships: Relationship[],
  visible?: string[]
): NavigationGraph {
  return {
    people,
    relationships,
    visiblePersonIds: new Set(visible ?? people.map((p) => p.id)),
  }
}

describe("arrowKeyToStep", () => {
  it("maps arrows to the main axis in a top-to-bottom tree", () => {
    expect(arrowKeyToStep("ArrowUp", "DOWN")).toBe("toward-parents")
    expect(arrowKeyToStep("ArrowDown", "DOWN")).toBe("toward-children")
    expect(arrowKeyToStep("ArrowLeft", "DOWN")).toBe("cross-prev")
    expect(arrowKeyToStep("ArrowRight", "DOWN")).toBe("cross-next")
  })

  // The whole point of keying off direction: in a left-to-right tree the
  // parents are drawn to the left, so the left arrow has to walk to them.
  it("rotates with the layout in a left-to-right tree", () => {
    expect(arrowKeyToStep("ArrowLeft", "RIGHT")).toBe("toward-parents")
    expect(arrowKeyToStep("ArrowRight", "RIGHT")).toBe("toward-children")
    expect(arrowKeyToStep("ArrowUp", "RIGHT")).toBe("cross-prev")
    expect(arrowKeyToStep("ArrowDown", "RIGHT")).toBe("cross-next")
  })

  it("ignores any other key", () => {
    expect(arrowKeyToStep("Enter", "DOWN")).toBeUndefined()
    expect(arrowKeyToStep("a", "RIGHT")).toBeUndefined()
  })
})

describe("stepToRelative — main axis", () => {
  const people = [
    person("dad", 1),
    person("mum", 2),
    person("kid", 3),
    person("kid2", 4),
  ]
  const relationships = [
    parentChild("dad", "kid"),
    parentChild("mum", "kid"),
    parentChild("dad", "kid2"),
    parentChild("mum", "kid2"),
  ]

  it("steps to a parent, taking the earliest recorded of the two", () => {
    expect(
      stepToRelative("kid", "toward-parents", graphOf(people, relationships))
    ).toBe("dad")
  })

  it("steps to the eldest child", () => {
    expect(
      stepToRelative("dad", "toward-children", graphOf(people, relationships))
    ).toBe("kid")
  })

  it("returns nothing when there is nobody that way", () => {
    expect(
      stepToRelative("dad", "toward-parents", graphOf(people, relationships))
    ).toBeUndefined()
    expect(
      stepToRelative("kid", "toward-children", graphOf(people, relationships))
    ).toBeUndefined()
  })

  // A hidden generation or a focus scope removes cards from the canvas, and a
  // key that selected an invisible person would light up the detail panel for
  // a card that isn't there.
  it("skips over a relative who is not on the canvas", () => {
    const visible = graphOf(people, relationships, ["mum", "kid", "kid2"])
    expect(stepToRelative("kid", "toward-parents", visible)).toBe("mum")
  })

  it("returns nothing when every relative that way is hidden", () => {
    const visible = graphOf(people, relationships, ["kid", "kid2"])
    expect(stepToRelative("kid", "toward-parents", visible)).toBeUndefined()
  })
})

describe("stepToRelative — cross axis", () => {
  const people = [
    person("dad", 1),
    person("a", 10),
    person("b", 20),
    person("c", 30),
  ]
  const relationships = [
    parentChild("dad", "a"),
    parentChild("dad", "b"),
    parentChild("dad", "c"),
  ]

  it("walks siblings in recorded order", () => {
    const graph = graphOf(people, relationships)
    expect(stepToRelative("a", "cross-next", graph)).toBe("b")
    expect(stepToRelative("b", "cross-next", graph)).toBe("c")
    expect(stepToRelative("c", "cross-prev", graph)).toBe("b")
  })

  // No wraparound: holding an arrow key must stop at the edge of the row
  // rather than snapping back to the far end, which reads as a random jump.
  it("stops at each end of the row instead of wrapping", () => {
    const graph = graphOf(people, relationships)
    expect(stepToRelative("a", "cross-prev", graph)).toBeUndefined()
    expect(stepToRelative("c", "cross-next", graph)).toBeUndefined()
  })

  it("places a spouse immediately after the person they married", () => {
    const withSpouse = [...people, person("b-wife", 25)]
    const graph = graphOf(withSpouse, [...relationships, spouse("b", "b-wife")])
    expect(stepToRelative("b", "cross-next", graph)).toBe("b-wife")
    expect(stepToRelative("b-wife", "cross-next", graph)).toBe("c")
    expect(stepToRelative("b-wife", "cross-prev", graph)).toBe("b")
  })

  // Someone with no recorded parents has a row of one — but their spouse must
  // still be reachable, or ←/→ would do nothing at all for a couple who are
  // the top of the tree.
  it("reaches a spouse when the person has no siblings at all", () => {
    const couple = [person("x", 1), person("y", 2)]
    const graph = graphOf(couple, [spouse("x", "y")])
    expect(stepToRelative("x", "cross-next", graph)).toBe("y")
    expect(stepToRelative("y", "cross-prev", graph)).toBe("x")
  })

  it("keeps a multiple-birth group together in the row", () => {
    const twins = [
      person("dad", 1),
      person("first", 10),
      person("twin-a", 20, { multipleBirthGroup: "t" }),
      // Recorded between the twins, but must not be laid between them.
      person("between", 30),
      person("twin-b", 40, { multipleBirthGroup: "t" }),
    ]
    const links = [
      parentChild("dad", "first"),
      parentChild("dad", "twin-a"),
      parentChild("dad", "between"),
      parentChild("dad", "twin-b"),
    ]
    const graph = graphOf(twins, links)
    expect(stepToRelative("twin-a", "cross-next", graph)).toBe("twin-b")
    expect(stepToRelative("twin-b", "cross-next", graph)).toBe("between")
  })

  // Half-siblings share only one parent but still sit in the same row.
  it("includes half-siblings through either parent", () => {
    const blended = [
      person("dad", 1),
      person("mum", 2),
      person("stepmum", 3),
      person("full", 10),
      person("half", 20),
    ]
    const links = [
      parentChild("dad", "full"),
      parentChild("mum", "full"),
      parentChild("dad", "half"),
      parentChild("stepmum", "half"),
    ]
    expect(stepToRelative("full", "cross-next", graphOf(blended, links))).toBe(
      "half"
    )
  })

  it("omits a sibling who is not on the canvas", () => {
    const graph = graphOf(people, relationships, ["dad", "a", "c"])
    expect(stepToRelative("a", "cross-next", graph)).toBe("c")
  })

  it("returns nothing when the person themselves is not visible", () => {
    const graph = graphOf(people, relationships, ["b", "c"])
    expect(stepToRelative("a", "cross-next", graph)).toBeUndefined()
  })

  // Two spouse rows for the same pair, or a remarriage recorded twice, must
  // not put the same card in the row twice.
  it("never repeats a person in the row", () => {
    const couple = [person("x", 1), person("y", 2)]
    const graph = graphOf(couple, [spouse("x", "y"), spouse("y", "x")])
    expect(stepToRelative("x", "cross-next", graph)).toBe("y")
    expect(stepToRelative("y", "cross-next", graph)).toBeUndefined()
  })
})

describe("addRelativeKindForKey", () => {
  it("binds p, s and c to the three add actions", () => {
    expect(addRelativeKindForKey("p")).toBe("add-parent")
    expect(addRelativeKindForKey("S")).toBe("add-spouse")
    expect(addRelativeKindForKey("c")).toBe("add-child")
  })

  // Sibling is deliberately unbound — it can invent a placeholder parent.
  it("leaves every other key alone", () => {
    expect(addRelativeKindForKey("b")).toBeUndefined()
    expect(addRelativeKindForKey("Enter")).toBeUndefined()
  })
})

describe("isTypingTarget", () => {
  it("recognises the fields a bare-letter shortcut would otherwise swallow", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true)
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true)
    expect(isTypingTarget(document.createElement("select"))).toBe(true)
  })

  it("treats a rich-text region as typing too", () => {
    const div = document.createElement("div")
    div.contentEditable = "true"
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(div, "isContentEditable", { value: true })
    expect(isTypingTarget(div)).toBe(true)
  })

  it("lets a shortcut through anywhere else", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

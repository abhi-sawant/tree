import { describe, expect, it } from "vitest"

import { sharedParentLinkSubtype, subtypeOf } from "~/lib/graph/parent-links"
import type { ParentChildSubtype, Relationship } from "~/lib/types"

function link(
  from: string,
  to: string,
  subtype?: ParentChildSubtype
): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to, subtype }
}

describe("subtypeOf", () => {
  it("treats an absent subtype as biological", () => {
    expect(subtypeOf(link("a", "c"))).toBe("biological")
    expect(subtypeOf(link("a", "c", "adopted"))).toBe("adopted")
  })
})

describe("sharedParentLinkSubtype", () => {
  it("returns the subtype both parents agree on", () => {
    const rels = [link("a", "c", "adopted"), link("b", "c", "adopted")]
    expect(sharedParentLinkSubtype(rels, "c", ["a", "b"])).toBe("adopted")
  })

  it("returns biological when neither link records a subtype", () => {
    const rels = [link("a", "c"), link("b", "c")]
    expect(sharedParentLinkSubtype(rels, "c", ["a", "b"])).toBe("biological")
  })

  it("returns undefined when the two links disagree", () => {
    // Biological through one parent, step through the other: one line and one
    // PEDI value can't say that, so neither caller gets an answer to render.
    const rels = [link("a", "c"), link("b", "c", "step")]
    expect(sharedParentLinkSubtype(rels, "c", ["a", "b"])).toBeUndefined()
  })

  it("returns undefined when two non-biological subtypes disagree", () => {
    const rels = [link("a", "c", "adopted"), link("b", "c", "foster")]
    expect(sharedParentLinkSubtype(rels, "c", ["a", "b"])).toBeUndefined()
  })

  it("resolves a single-parent link on its own", () => {
    expect(
      sharedParentLinkSubtype([link("a", "c", "foster")], "c", ["a"])
    ).toBe("foster")
  })

  it("returns undefined when there are no links at all", () => {
    expect(sharedParentLinkSubtype([], "c", ["a", "b"])).toBeUndefined()
  })

  it("ignores spouse relationships and links to other children", () => {
    const rels: Relationship[] = [
      { id: "s", type: "spouse", from: "a", to: "b" },
      link("a", "other", "adopted"),
      link("a", "c"),
    ]
    expect(sharedParentLinkSubtype(rels, "c", ["a"])).toBe("biological")
  })
})

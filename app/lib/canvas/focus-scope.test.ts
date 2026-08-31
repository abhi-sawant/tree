import { describe, expect, it } from "vitest"

import { personIdsInFocus, type FocusScope } from "~/lib/canvas/focus-scope"
import type { Relationship } from "~/lib/types"

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to }
}

// gp1 + gp2 -> dad; gp3 + gp4 -> mum; dad + mum -> me; me + partner -> kid;
// kid + kidPartner -> grandkid. unrelated has no links at all.
const RELATIONSHIPS: Relationship[] = [
  spouse("gp1", "gp2"),
  parentChild("gp1", "dad"),
  parentChild("gp2", "dad"),
  spouse("gp3", "gp4"),
  parentChild("gp3", "mum"),
  parentChild("gp4", "mum"),
  spouse("dad", "mum"),
  parentChild("dad", "me"),
  parentChild("mum", "me"),
  spouse("me", "partner"),
  parentChild("me", "kid"),
  parentChild("partner", "kid"),
  spouse("kid", "kidPartner"),
  parentChild("kid", "grandkid"),
  parentChild("kidPartner", "grandkid"),
]

function focus(overrides: Partial<FocusScope> = {}): string[] {
  return [
    ...personIdsInFocus(RELATIONSHIPS, {
      personId: "me",
      mode: "both",
      generations: Infinity,
      ...overrides,
    }),
  ].sort()
}

describe("personIdsInFocus — direction", () => {
  it("walks only upward for ancestors", () => {
    expect(focus({ mode: "ancestors" })).toEqual([
      "dad",
      "gp1",
      "gp2",
      "gp3",
      "gp4",
      "me",
      "mum",
      "partner",
    ])
  })

  it("walks only downward for descendants", () => {
    expect(focus({ mode: "descendants" })).toEqual([
      "grandkid",
      "kid",
      "kidPartner",
      "me",
      "partner",
    ])
  })

  it("walks both directions for both", () => {
    const included = focus({ mode: "both" })
    expect(included).toContain("gp1")
    expect(included).toContain("grandkid")
  })

  it("always includes the focus person", () => {
    expect(focus({ mode: "ancestors", generations: 1 })).toContain("me")
  })
})

describe("personIdsInFocus — depth", () => {
  it("stops after one generation up", () => {
    expect(focus({ mode: "ancestors", generations: 1 })).toEqual([
      "dad",
      "me",
      "mum",
      "partner",
    ])
  })

  it("reaches grandparents at two generations up", () => {
    const included = focus({ mode: "ancestors", generations: 2 })
    expect(included).toContain("gp1")
    expect(included).toContain("gp4")
  })

  it("stops after one generation down", () => {
    expect(focus({ mode: "descendants", generations: 1 })).toEqual([
      "kid",
      "kidPartner",
      "me",
      "partner",
    ])
  })

  it("treats a depth beyond the tree as the whole lineage", () => {
    expect(focus({ generations: 99 })).toEqual(focus({ generations: Infinity }))
  })
})

describe("personIdsInFocus — spouses", () => {
  it("includes the spouse of anyone included, so a couple is never split", () => {
    // Without this the union node between a couple would have only one parent
    // present, and deriveUnions needs both to produce one at all.
    expect(focus({ mode: "ancestors", generations: 1 })).toContain("partner")
  })

  it("does not traverse through a spouse into their own family", () => {
    // partner is in scope, but partner's parents are not this person's
    // ancestors and must not be dragged in.
    const relationships = [
      ...RELATIONSHIPS,
      parentChild("partnerDad", "partner"),
    ]
    const included = personIdsInFocus(relationships, {
      personId: "me",
      mode: "ancestors",
      generations: Infinity,
    })
    expect(included.has("partner")).toBe(true)
    expect(included.has("partnerDad")).toBe(false)
  })

  it("does not walk sideways through a remarriage", () => {
    // partner's other spouse must not appear just because partner does.
    const relationships = [...RELATIONSHIPS, spouse("partner", "exOfPartner")]
    const included = personIdsInFocus(relationships, {
      personId: "me",
      mode: "ancestors",
      generations: 1,
    })
    expect(included.has("exOfPartner")).toBe(false)
  })
})

describe("personIdsInFocus — edges", () => {
  it("excludes people with no connection to the focus person", () => {
    expect(focus()).not.toContain("unrelated")
  })

  it("returns just the person and their spouse when nothing else connects", () => {
    expect(
      [
        ...personIdsInFocus([spouse("a", "b")], {
          personId: "a",
          mode: "both",
          generations: Infinity,
        }),
      ].sort()
    ).toEqual(["a", "b"])
  })

  it("returns just the person for an empty relationship set", () => {
    expect([
      ...personIdsInFocus([], {
        personId: "lonely",
        mode: "both",
        generations: Infinity,
      }),
    ]).toEqual(["lonely"])
  })

  it("terminates on a cousin marriage, which makes the graph cyclic", () => {
    const relationships = [
      ...RELATIONSHIPS,
      // me's kid marries me's own sibling's kid, closing a loop.
      parentChild("dad", "sibling"),
      parentChild("mum", "sibling"),
      parentChild("sibling", "cousin"),
      spouse("kid", "cousin"),
    ]
    const included = personIdsInFocus(relationships, {
      personId: "me",
      mode: "both",
      generations: Infinity,
    })
    expect(included.has("cousin")).toBe(true)
  })
})

import { describe, expect, it } from "vitest"

import { deriveUnions } from "~/lib/graph/derive-unions"
import type { Relationship } from "~/lib/types"

const id = () => crypto.randomUUID()

function parentChild(from: string, to: string): Relationship {
  return { id: id(), type: "parent-child", from, to }
}

function spouse(
  from: string,
  to: string,
  overrides: Partial<Relationship> = {}
): Relationship {
  return { id: id(), type: "spouse", from, to, ...overrides }
}

describe("deriveUnions", () => {
  it("(a) two parents with a recorded spouse relationship produce a real union", () => {
    const a = id()
    const b = id()
    const child = id()
    const marriage = spouse(a, b, { start: { year: 1990 } })

    const result = deriveUnions(
      [],
      [parentChild(a, child), parentChild(b, child), marriage]
    )

    expect(result.unions).toHaveLength(1)
    expect(result.unions[0]).toMatchObject({
      kind: "real",
      relationshipId: marriage.id,
      start: { year: 1990 },
    })
    expect(result.unions[0].parents.slice().sort()).toEqual([a, b].sort())
    expect(result.twoParentLinks).toEqual([
      { unionId: result.unions[0].id, childId: child },
    ])
    expect(result.singleParentLinks).toEqual([])
  })

  it("(b) two parents with no recorded spouse relationship produce an implicit union", () => {
    const a = id()
    const b = id()
    const child = id()

    const result = deriveUnions(
      [],
      [parentChild(a, child), parentChild(b, child)]
    )

    expect(result.unions).toHaveLength(1)
    expect(result.unions[0].kind).toBe("implicit")
    expect(result.unions[0].relationshipId).toBeUndefined()
    expect(result.unions[0].start).toBeUndefined()
  })

  it("(c) a single recorded parent produces no union, only a single-parent link", () => {
    const parent = id()
    const child = id()

    const result = deriveUnions([], [parentChild(parent, child)])

    expect(result.unions).toEqual([])
    expect(result.singleParentLinks).toEqual([
      { parentId: parent, childId: child },
    ])
    expect(result.twoParentLinks).toEqual([])
  })

  it("(d) remarriage: children split correctly across two distinct unions", () => {
    const x = id()
    const a = id()
    const b = id()
    const childWithA = id()
    const childWithB = id()

    const result = deriveUnions(
      [],
      [
        spouse(x, a),
        parentChild(x, childWithA),
        parentChild(a, childWithA),
        parentChild(x, childWithB),
        parentChild(b, childWithB),
      ]
    )

    expect(result.unions).toHaveLength(2)
    const unionForA = result.twoParentLinks.find(
      (l) => l.childId === childWithA
    )!.unionId
    const unionForB = result.twoParentLinks.find(
      (l) => l.childId === childWithB
    )!.unionId
    expect(unionForA).not.toBe(unionForB)

    const union1 = result.unions.find((u) => u.id === unionForA)!
    const union2 = result.unions.find((u) => u.id === unionForB)!
    expect(union1.parents.slice().sort()).toEqual([x, a].sort())
    expect(union2.parents.slice().sort()).toEqual([x, b].sort())
  })

  it("aggregates all shared children under a single union", () => {
    const a = id()
    const b = id()
    const child1 = id()
    const child2 = id()

    const result = deriveUnions(
      [],
      [
        parentChild(a, child1),
        parentChild(b, child1),
        parentChild(a, child2),
        parentChild(b, child2),
      ]
    )

    expect(result.unions).toHaveLength(1)
    const unionId = result.unions[0].id
    expect(
      result.twoParentLinks.sort((l1, l2) =>
        l1.childId.localeCompare(l2.childId)
      )
    ).toEqual(
      [
        { unionId, childId: child1 },
        { unionId, childId: child2 },
      ].sort((l1, l2) => l1.childId.localeCompare(l2.childId))
    )
  })

  it("produces a stable union id regardless of spouse relationship from/to order", () => {
    const a = id()
    const b = id()
    const child = id()

    const orderAB = deriveUnions(
      [],
      [parentChild(a, child), parentChild(b, child), spouse(a, b)]
    )
    const orderBA = deriveUnions(
      [],
      [parentChild(a, child), parentChild(b, child), spouse(b, a)]
    )

    expect(orderAB.unions[0].id).toBe(orderBA.unions[0].id)
  })

  it("silently skips a child with 3 recorded parents (malformed, pre-validation data)", () => {
    const a = id()
    const b = id()
    const c = id()
    const child = id()

    const result = deriveUnions(
      [],
      [parentChild(a, child), parentChild(b, child), parentChild(c, child)]
    )

    expect(result.unions).toEqual([])
    expect(result.singleParentLinks).toEqual([])
    expect(result.twoParentLinks).toEqual([])
  })
})

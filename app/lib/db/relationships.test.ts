import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  RelationshipCycleError,
  SelfReferenceError,
  TooManyParentsError,
  addRelationship,
  getImmediateFamilyIds,
  removeRelationship,
} from "~/lib/db/relationships"

afterEach(async () => {
  await Promise.all([db.people.clear(), db.relationships.clear()])
})

const id = () => crypto.randomUUID()

describe("addRelationship", () => {
  it("creates and persists a parent-child relationship", async () => {
    const parent = id()
    const child = id()

    const relationship = await addRelationship({
      type: "parent-child",
      from: parent,
      to: child,
    })

    expect(relationship.id).toBeTruthy()
    expect(await db.relationships.get(relationship.id)).toEqual(relationship)
  })

  it("creates and persists a spouse relationship with dates", async () => {
    const a = id()
    const b = id()

    const relationship = await addRelationship({
      type: "spouse",
      from: a,
      to: b,
      start: { year: 1990 },
      end: { year: 2000 },
    })

    expect(relationship.start).toEqual({ year: 1990 })
    expect(relationship.end).toEqual({ year: 2000 })
    expect(await db.relationships.get(relationship.id)).toEqual(relationship)
  })

  it("rejects self-reference for parent-child", async () => {
    const person = id()
    await expect(
      addRelationship({ type: "parent-child", from: person, to: person })
    ).rejects.toThrow(SelfReferenceError)
  })

  it("rejects self-reference for spouse", async () => {
    const person = id()
    await expect(
      addRelationship({ type: "spouse", from: person, to: person })
    ).rejects.toThrow(SelfReferenceError)
  })

  it("allows a second parent but rejects a third", async () => {
    const child = id()
    const parentA = id()
    const parentB = id()
    const parentC = id()

    await addRelationship({ type: "parent-child", from: parentA, to: child })
    await addRelationship({ type: "parent-child", from: parentB, to: child })

    await expect(
      addRelationship({ type: "parent-child", from: parentC, to: child })
    ).rejects.toThrow(TooManyParentsError)

    try {
      await addRelationship({ type: "parent-child", from: parentC, to: child })
    } catch (error) {
      expect(error).toBeInstanceOf(TooManyParentsError)
      expect((error as TooManyParentsError).existingParentIds.sort()).toEqual(
        [parentA, parentB].sort()
      )
    }
  })

  it("allows unlimited spouse relationships over time", async () => {
    const person = id()
    const spouseA = id()
    const spouseB = id()
    const spouseC = id()

    await addRelationship({ type: "spouse", from: person, to: spouseA })
    await addRelationship({ type: "spouse", from: person, to: spouseB })
    await addRelationship({ type: "spouse", from: person, to: spouseC })

    expect(await db.relationships.where("from").equals(person).count()).toBe(3)
  })

  it("rejects a direct cycle", async () => {
    const a = id()
    const b = id()

    await addRelationship({ type: "parent-child", from: a, to: b })

    await expect(
      addRelationship({ type: "parent-child", from: b, to: a })
    ).rejects.toThrow(RelationshipCycleError)
  })

  it("rejects an indirect, multi-hop cycle", async () => {
    const a = id()
    const b = id()
    const c = id()

    await addRelationship({ type: "parent-child", from: a, to: b })
    await addRelationship({ type: "parent-child", from: b, to: c })

    await expect(
      addRelationship({ type: "parent-child", from: c, to: a })
    ).rejects.toThrow(RelationshipCycleError)
  })

  it("allows two children sharing the same two parents without false-flagging a cycle", async () => {
    const parentA = id()
    const parentB = id()
    const childA = id()
    const childB = id()

    await addRelationship({ type: "parent-child", from: parentA, to: childA })
    await addRelationship({ type: "parent-child", from: parentB, to: childA })

    await expect(
      addRelationship({ type: "parent-child", from: parentA, to: childB })
    ).resolves.toBeDefined()
    await expect(
      addRelationship({ type: "parent-child", from: parentB, to: childB })
    ).resolves.toBeDefined()
  })

  it("supports replacing a parent via remove-then-add even though the child already has 2 parents", async () => {
    const child = id()
    const oldParent = id()
    const newParent = id()
    const otherParent = id()

    const toReplace = await addRelationship({
      type: "parent-child",
      from: oldParent,
      to: child,
    })
    await addRelationship({
      type: "parent-child",
      from: otherParent,
      to: child,
    })

    await removeRelationship(toReplace.id)

    await expect(
      addRelationship({ type: "parent-child", from: newParent, to: child })
    ).resolves.toBeDefined()
  })
})

describe("removeRelationship", () => {
  it("deletes the relationship", async () => {
    const relationship = await addRelationship({
      type: "spouse",
      from: id(),
      to: id(),
    })
    await removeRelationship(relationship.id)
    expect(await db.relationships.get(relationship.id)).toBeUndefined()
  })

  it("is a no-op for a nonexistent id", async () => {
    await expect(removeRelationship(id())).resolves.toBeUndefined()
  })
})

describe("getImmediateFamilyIds", () => {
  it("returns an empty array for someone with no relationships", async () => {
    expect(await getImmediateFamilyIds(id())).toEqual([])
  })

  it("includes parents", async () => {
    const person = id()
    const parentA = id()
    const parentB = id()
    await addRelationship({ type: "parent-child", from: parentA, to: person })
    await addRelationship({ type: "parent-child", from: parentB, to: person })

    expect(new Set(await getImmediateFamilyIds(person))).toEqual(
      new Set([parentA, parentB])
    )
  })

  it("includes spouses regardless of relationship direction", async () => {
    const person = id()
    const spouseAsTo = id()
    const spouseAsFrom = id()
    await addRelationship({ type: "spouse", from: spouseAsTo, to: person })
    await addRelationship({ type: "spouse", from: person, to: spouseAsFrom })

    expect(new Set(await getImmediateFamilyIds(person))).toEqual(
      new Set([spouseAsTo, spouseAsFrom])
    )
  })

  it("includes children", async () => {
    const person = id()
    const child = id()
    await addRelationship({ type: "parent-child", from: person, to: child })

    expect(await getImmediateFamilyIds(person)).toEqual([child])
  })

  it("dedupes and combines parents, spouses, and children (remarriage case)", async () => {
    const person = id()
    const parent = id()
    const firstSpouse = id()
    const secondSpouse = id()
    const childWithFirst = id()
    const childWithSecond = id()
    await addRelationship({ type: "parent-child", from: parent, to: person })
    await addRelationship({ type: "spouse", from: person, to: firstSpouse })
    await addRelationship({ type: "spouse", from: person, to: secondSpouse })
    await addRelationship({ type: "parent-child", from: person, to: childWithFirst })
    await addRelationship({ type: "parent-child", from: firstSpouse, to: childWithFirst })
    await addRelationship({ type: "parent-child", from: person, to: childWithSecond })
    await addRelationship({ type: "parent-child", from: secondSpouse, to: childWithSecond })

    expect(new Set(await getImmediateFamilyIds(person))).toEqual(
      new Set([parent, firstSpouse, secondSpouse, childWithFirst, childWithSecond])
    )
  })
})

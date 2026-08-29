import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  addChildExisting,
  addChildNew,
  addParentExisting,
  addParentNew,
  addSiblingExisting,
  addSiblingNew,
  addSpouseExisting,
  addSpouseNew,
  ensureParentsForSibling,
  recordMarriage,
  updateRelationshipDates,
} from "~/lib/db/relationship-actions"
import { createPerson } from "~/lib/db/people"
import { TooManyParentsError, addRelationship } from "~/lib/db/relationships"
import { addPersonToTree } from "~/lib/db/trees"
import type { Tree } from "~/lib/types"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.members.clear(),
    db.trees.clear(),
  ])
})

async function makeTree(rootPersonId: string): Promise<Tree> {
  const tree: Tree = {
    id: crypto.randomUUID(),
    name: "Test tree",
    rootPersonId,
    createdAt: Date.now(),
  }
  await db.trees.add(tree)
  await db.members.put({ treeId: tree.id, personId: rootPersonId })
  return tree
}

async function isMember(treeId: string, personId: string): Promise<boolean> {
  return (await db.members.get([treeId, personId])) !== undefined
}

describe("addParentNew / addParentExisting", () => {
  it("creates a new parent, links it, and adds it to the tree", async () => {
    const child = await createPerson({ givenName: "Child" })
    const tree = await makeTree(child.id)

    const parent = await addParentNew(child.id, tree.id, {
      givenName: "Parent",
    })

    expect(await db.people.get(parent.id)).toBeDefined()
    expect(
      await db.relationships
        .where({ type: "parent-child", from: parent.id, to: child.id })
        .count()
    ).toBe(1)
    expect(await isMember(tree.id, parent.id)).toBe(true)
  })

  it("links an existing person as a parent and adds them to the tree", async () => {
    const child = await createPerson({ givenName: "Child" })
    const existing = await createPerson({ givenName: "Grandparent" })
    const tree = await makeTree(child.id)

    await addParentExisting(child.id, tree.id, existing.id)

    expect(
      await db.relationships
        .where({ type: "parent-child", from: existing.id, to: child.id })
        .count()
    ).toBe(1)
    expect(await isMember(tree.id, existing.id)).toBe(true)
  })

  it("rolls back the new person when the child already has 2 parents", async () => {
    const child = await createPerson({ givenName: "Child" })
    const tree = await makeTree(child.id)
    await addRelationship({
      type: "parent-child",
      from: (await createPerson({ givenName: "P1" })).id,
      to: child.id,
    })
    await addRelationship({
      type: "parent-child",
      from: (await createPerson({ givenName: "P2" })).id,
      to: child.id,
    })

    const before = await db.people.count()
    await expect(
      addParentNew(child.id, tree.id, { givenName: "P3" })
    ).rejects.toThrow(TooManyParentsError)
    expect(await db.people.count()).toBe(before)
  })
})

describe("addSpouseNew / addSpouseExisting / recordMarriage", () => {
  it("creates a new spouse with dates and adds them to the tree", async () => {
    const person = await createPerson({ givenName: "Person" })
    const tree = await makeTree(person.id)

    const spouse = await addSpouseNew(
      person.id,
      tree.id,
      { givenName: "Spouse" },
      { start: { year: 2000 } }
    )

    const rel = await db.relationships
      .where({ type: "spouse", from: person.id, to: spouse.id })
      .first()
    expect(rel?.start).toEqual({ year: 2000 })
    expect(await isMember(tree.id, spouse.id)).toBe(true)
  })

  it("links an existing spouse", async () => {
    const person = await createPerson({ givenName: "Person" })
    const existing = await createPerson({ givenName: "Existing" })
    const tree = await makeTree(person.id)

    await addSpouseExisting(person.id, tree.id, existing.id)

    expect(
      await db.relationships
        .where({ type: "spouse", from: person.id, to: existing.id })
        .count()
    ).toBe(1)
    expect(await isMember(tree.id, existing.id)).toBe(true)
  })

  it("records a marriage between two existing parents without creating a person or membership", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const peopleBefore = await db.people.count()
    const membersBefore = await db.members.count()

    await recordMarriage([a.id, b.id], { start: { year: 1995 } })

    expect(await db.people.count()).toBe(peopleBefore)
    expect(await db.members.count()).toBe(membersBefore)
    expect(
      await db.relationships
        .where({ type: "spouse", from: a.id, to: b.id })
        .count()
    ).toBe(1)
  })
})

describe("addChildNew / addChildExisting", () => {
  it("links a new child to a single person with no union", async () => {
    const parent = await createPerson({ givenName: "Parent" })
    const tree = await makeTree(parent.id)

    const child = await addChildNew(
      { kind: "person", personId: parent.id },
      tree.id,
      { givenName: "Child" }
    )

    expect(
      await db.relationships
        .where({ type: "parent-child", from: parent.id, to: child.id })
        .count()
    ).toBe(1)
    expect(await isMember(tree.id, child.id)).toBe(true)
  })

  it("links a new child to both parents of a union", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const tree = await makeTree(a.id)

    const child = await addChildNew(
      { kind: "union", parents: [a.id, b.id] },
      tree.id,
      { givenName: "Child" }
    )

    expect(
      await db.relationships
        .where({ type: "parent-child", to: child.id })
        .count()
    ).toBe(2)
    expect(await isMember(tree.id, child.id)).toBe(true)
  })

  it("links an existing child to a union's two parents", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const existingChild = await createPerson({ givenName: "Child" })
    const tree = await makeTree(a.id)

    await addChildExisting(
      { kind: "union", parents: [a.id, b.id] },
      tree.id,
      existingChild.id
    )

    expect(
      await db.relationships
        .where({ type: "parent-child", to: existingChild.id })
        .count()
    ).toBe(2)
    expect(await isMember(tree.id, existingChild.id)).toBe(true)
  })
})

describe("ensureParentsForSibling", () => {
  it("returns existing parents untouched when the person already has some", async () => {
    const parent = await createPerson({ givenName: "Parent" })
    const child = await createPerson({ givenName: "Child" })
    const tree = await makeTree(parent.id)
    await addRelationship({
      type: "parent-child",
      from: parent.id,
      to: child.id,
    })

    const before = await db.people.count()
    const result = await ensureParentsForSibling(child.id, tree.id)

    expect(result).toEqual({ parentIds: [parent.id] })
    expect(await db.people.count()).toBe(before)
  })

  it("auto-creates a placeholder parent when none are recorded (D5)", async () => {
    const person = await createPerson({ givenName: "Person" })
    const tree = await makeTree(person.id)

    const result = await ensureParentsForSibling(person.id, tree.id)

    expect(result.createdPlaceholder?.isPlaceholder).toBe(true)
    expect(result.parentIds).toEqual([result.createdPlaceholder!.id])
    expect(
      await db.relationships
        .where({
          type: "parent-child",
          from: result.createdPlaceholder!.id,
          to: person.id,
        })
        .count()
    ).toBe(1)
    expect(await isMember(tree.id, result.createdPlaceholder!.id)).toBe(true)
  })
})

describe("addSiblingNew / addSiblingExisting", () => {
  it("attaches a new sibling to the person's existing parents", async () => {
    const parent = await createPerson({ givenName: "Parent" })
    const person = await createPerson({ givenName: "Person" })
    const tree = await makeTree(parent.id)
    await addRelationship({
      type: "parent-child",
      from: parent.id,
      to: person.id,
    })

    const sibling = await addSiblingNew(person.id, tree.id, {
      givenName: "Sibling",
    })

    expect(
      await db.relationships
        .where({ type: "parent-child", from: parent.id, to: sibling.id })
        .count()
    ).toBe(1)
  })

  it("attaches an existing sibling via an auto-created placeholder parent", async () => {
    const person = await createPerson({ givenName: "Person" })
    const existingSibling = await createPerson({ givenName: "Sibling" })
    const tree = await makeTree(person.id)

    await addSiblingExisting(person.id, tree.id, existingSibling.id)

    const personParents = await db.relationships
      .where({ type: "parent-child", to: person.id })
      .toArray()
    const siblingParents = await db.relationships
      .where({ type: "parent-child", to: existingSibling.id })
      .toArray()
    expect(personParents).toHaveLength(1)
    expect(siblingParents).toHaveLength(1)
    expect(personParents[0].from).toBe(siblingParents[0].from)
  })
})

describe("updateRelationshipDates", () => {
  it("replaces the relationship with new dates, keeping the same from/to/type", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const original = await addRelationship({
      type: "spouse",
      from: a.id,
      to: b.id,
      start: { year: 1990 },
    })

    const updated = await updateRelationshipDates(original, {
      start: { year: 1991 },
      end: { year: 2000 },
    })

    expect(await db.relationships.get(original.id)).toBeUndefined()
    expect(updated.from).toBe(a.id)
    expect(updated.to).toBe(b.id)
    expect(updated.type).toBe("spouse")
    expect(updated.start).toEqual({ year: 1991 })
    expect(updated.end).toEqual({ year: 2000 })
  })
})

describe("addPersonToTree idempotency (regression)", () => {
  it("does not overwrite a saved x/y override when called on an existing member", async () => {
    const person = await createPerson({ givenName: "Person" })
    const tree = await makeTree(person.id)
    await db.members.put({ treeId: tree.id, personId: person.id, x: 42, y: 99 })

    await addPersonToTree(tree.id, person.id)

    expect(await db.members.get([tree.id, person.id])).toEqual({
      treeId: tree.id,
      personId: person.id,
      x: 42,
      y: 99,
    })
  })
})

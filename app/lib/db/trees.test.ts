import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import { addRelationship } from "~/lib/db/relationships"
import {
  PersonIsRootOfTreeError,
  addExistingPersonToTree,
  addPersonToTree,
  createTree,
  deleteTree,
  reassignRoot,
  removeMember,
  updateTreeName,
} from "~/lib/db/trees"
import type { Person, Tree } from "~/lib/types"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
  ])
})

const id = () => crypto.randomUUID()

async function seedPerson(overrides: Partial<Person> = {}): Promise<Person> {
  const now = Date.now()
  const person: Person = {
    id: id(),
    givenName: "Test",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  await db.people.add(person)
  return person
}

async function seedTree(overrides: Partial<Tree> = {}): Promise<Tree> {
  const tree: Tree = {
    id: id(),
    name: "Test Tree",
    rootPersonId: id(),
    createdAt: Date.now(),
    ...overrides,
  }
  await db.trees.add(tree)
  return tree
}

describe("updateTreeName", () => {
  it("renames the tree", async () => {
    const tree = await seedTree({ name: "Old Name" })

    await updateTreeName(tree.id, "New Name")

    expect((await db.trees.get(tree.id))?.name).toBe("New Name")
  })

  it("trims whitespace", async () => {
    const tree = await seedTree()

    await updateTreeName(tree.id, "  Padded  ")

    expect((await db.trees.get(tree.id))?.name).toBe("Padded")
  })

  it("rejects an empty name", async () => {
    const tree = await seedTree()
    await expect(updateTreeName(tree.id, "   ")).rejects.toThrow(
      "Tree name cannot be empty"
    )
  })

  it("throws when the tree doesn't exist", async () => {
    await expect(updateTreeName(id(), "Name")).rejects.toThrow("Tree not found")
  })
})

describe("removeMember", () => {
  it("deletes the membership row for a non-root person", async () => {
    const root = await seedPerson()
    const member = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: root.id },
      { treeId: tree.id, personId: member.id },
    ])

    await removeMember(tree.id, member.id)

    expect(await db.members.get([tree.id, member.id])).toBeUndefined()
    expect(await db.members.get([tree.id, root.id])).toBeDefined()
  })

  it("throws PersonIsRootOfTreeError when targeting the root, and leaves membership intact", async () => {
    const root = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id, name: "Ancestors" })
    await db.members.put({ treeId: tree.id, personId: root.id })

    await expect(removeMember(tree.id, root.id)).rejects.toThrow(
      PersonIsRootOfTreeError
    )
    expect(await db.members.get([tree.id, root.id])).toBeDefined()
  })

  it("does not touch people or relationships", async () => {
    const root = await seedPerson()
    const member = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: root.id },
      { treeId: tree.id, personId: member.id },
    ])
    await addRelationship({ type: "parent-child", from: root.id, to: member.id })

    await removeMember(tree.id, member.id)

    expect(await db.people.get(member.id)).toBeDefined()
    expect(await db.relationships.where("to").equals(member.id).count()).toBe(1)
  })
})

describe("deleteTree", () => {
  it("deletes the tree and all of its member rows, leaving people/relationships untouched", async () => {
    const a = await seedPerson()
    const b = await seedPerson()
    const tree = await seedTree({ rootPersonId: a.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: a.id },
      { treeId: tree.id, personId: b.id },
    ])
    await addRelationship({ type: "parent-child", from: a.id, to: b.id })

    await deleteTree(tree.id)

    expect(await db.trees.get(tree.id)).toBeUndefined()
    expect(await db.members.where("treeId").equals(tree.id).count()).toBe(0)
    expect(await db.people.get(a.id)).toBeDefined()
    expect(await db.people.get(b.id)).toBeDefined()
    expect(await db.relationships.where("to").equals(b.id).count()).toBe(1)
  })

  it("leaves other trees' membership rows untouched", async () => {
    const person = await seedPerson()
    const tree = await seedTree({ rootPersonId: person.id })
    const otherTree = await seedTree({ rootPersonId: person.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: person.id },
      { treeId: otherTree.id, personId: person.id },
    ])

    await deleteTree(tree.id)

    expect(await db.members.get([otherTree.id, person.id])).toBeDefined()
  })
})

describe("reassignRoot", () => {
  it("updates rootPersonId when the new root is already a member", async () => {
    const oldRoot = await seedPerson()
    const newRoot = await seedPerson()
    const tree = await seedTree({ rootPersonId: oldRoot.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: oldRoot.id },
      { treeId: tree.id, personId: newRoot.id },
    ])

    await reassignRoot(tree.id, newRoot.id)

    expect((await db.trees.get(tree.id))?.rootPersonId).toBe(newRoot.id)
  })

  it("rejects a person who isn't a member of the tree", async () => {
    const oldRoot = await seedPerson()
    const outsider = await seedPerson()
    const tree = await seedTree({ rootPersonId: oldRoot.id })
    await db.members.put({ treeId: tree.id, personId: oldRoot.id })

    await expect(reassignRoot(tree.id, outsider.id)).rejects.toThrow(
      "is not a member"
    )
    expect((await db.trees.get(tree.id))?.rootPersonId).toBe(oldRoot.id)
  })
})

describe("addExistingPersonToTree", () => {
  it("adds just the person when includeFamily is not set", async () => {
    const root = await seedPerson()
    const person = await seedPerson()
    const parent = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id })
    await db.members.put({ treeId: tree.id, personId: root.id })
    await addRelationship({ type: "parent-child", from: parent.id, to: person.id })

    const result = await addExistingPersonToTree(tree.id, person.id)

    expect(result.addedIds).toEqual([person.id])
    expect(await db.members.get([tree.id, person.id])).toBeDefined()
    expect(await db.members.get([tree.id, parent.id])).toBeUndefined()
  })

  it("adds immediate family (parent, spouse, child) when includeFamily is set", async () => {
    const root = await seedPerson()
    const person = await seedPerson()
    const parent = await seedPerson()
    const spouse = await seedPerson()
    const child = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id })
    await db.members.put({ treeId: tree.id, personId: root.id })
    await addRelationship({ type: "parent-child", from: parent.id, to: person.id })
    await addRelationship({ type: "spouse", from: person.id, to: spouse.id })
    await addRelationship({ type: "parent-child", from: person.id, to: child.id })

    const result = await addExistingPersonToTree(tree.id, person.id, {
      includeFamily: true,
    })

    expect(new Set(result.addedIds)).toEqual(
      new Set([person.id, parent.id, spouse.id, child.id])
    )
    for (const p of [person, parent, spouse, child]) {
      expect(await db.members.get([tree.id, p.id])).toBeDefined()
    }
  })

  it("dedupes family members who are already tree members", async () => {
    const root = await seedPerson()
    const person = await seedPerson()
    const parent = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: root.id },
      { treeId: tree.id, personId: parent.id },
    ])
    await addRelationship({ type: "parent-child", from: parent.id, to: person.id })

    const result = await addExistingPersonToTree(tree.id, person.id, {
      includeFamily: true,
    })

    expect(result.addedIds).toEqual([person.id])
  })

  it("is idempotent when the person is already a member", async () => {
    const root = await seedPerson()
    const person = await seedPerson()
    const tree = await seedTree({ rootPersonId: root.id })
    await db.members.bulkPut([
      { treeId: tree.id, personId: root.id },
      { treeId: tree.id, personId: person.id },
    ])

    const result = await addExistingPersonToTree(tree.id, person.id)

    expect(result.addedIds).toEqual([])
  })
})

describe("addPersonToTree (existing coverage)", () => {
  it("throws when the tree doesn't exist", async () => {
    const person = await seedPerson()
    await expect(addPersonToTree(id(), person.id)).rejects.toThrow("Tree not found")
  })

  it("throws when the person doesn't exist", async () => {
    const tree = await seedTree()
    await expect(addPersonToTree(tree.id, id())).rejects.toThrow("Person not found")
  })
})

describe("createTree", () => {
  it("creates the tree and makes the root person a member", async () => {
    const root = await seedPerson()

    const tree = await createTree({ name: "New Tree", rootPersonId: root.id })

    expect(tree.rootPersonId).toBe(root.id)
    expect(await db.members.get([tree.id, root.id])).toEqual({
      treeId: tree.id,
      personId: root.id,
    })
  })
})

import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  PersonIsRootError,
  createPerson,
  deletePerson,
  getDeleteImpact,
  getTreesForPerson,
  searchPeople,
  updatePerson,
} from "~/lib/db/people"
import { addPersonToTree, createTree } from "~/lib/db/trees"
import type { Person, Photo, Relationship, Tree, TreeMember } from "~/lib/types"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
    db.photos.clear(),
  ])
})

function makePerson(overrides: Partial<Person> = {}): Person {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    givenName: "Ada",
    familyName: "Lovelace",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    id: crypto.randomUUID(),
    name: "Test Tree",
    rootPersonId: crypto.randomUUID(),
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeTreeMember(overrides: Partial<TreeMember> = {}): TreeMember {
  return {
    treeId: crypto.randomUUID(),
    personId: crypto.randomUUID(),
    ...overrides,
  }
}

describe("createPerson", () => {
  it("stamps id, createdAt, and updatedAt", async () => {
    const person = await createPerson({
      givenName: "Grace",
      familyName: "Hopper",
    })

    expect(person.id).toBeTruthy()
    expect(person.createdAt).toBe(person.updatedAt)
    expect(await db.people.get(person.id)).toEqual(person)
  })

  it("defaults isPlaceholder to unset", async () => {
    const person = await createPerson({ givenName: "Alan" })
    expect(person.isPlaceholder).toBeUndefined()
  })
})

describe("updatePerson", () => {
  it("merges the patch, bumps updatedAt, and preserves id/createdAt", async () => {
    const person = await createPerson({
      givenName: "Ada",
      familyName: "Lovelace",
    })
    const before = person.updatedAt

    await new Promise((resolve) => setTimeout(resolve, 2))
    const updated = await updatePerson(person.id, { familyName: "King" })

    expect(updated.id).toBe(person.id)
    expect(updated.createdAt).toBe(person.createdAt)
    expect(updated.familyName).toBe("King")
    expect(updated.givenName).toBe("Ada")
    expect(updated.updatedAt).toBeGreaterThan(before)
  })
})

describe("searchPeople", () => {
  it("matches case-insensitive substrings against the full name", async () => {
    await createPerson({ givenName: "Ada", familyName: "Lovelace" })
    await createPerson({ givenName: "Byron", familyName: "King" })

    const results = await searchPeople("lovel")
    expect(results).toHaveLength(1)
    expect(results[0].givenName).toBe("Ada")
  })

  it("matches a maiden name so a married-name record is still findable", async () => {
    await createPerson({
      givenName: "Ada",
      familyName: "King",
      maidenName: "Byron",
    })
    const results = await searchPeople("byron")
    expect(results).toHaveLength(1)
    expect(results[0].familyName).toBe("King")
  })

  it("matches a nickname", async () => {
    await createPerson({ givenName: "Augusta", nickname: "Ada" })
    expect(await searchPeople("ada")).toHaveLength(1)
  })

  it("includes placeholders by default and excludes them when asked", async () => {
    await createPerson({ givenName: "Real Person" })
    await createPerson({ givenName: "Placeholder Person", isPlaceholder: true })

    expect(await searchPeople("")).toHaveLength(2)
    expect(await searchPeople("", { includePlaceholders: false })).toHaveLength(
      1
    )
  })
})

describe("getTreesForPerson", () => {
  it("returns every tree the person is a member of", async () => {
    const person = makePerson()
    await db.people.add(person)

    const treeA = makeTree()
    const treeB = makeTree()
    await db.trees.bulkAdd([treeA, treeB])
    await db.members.bulkAdd([
      makeTreeMember({ treeId: treeA.id, personId: person.id }),
      makeTreeMember({ treeId: treeB.id, personId: person.id }),
    ])

    const trees = await getTreesForPerson(person.id)
    expect(trees.map((t) => t.id).sort()).toEqual([treeA.id, treeB.id].sort())
  })
})

describe("getDeleteImpact", () => {
  it("is empty for an unattached person", async () => {
    const person = await createPerson({ givenName: "Solo" })
    expect(await getDeleteImpact(person.id)).toEqual({
      blockingTrees: [],
      memberOfTrees: [],
    })
  })

  it("reports memberOfTrees for a regular member", async () => {
    const person = await createPerson({ givenName: "Member" })
    const tree = await createTree({
      name: "Family",
      rootPersonId: crypto.randomUUID(),
    })
    await addPersonToTree(tree.id, person.id)

    const impact = await getDeleteImpact(person.id)
    expect(impact.blockingTrees).toEqual([])
    expect(impact.memberOfTrees).toEqual([{ id: tree.id, name: tree.name }])
  })

  it("reports blockingTrees for a root person", async () => {
    const root = await createPerson({ givenName: "Root" })
    const tree = await createTree({ name: "Family", rootPersonId: root.id })

    const impact = await getDeleteImpact(root.id)
    expect(impact.blockingTrees).toEqual([{ id: tree.id, name: tree.name }])
  })
})

describe("deletePerson", () => {
  it("cascades relationships, memberships, and the photo, without touching unrelated people", async () => {
    const target = await createPerson({ givenName: "Target" })
    const other = await createPerson({ givenName: "Other" })
    const unrelated = await createPerson({ givenName: "Unrelated" })

    const photo: Photo = {
      id: crypto.randomUUID(),
      blob: new Blob(["x"]),
      mime: "image/jpeg",
    }
    await db.photos.add(photo)
    await updatePerson(target.id, { photoId: photo.id })

    const relAsFrom: Relationship = {
      id: crypto.randomUUID(),
      type: "parent-child",
      from: target.id,
      to: other.id,
    }
    const relAsTo: Relationship = {
      id: crypto.randomUUID(),
      type: "spouse",
      from: other.id,
      to: target.id,
    }
    const unrelatedRel: Relationship = {
      id: crypto.randomUUID(),
      type: "parent-child",
      from: other.id,
      to: unrelated.id,
    }
    await db.relationships.bulkAdd([relAsFrom, relAsTo, unrelatedRel])

    const unrelatedPhoto: Photo = {
      id: crypto.randomUUID(),
      blob: new Blob(["y"]),
      mime: "image/jpeg",
    }
    await db.photos.add(unrelatedPhoto)
    await updatePerson(unrelated.id, { photoId: unrelatedPhoto.id })

    const treeA = await createTree({ name: "Tree A", rootPersonId: other.id })
    const treeB = await createTree({ name: "Tree B", rootPersonId: other.id })
    await addPersonToTree(treeA.id, target.id)
    await addPersonToTree(treeB.id, target.id)
    await addPersonToTree(treeA.id, unrelated.id)

    const unrelatedBefore = await db.people.get(unrelated.id)

    await deletePerson(target.id)

    expect(await db.people.get(target.id)).toBeUndefined()
    expect(await db.relationships.get(relAsFrom.id)).toBeUndefined()
    expect(await db.relationships.get(relAsTo.id)).toBeUndefined()
    expect(await db.members.where("personId").equals(target.id).count()).toBe(0)
    expect(await db.photos.get(photo.id)).toBeUndefined()

    // unrelated person and their data are untouched
    expect(await db.people.get(unrelated.id)).toEqual(unrelatedBefore)
    expect(await db.relationships.get(unrelatedRel.id)).toEqual(unrelatedRel)
    expect(await db.photos.get(unrelatedPhoto.id)).toMatchObject({
      id: unrelatedPhoto.id,
      mime: unrelatedPhoto.mime,
    })
    expect(
      await db.members.where("personId").equals(unrelated.id).count()
    ).toBe(1)
  })

  it("blocks deleting a root person, with no partial deletion", async () => {
    const root = await createPerson({ givenName: "Root" })
    const other = await createPerson({ givenName: "Other" })
    const tree = await createTree({ name: "Family", rootPersonId: root.id })

    const relationship: Relationship = {
      id: crypto.randomUUID(),
      type: "spouse",
      from: root.id,
      to: other.id,
    }
    await db.relationships.add(relationship)

    await expect(deletePerson(root.id)).rejects.toThrow(PersonIsRootError)

    try {
      await deletePerson(root.id)
    } catch (error) {
      expect(error).toBeInstanceOf(PersonIsRootError)
      expect((error as PersonIsRootError).trees).toEqual([
        { id: tree.id, name: tree.name },
      ])
    }

    expect(await db.people.get(root.id)).toBeDefined()
    expect(await db.relationships.get(relationship.id)).toEqual(relationship)
    expect(await db.members.where("personId").equals(root.id).count()).toBe(1)
  })
})

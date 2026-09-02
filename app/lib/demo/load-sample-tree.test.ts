import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import { createPerson } from "~/lib/db/people"
import { addRelationship } from "~/lib/db/relationships"
import { addPersonToTree, createTree } from "~/lib/db/trees"
import {
  getSampleTreeStatus,
  loadSampleTree,
  removeSampleTree,
} from "~/lib/demo/load-sample-tree"
import {
  isDemoId,
  SAMPLE_ROOT_ID,
  SAMPLE_TREE_ID,
} from "~/lib/demo/sample-tree"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.members.clear(),
    db.trees.clear(),
    db.photos.clear(),
    db.attachments.clear(),
  ])
})

async function demoPeopleCount(): Promise<number> {
  const people = await db.people.toArray()
  return people.filter((person) => isDemoId(person.id)).length
}

describe("loadSampleTree", () => {
  it("writes the whole family, its tree and its memberships", async () => {
    const result = await loadSampleTree()

    expect(result.treeId).toBe(SAMPLE_TREE_ID)
    expect(await db.people.count()).toBe(result.people)
    expect(await db.trees.get(SAMPLE_TREE_ID)).toMatchObject({
      rootPersonId: SAMPLE_ROOT_ID,
    })
    const members = await db.members
      .where("treeId")
      .equals(SAMPLE_TREE_ID)
      .toArray()
    expect(members).toHaveLength(result.people)
    expect(await db.relationships.count()).toBeGreaterThan(0)
  })

  it("restores the sample rather than duplicating it on a second load", async () => {
    const { people } = await loadSampleTree()
    await db.people.update(SAMPLE_ROOT_ID, { givenName: "Edited" })

    await loadSampleTree()

    expect(await db.people.count()).toBe(people)
    expect((await db.people.get(SAMPLE_ROOT_ID))?.givenName).toBe("Ravi")
  })

  it("leaves data already in the browser alone", async () => {
    const mine = await createPerson({ givenName: "Aai" })
    const myTree = await createTree({ name: "Mine", rootPersonId: mine.id })

    await loadSampleTree()

    expect(await db.people.get(mine.id)).toBeDefined()
    expect(await db.trees.get(myTree.id)).toBeDefined()
    expect(await db.members.get([myTree.id, mine.id])).toBeDefined()
  })

  it("reports what is present", async () => {
    expect(await getSampleTreeStatus()).toEqual({
      treePresent: false,
      personCount: 0,
    })

    const { people } = await loadSampleTree()
    expect(await getSampleTreeStatus()).toEqual({
      treePresent: true,
      personCount: people,
    })
  })
})

describe("removeSampleTree", () => {
  it("takes every trace of it back out", async () => {
    await loadSampleTree()
    const result = await removeSampleTree()

    expect(result.treeRemoved).toBe(true)
    expect(result.keptPeople).toEqual([])
    expect(await demoPeopleCount()).toBe(0)
    expect(await db.people.count()).toBe(0)
    expect(await db.relationships.count()).toBe(0)
    expect(await db.members.count()).toBe(0)
    expect(await db.trees.get(SAMPLE_TREE_ID)).toBeUndefined()
  })

  it("is a no-op when the sample was never loaded", async () => {
    const mine = await createPerson({ givenName: "Aai" })

    const result = await removeSampleTree()

    expect(result).toMatchObject({
      treeRemoved: false,
      peopleRemoved: 0,
      linksToOwnDataRemoved: 0,
      keptPeople: [],
    })
    expect(await db.people.get(mine.id)).toBeDefined()
  })

  it("can be run again after a partial removal", async () => {
    await loadSampleTree()
    await removeSampleTree()
    const second = await removeSampleTree()
    expect(second.peopleRemoved).toBe(0)
    expect(await db.people.count()).toBe(0)
  })

  it("keeps the reader's own people and trees", async () => {
    await loadSampleTree()
    const mine = await createPerson({ givenName: "Aai" })
    const myTree = await createTree({ name: "Mine", rootPersonId: mine.id })

    await removeSampleTree()

    expect(await db.people.count()).toBe(1)
    expect(await db.trees.get(myTree.id)).toBeDefined()
    expect(await db.members.get([myTree.id, mine.id])).toBeDefined()
  })

  it("counts the links it has to break to a real person", async () => {
    await loadSampleTree()
    const mine = await createPerson({ givenName: "Aai" })
    await addRelationship({
      type: "spouse",
      from: mine.id,
      to: "demo-p15",
    })

    const result = await removeSampleTree()

    expect(result.linksToOwnDataRemoved).toBe(1)
    expect(await db.relationships.count()).toBe(0)
    expect(await db.people.get(mine.id)).toBeDefined()
  })

  it("counts a link between two sample people as sample, not as yours", async () => {
    await loadSampleTree()
    // demo-p9 (Latha) and demo-p11 (David) are both sample people and both
    // being removed, so nothing of the reader's loses a link here.
    await addRelationship({ type: "spouse", from: "demo-p9", to: "demo-p11" })

    const result = await removeSampleTree()

    expect(result.linksToOwnDataRemoved).toBe(0)
  })

  it("removes files the reader attached to a sample person, and says how many", async () => {
    await loadSampleTree()
    await db.photos.put({
      id: "photo-1",
      blob: new Blob(["x"]),
      mime: "image/jpeg",
    })
    await db.people.update("demo-p3", {
      photoId: "photo-1",
      photoIds: ["photo-1"],
    })
    await db.attachments.put({
      id: "doc-1",
      personId: "demo-p3",
      name: "Certificate.pdf",
      mime: "application/pdf",
      blob: new Blob(["y"]),
      size: 1,
      addedAt: Date.now(),
    })

    const result = await removeSampleTree()

    expect(result.photosRemoved).toBe(1)
    expect(result.documentsRemoved).toBe(1)
    expect(await db.photos.count()).toBe(0)
    expect(await db.attachments.count()).toBe(0)
  })

  it("refuses to remove a sample person the reader made a tree's root, and says why", async () => {
    await loadSampleTree()
    const myTree = await createTree({
      name: "My branch",
      rootPersonId: "demo-p8",
    })

    const result = await removeSampleTree()

    expect(result.keptPeople).toEqual([
      {
        id: "demo-p8",
        name: "Rohan Sawant",
        reason: "still the root of your tree “My branch”",
      },
    ])
    expect(await db.people.get("demo-p8")).toBeDefined()
    expect(await db.trees.get(myTree.id)).toBeDefined()
    // Everyone else still goes.
    expect(await demoPeopleCount()).toBe(1)
  })

  it("drops the reader's own people from the sample tree without deleting them", async () => {
    await loadSampleTree()
    const mine = await createPerson({ givenName: "Aai" })
    await addPersonToTree(SAMPLE_TREE_ID, mine.id)
    const myTree = await createTree({ name: "Mine", rootPersonId: mine.id })

    await removeSampleTree()

    expect(await db.people.get(mine.id)).toBeDefined()
    expect(await db.members.get([SAMPLE_TREE_ID, mine.id])).toBeUndefined()
    expect(await db.members.get([myTree.id, mine.id])).toBeDefined()
  })
})

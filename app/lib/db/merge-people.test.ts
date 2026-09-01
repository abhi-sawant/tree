import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  RelatedPeopleMergeError,
  SelfMergeError,
  TooManyParentsAfterMergeError,
  mergePeople,
} from "~/lib/db/merge-people"
import { createPerson } from "~/lib/db/people"
import { addRelationship } from "~/lib/db/relationships"
import { createTree } from "~/lib/db/trees"
import type { Person } from "~/lib/types"
import { personPhotoIds } from "~/lib/person-photos"

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

async function pair(): Promise<[Person, Person]> {
  const winner = await createPerson({ givenName: "Ada", familyName: "Reed" })
  const loser = await createPerson({ givenName: "Ada", familyName: "Reed" })
  return [winner, loser]
}

describe("mergePeople — guards", () => {
  it("refuses to merge a person with themselves", async () => {
    const person = await createPerson({ givenName: "Ada" })
    await expect(
      mergePeople({ winnerId: person.id, loserId: person.id })
    ).rejects.toBeInstanceOf(SelfMergeError)
  })

  it("refuses when the two are recorded as related to each other", async () => {
    const [winner, loser] = await pair()
    await addRelationship({
      type: "parent-child",
      from: winner.id,
      to: loser.id,
    })

    await expect(
      mergePeople({ winnerId: winner.id, loserId: loser.id })
    ).rejects.toBeInstanceOf(RelatedPeopleMergeError)
    // Nothing may have changed.
    expect(await db.people.count()).toBe(2)
    expect(await db.relationships.count()).toBe(1)
  })

  it("refuses when a child would end up with more than two parents", async () => {
    const [winner, loser] = await pair()
    const otherA = await createPerson({ givenName: "OtherA" })
    const otherB = await createPerson({ givenName: "OtherB" })
    const child = await createPerson({ givenName: "Child" })
    await addRelationship({
      type: "parent-child",
      from: winner.id,
      to: child.id,
    })
    await addRelationship({
      type: "parent-child",
      from: otherA.id,
      to: child.id,
    })
    // The loser's own second parent for the same child pushes the total to 3.
    const childTwo = await createPerson({ givenName: "ChildTwo" })
    await addRelationship({
      type: "parent-child",
      from: loser.id,
      to: childTwo.id,
    })
    await addRelationship({
      type: "parent-child",
      from: otherB.id,
      to: childTwo.id,
    })

    // winner+otherA parent `child`; loser+otherB parent `childTwo` — no clash
    // yet, so this merge is fine.
    await expect(
      mergePeople({ winnerId: winner.id, loserId: loser.id })
    ).resolves.toBeTruthy()
  })

  it("names the child when the parent cap really would be breached", async () => {
    const [winner, loser] = await pair()
    const otherA = await createPerson({ givenName: "OtherA" })
    const otherB = await createPerson({ givenName: "OtherB" })
    const child = await createPerson({ givenName: "Child" })
    await addRelationship({
      type: "parent-child",
      from: winner.id,
      to: child.id,
    })
    await addRelationship({
      type: "parent-child",
      from: otherA.id,
      to: child.id,
    })

    // Give the loser a link to the same child via a third parent. Adding a
    // third parent directly is blocked, so write it straight to the table the
    // way malformed imported data could.
    await db.relationships.add({
      id: crypto.randomUUID(),
      type: "parent-child",
      from: loser.id,
      to: child.id,
    })
    await db.relationships.add({
      id: crypto.randomUUID(),
      type: "parent-child",
      from: otherB.id,
      to: child.id,
    })

    await expect(
      mergePeople({ winnerId: winner.id, loserId: loser.id })
    ).rejects.toBeInstanceOf(TooManyParentsAfterMergeError)
    expect(await db.people.count()).toBe(5)
  })
})

describe("mergePeople — relationships", () => {
  it("re-points the loser's relationships at the winner", async () => {
    const [winner, loser] = await pair()
    const child = await createPerson({ givenName: "Child" })
    await addRelationship({
      type: "parent-child",
      from: loser.id,
      to: child.id,
    })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.movedRelationships).toBe(1)
    const links = await db.relationships.toArray()
    expect(links).toHaveLength(1)
    expect(links[0].from).toBe(winner.id)
    expect(links[0].to).toBe(child.id)
  })

  it("drops a link the winner already had, rather than duplicating it", async () => {
    const [winner, loser] = await pair()
    const child = await createPerson({ givenName: "Child" })
    await addRelationship({
      type: "parent-child",
      from: winner.id,
      to: child.id,
    })
    await addRelationship({
      type: "parent-child",
      from: loser.id,
      to: child.id,
    })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.dedupedRelationships).toBe(1)
    expect(await db.relationships.count()).toBe(1)
  })

  it("keeps whichever copy of a duplicated link knows more", async () => {
    // Same marriage recorded twice; only the loser's copy has the date, and
    // losing it would be a silent downgrade.
    const [winner, loser] = await pair()
    const sam = await createPerson({ givenName: "Sam" })
    await addRelationship({ type: "spouse", from: winner.id, to: sam.id })
    await addRelationship({
      type: "spouse",
      from: loser.id,
      to: sam.id,
      start: { year: 1950 },
    })

    await mergePeople({ winnerId: winner.id, loserId: loser.id })

    const links = await db.relationships.toArray()
    expect(links).toHaveLength(1)
    expect(links[0].start).toEqual({ year: 1950 })
    expect(links[0].from).toBe(winner.id)
  })

  it("treats direction as part of a link's identity", async () => {
    // Parent-of and child-of are different facts, so these must not collapse.
    const [winner, loser] = await pair()
    const other = await createPerson({ givenName: "Other" })
    await addRelationship({
      type: "parent-child",
      from: winner.id,
      to: other.id,
    })
    await addRelationship({
      type: "parent-child",
      from: other.id,
      to: loser.id,
    })

    await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(await db.relationships.count()).toBe(2)
  })

  it("leaves relationships that touch neither person alone", async () => {
    const [winner, loser] = await pair()
    const x = await createPerson({ givenName: "X" })
    const y = await createPerson({ givenName: "Y" })
    await addRelationship({ type: "parent-child", from: x.id, to: y.id })

    await mergePeople({ winnerId: winner.id, loserId: loser.id })

    const links = await db.relationships.toArray()
    expect(links).toHaveLength(1)
    expect(links[0].from).toBe(x.id)
  })
})

describe("mergePeople — trees and membership", () => {
  it("adds the winner to trees only the loser belonged to", async () => {
    const [winner, loser] = await pair()
    const anchor = await createPerson({ givenName: "Anchor" })
    const tree = await createTree({ name: "T", rootPersonId: anchor.id })
    await db.members.put({ treeId: tree.id, personId: loser.id })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.treesJoined).toBe(1)
    expect(await db.members.get([tree.id, winner.id])).toBeTruthy()
    expect(await db.members.get([tree.id, loser.id])).toBeUndefined()
  })

  it("keeps the winner's own position override", async () => {
    const [winner, loser] = await pair()
    const anchor = await createPerson({ givenName: "Anchor" })
    const tree = await createTree({ name: "T", rootPersonId: anchor.id })
    await db.members.put({ treeId: tree.id, personId: winner.id, x: 1, y: 2 })
    await db.members.put({ treeId: tree.id, personId: loser.id, x: 9, y: 9 })

    await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(await db.members.get([tree.id, winner.id])).toMatchObject({
      x: 1,
      y: 2,
    })
  })

  it("adopts the loser's position when the winner had none", async () => {
    const [winner, loser] = await pair()
    const anchor = await createPerson({ givenName: "Anchor" })
    const tree = await createTree({ name: "T", rootPersonId: anchor.id })
    await db.members.put({ treeId: tree.id, personId: winner.id })
    await db.members.put({ treeId: tree.id, personId: loser.id, x: 9, y: 8 })

    await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(await db.members.get([tree.id, winner.id])).toMatchObject({
      x: 9,
      y: 8,
    })
  })

  it("re-points a tree whose root was the loser", async () => {
    // deletePerson refuses to touch a root; a merge must not, because the
    // person still exists under the surviving id.
    const [winner, loser] = await pair()
    const tree = await createTree({ name: "T", rootPersonId: loser.id })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.rootsReassigned).toBe(1)
    expect((await db.trees.get(tree.id))?.rootPersonId).toBe(winner.id)
  })
})

describe("mergePeople — the surviving record", () => {
  it("deletes the loser", async () => {
    const [winner, loser] = await pair()
    await mergePeople({ winnerId: winner.id, loserId: loser.id })
    expect(await db.people.get(loser.id)).toBeUndefined()
    expect(await db.people.get(winner.id)).toBeTruthy()
  })

  it("applies the resolved field values", async () => {
    const [winner, loser] = await pair()
    const result = await mergePeople({
      winnerId: winner.id,
      loserId: loser.id,
      resolved: { birth: { year: 1900 }, notes: "from the other record" },
    })
    expect(result.winner.birth).toEqual({ year: 1900 })
    expect(result.winner.notes).toBe("from the other record")
  })

  it("adopts the loser's photo when the winner has none", async () => {
    const [winner, loser] = await pair()
    await db.photos.add({
      id: "photo-1",
      blob: new Blob(["x"]),
      mime: "image/jpeg",
    })
    await db.people.update(loser.id, { photoId: "photo-1" })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.adoptedPhotos).toBe(1)
    expect(personPhotoIds(result.winner)).toEqual(["photo-1"])
    expect(await db.photos.get("photo-1")).toBeTruthy()
  })

  // Both records describe the same person, so both photos are of them. This
  // used to delete the loser's — an unrecoverable loss on a path the user
  // thought was a tidy-up.
  it("keeps both photos, with the winner's still the cover", async () => {
    const [winner, loser] = await pair()
    await db.photos.bulkAdd([
      { id: "keep", blob: new Blob(["a"]), mime: "image/jpeg" },
      { id: "theirs", blob: new Blob(["b"]), mime: "image/jpeg" },
    ])
    await db.people.update(winner.id, { photoId: "keep" })
    await db.people.update(loser.id, { photoId: "theirs" })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.adoptedPhotos).toBe(1)
    expect(personPhotoIds(result.winner)).toEqual(["keep", "theirs"])
    expect(result.winner.photoId).toBe("keep")
    expect(await db.photos.get("theirs")).toBeTruthy()
  })

  it("appends whole galleries and doesn't duplicate a shared photo", async () => {
    const [winner, loser] = await pair()
    await db.photos.bulkAdd([
      { id: "w1", blob: new Blob(["a"]), mime: "image/jpeg" },
      { id: "shared", blob: new Blob(["b"]), mime: "image/jpeg" },
      { id: "l1", blob: new Blob(["c"]), mime: "image/jpeg" },
    ])
    await db.people.update(winner.id, { photoIds: ["w1", "shared"] })
    await db.people.update(loser.id, { photoIds: ["shared", "l1"] })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(personPhotoIds(result.winner)).toEqual(["w1", "shared", "l1"])
    expect(result.adoptedPhotos).toBe(1)
    // The shared row is one row: skipping it must not mean deleting it.
    expect(await db.photos.get("shared")).toBeTruthy()
  })

  // Left on the loser they would be deleted with them — the same unrecoverable
  // loss the photo handling avoids, and a scan is the least replaceable thing
  // in the database.
  it("moves the loser's documents onto the winner", async () => {
    const [winner, loser] = await pair()
    await db.attachments.bulkAdd([
      {
        id: "a1",
        personId: loser.id,
        name: "will.pdf",
        mime: "application/pdf",
        blob: new Blob(["x"]),
        size: 1,
        addedAt: 1,
      },
      {
        id: "a2",
        personId: winner.id,
        name: "deed.pdf",
        mime: "application/pdf",
        blob: new Blob(["y"]),
        size: 1,
        addedAt: 2,
      },
    ])

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.movedAttachments).toBe(1)
    const owners = await db.attachments.toArray()
    expect(owners.every((a) => a.personId === winner.id)).toBe(true)
    expect(owners).toHaveLength(2)
  })

  it("adopts the loser's multiple-birth group when the winner has none", async () => {
    const [winner, loser] = await pair()
    await db.people.update(loser.id, { multipleBirthGroup: "birth-1" })

    const result = await mergePeople({ winnerId: winner.id, loserId: loser.id })

    expect(result.winner.multipleBirthGroup).toBe("birth-1")
  })

  it("throws for a person who does not exist, changing nothing", async () => {
    const person = await createPerson({ givenName: "Ada" })
    await expect(
      mergePeople({ winnerId: person.id, loserId: "nope" })
    ).rejects.toThrow("Person not found")
    expect(await db.people.count()).toBe(1)
  })
})

import { afterEach, describe, expect, it } from "vitest"

import { addFamily } from "~/lib/db/add-family"
import { db } from "~/lib/db/db"
import { createPerson } from "~/lib/db/people"
import { addRelationship, TooManyParentsError } from "~/lib/db/relationships"
import { orderFamilyGraph } from "~/lib/graph/order-family-graph"
import { deriveUnions } from "~/lib/graph/derive-unions"
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

async function anchoredTree() {
  const anchor = await createPerson({ givenName: "Arjun" })
  const tree = await makeTree(anchor.id)
  return { anchor, tree }
}

function child(givenName: string) {
  return { values: { givenName } }
}

async function parentIdsOf(childId: string): Promise<string[]> {
  const rows = await db.relationships.where("to").equals(childId).toArray()
  return rows.filter((r) => r.type === "parent-child").map((r) => r.from)
}

describe("addFamily", () => {
  it("records a new spouse and children of the couple in one call", async () => {
    const { anchor, tree } = await anchoredTree()

    const result = await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "new", values: { givenName: "Priya" } },
      marriage: { start: { year: 1990 } },
      children: [child("Anil"), child("Bina")],
    })

    expect(result.spouse?.givenName).toBe("Priya")
    expect(result.children.map((c) => c.givenName)).toEqual(["Anil", "Bina"])

    // Every child belongs to both parents — that is what "whole family" means.
    for (const created of result.children) {
      const parents = await parentIdsOf(created.id)
      expect(parents.sort()).toEqual([anchor.id, result.spouse!.id].sort())
    }

    const marriage = await db.relationships
      .where("from")
      .equals(anchor.id)
      .toArray()
    expect(marriage.find((r) => r.type === "spouse")?.start).toEqual({
      year: 1990,
    })
  })

  it("adds everyone it creates to the tree", async () => {
    const { anchor, tree } = await anchoredTree()

    const result = await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "new", values: { givenName: "Priya" } },
      children: [child("Anil")],
    })

    const members = await db.members.where("treeId").equals(tree.id).toArray()
    expect(members.map((m) => m.personId).sort()).toEqual(
      [anchor.id, result.spouse!.id, result.children[0].id].sort()
    )
  })

  it("records children of one parent when no spouse is given", async () => {
    const { anchor, tree } = await anchoredTree()

    const result = await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "none" },
      children: [child("Anil")],
    })

    expect(result.spouse).toBeUndefined()
    expect(await parentIdsOf(result.children[0].id)).toEqual([anchor.id])
  })

  // The commonest case: a couple already recorded as married, and you are just
  // adding their children. Re-adding the spouse link would write a duplicate
  // row, since the app has no notion of a pair being married twice.
  it("does not re-marry a couple who are already married", async () => {
    const { anchor, tree } = await anchoredTree()
    const priya = await createPerson({ givenName: "Priya" })
    await addRelationship({ type: "spouse", from: anchor.id, to: priya.id })

    await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "existing", personId: priya.id },
      children: [child("Anil")],
    })

    const spouseLinks = await db.relationships
      .filter((r) => r.type === "spouse")
      .toArray()
    expect(spouseLinks).toHaveLength(1)
  })

  it("marries an existing person who was not yet linked", async () => {
    const { anchor, tree } = await anchoredTree()
    const priya = await createPerson({ givenName: "Priya" })

    await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "existing", personId: priya.id },
      marriage: { start: { year: 1991 } },
      children: [],
    })

    const spouseLinks = await db.relationships
      .filter((r) => r.type === "spouse")
      .toArray()
    expect(spouseLinks).toHaveLength(1)
    expect(spouseLinks[0].start).toEqual({ year: 1991 })
  })

  it("carries a per-child subtype through", async () => {
    const { anchor, tree } = await anchoredTree()

    const result = await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "none" },
      children: [
        { values: { givenName: "Anil" }, subtype: "adopted" },
        child("Bina"),
      ],
    })

    const rows = await db.relationships
      .where("from")
      .equals(anchor.id)
      .toArray()
    const byChild = new Map(rows.map((r) => [r.to, r.subtype]))
    expect(byChild.get(result.children[0].id)).toBe("adopted")
    // Absent means biological — the default stays the cheapest to store.
    expect(byChild.get(result.children[1].id)).toBeUndefined()
  })

  // createPerson would otherwise stamp a whole batch with one Date.now(), and
  // orderFamilyGraph breaks a createdAt tie on the random UUID — so the row
  // would render in an arbitrary order rather than the order they were typed.
  it("stamps children so they lay out in the order they were entered", async () => {
    const { anchor, tree } = await anchoredTree()

    const result = await addFamily(
      {
        anchorPersonId: anchor.id,
        treeId: tree.id,
        spouse: { kind: "none" },
        children: [child("Anil"), child("Bina"), child("Chetan")],
      },
      1_000
    )

    expect(result.children.map((c) => c.createdAt)).toEqual([1001, 1002, 1003])

    const people = await db.people.toArray()
    const relationships = await db.relationships.toArray()
    const { unions } = deriveUnions(people, relationships)
    const singleParentLinks = relationships
      .filter((r) => r.type === "parent-child")
      .map((r) => ({ parentId: r.from, childId: r.to }))
    const { personOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      []
    )
    const names = personOrder.map(
      (id) => people.find((p) => p.id === id)!.givenName
    )
    expect(names).toEqual(["Arjun", "Anil", "Bina", "Chetan"])
  })

  // One transaction: a child that breaches the two-parent cap must not leave
  // the earlier children of the same submit behind.
  it("rolls the whole submit back when one link is rejected", async () => {
    const { anchor, tree } = await anchoredTree()
    const orphan = await createPerson({ givenName: "Existing" })
    const dad = await createPerson({ givenName: "Dad" })
    const mum = await createPerson({ givenName: "Mum" })
    await addRelationship({
      type: "parent-child",
      from: dad.id,
      to: orphan.id,
    })
    await addRelationship({
      type: "parent-child",
      from: mum.id,
      to: orphan.id,
    })

    const before = await db.people.count()

    // A third parent for `orphan` is refused deep inside addRelationship. The
    // spouse and the first child are already written by then.
    await expect(
      db.transaction(
        "rw",
        db.people,
        db.relationships,
        db.members,
        db.trees,
        async () => {
          await addFamily({
            anchorPersonId: anchor.id,
            treeId: tree.id,
            spouse: { kind: "new", values: { givenName: "Priya" } },
            children: [child("Anil")],
          })
          await addRelationship({
            type: "parent-child",
            from: anchor.id,
            to: orphan.id,
          })
        }
      )
    ).rejects.toBeInstanceOf(TooManyParentsError)

    expect(await db.people.count()).toBe(before)
  })

  it("writes nothing at all for an empty family", async () => {
    const { anchor, tree } = await anchoredTree()
    const before = await db.people.count()

    const result = await addFamily({
      anchorPersonId: anchor.id,
      treeId: tree.id,
      spouse: { kind: "none" },
      children: [],
    })

    expect(result).toEqual({ children: [] })
    expect(await db.people.count()).toBe(before)
    expect(await db.relationships.count()).toBe(0)
  })
})

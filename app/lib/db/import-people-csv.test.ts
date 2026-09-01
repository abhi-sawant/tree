import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import { importPeopleCsv } from "~/lib/db/import-people-csv"
import { createPerson } from "~/lib/db/people"
import { addRelationship } from "~/lib/db/relationships"
import { buildPeopleCsv } from "~/lib/export/people-csv"
import type { Tree } from "~/lib/types"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.members.clear(),
    db.trees.clear(),
  ])
})

const HEADER =
  "Id,Given name,Family name,Sex,Birth,Death,Parent 1,Parent 2,Spouses,Notes"

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\r\n")
}

async function names(): Promise<string[]> {
  return (await db.people.toArray()).map((p) => p.givenName).sort()
}

describe("importPeopleCsv", () => {
  it("creates the people in the file", async () => {
    const result = await importPeopleCsv(
      csv(",Arjun,Sawant,M,1960,,,,,Farmer", ",Priya,Iyer,F,1962,,,,,")
    )

    expect(result.created).toBe(2)
    expect(result.updated).toBe(0)
    expect(await names()).toEqual(["Arjun", "Priya"])
    const arjun = (await db.people.toArray()).find(
      (p) => p.givenName === "Arjun"
    )!
    expect(arjun).toMatchObject({
      familyName: "Sawant",
      sex: "male",
      birth: { year: 1960 },
      notes: "Farmer",
    })
  })

  it("links parents and spouses by name", async () => {
    const result = await importPeopleCsv(
      csv(
        ",Arjun,Sawant,,,,,,Priya Iyer,",
        ",Priya,Iyer,,,,,,,",
        ",Anil,Sawant,,,,Arjun Sawant,Priya Iyer,,"
      )
    )

    expect(result.linksAdded).toBe(3)
    const people = await db.people.toArray()
    const anil = people.find((p) => p.givenName === "Anil")!
    const parents = (await db.relationships.toArray())
      .filter((r) => r.type === "parent-child" && r.to === anil.id)
      .map((r) => people.find((p) => p.id === r.from)!.givenName)
      .sort()
    expect(parents).toEqual(["Arjun", "Priya"])
  })

  // A spreadsheet is not sorted in dependency order and shouldn't have to be.
  it("resolves a parent listed further down the file", async () => {
    const result = await importPeopleCsv(
      csv(",Anil,Sawant,,,,Arjun Sawant,,,", ",Arjun,Sawant,,,,,,,")
    )
    expect(result.linksAdded).toBe(1)
    expect(result.problems).toEqual([])
  })

  it("updates a person matched by id instead of duplicating them", async () => {
    const existing = await createPerson({ givenName: "Arjun" })
    const result = await importPeopleCsv(
      csv(`${existing.id},Arjun,Sawant,,1960,,,,,`)
    )

    expect(result.created).toBe(0)
    expect(result.updated).toBe(1)
    expect(await db.people.count()).toBe(1)
    expect((await db.people.get(existing.id))!.familyName).toBe("Sawant")
  })

  // What a CSV exported from another browser looks like.
  it("treats an unknown id as a new person rather than refusing the row", async () => {
    const result = await importPeopleCsv(
      csv("not-an-id-here,Arjun,Sawant,,,,,,,")
    )
    expect(result.created).toBe(1)
    expect(result.problems).toEqual([])
  })

  it("links to people already in the database", async () => {
    const arjun = await createPerson({
      givenName: "Arjun",
      familyName: "Sawant",
    })
    const result = await importPeopleCsv(csv(",Anil,Sawant,,,,Arjun Sawant,,,"))

    expect(result.linksAdded).toBe(1)
    const links = await db.relationships.toArray()
    expect(links[0].from).toBe(arjun.id)
  })

  // Re-importing the same sheet is a normal thing to do after editing one cell.
  it("is a no-op the second time the same file is imported", async () => {
    const file = csv(
      ",Arjun,Sawant,,,,,,Priya Iyer,",
      ",Priya,Iyer,,,,,,,",
      ",Anil,Sawant,,,,Arjun Sawant,Priya Iyer,,"
    )
    await importPeopleCsv(file)
    const exported = buildPeopleCsv({
      people: await db.people.toArray(),
      relationships: await db.relationships.toArray(),
    })

    const second = await importPeopleCsv(exported)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(3)
    expect(second.linksAdded).toBe(0)
    expect(await db.relationships.count()).toBe(3)
  })

  it("reports a reference that matches nobody, and keeps the person", async () => {
    const result = await importPeopleCsv(
      csv(",Anil,Sawant,,,,Nobody At All,,,")
    )
    expect(result.created).toBe(1)
    expect(result.linksAdded).toBe(0)
    expect(result.problems[0]).toContain("Nobody At All")
  })

  // "Not found" and "several people have that name" need different answers:
  // one is a typo, the other is a disambiguation only the reader can make.
  it("refuses an ambiguous reference rather than picking one", async () => {
    await createPerson({ givenName: "Arjun", familyName: "Sawant" })
    await createPerson({ givenName: "Arjun", familyName: "Sawant" })

    const result = await importPeopleCsv(csv(",Anil,Sawant,,,,Arjun Sawant,,,"))
    expect(result.linksAdded).toBe(0)
    expect(result.problems[0]).toContain("more than one person")
  })

  it("reports a third parent and imports everything else", async () => {
    const child = await createPerson({ givenName: "Anil", familyName: "S" })
    const dad = await createPerson({ givenName: "Dad", familyName: "S" })
    const mum = await createPerson({ givenName: "Mum", familyName: "S" })
    await addRelationship({
      type: "parent-child",
      from: dad.id,
      to: child.id,
    })
    await addRelationship({
      type: "parent-child",
      from: mum.id,
      to: child.id,
    })

    const result = await importPeopleCsv(
      csv(",Third,S,,,,,,,", `${child.id},Anil,S,,,,Third S,,,`)
    )
    expect(result.created).toBe(1)
    expect(result.problems[0]).toContain("already has 2 parents")
  })

  it("reports a link that would close a cycle", async () => {
    const gran = await createPerson({ givenName: "Gran", familyName: "S" })
    const kid = await createPerson({ givenName: "Kid", familyName: "S" })
    await addRelationship({ type: "parent-child", from: gran.id, to: kid.id })

    const result = await importPeopleCsv(csv(`${gran.id},Gran,S,,,,Kid S,,,`))
    expect(result.problems.some((p) => p.includes("cycle"))).toBe(true)
  })

  it("reports someone listed as their own parent", async () => {
    const result = await importPeopleCsv(
      csv(",Arjun,Sawant,,,,Arjun Sawant,,,")
    )
    expect(result.problems.some((p) => p.includes("their own"))).toBe(true)
    expect(await db.relationships.count()).toBe(0)
  })

  it("adds new people to the tree it was given", async () => {
    const root = await createPerson({ givenName: "Root" })
    const tree: Tree = {
      id: "t1",
      name: "T",
      rootPersonId: root.id,
      createdAt: 0,
    }
    await db.trees.add(tree)
    await db.members.put({ treeId: tree.id, personId: root.id })

    await importPeopleCsv(csv(",Arjun,Sawant,,,,,,,"), { treeId: tree.id })
    const members = await db.members.where("treeId").equals(tree.id).toArray()
    expect(members).toHaveLength(2)
  })

  it("carries the parse problems through alongside the import ones", async () => {
    const result = await importPeopleCsv(
      csv(",,Sawant,,,,,,,", ",Arjun,Sawant,,sometime,,,,,")
    )
    expect(result.created).toBe(1)
    expect(result.problems).toHaveLength(2)
  })
})

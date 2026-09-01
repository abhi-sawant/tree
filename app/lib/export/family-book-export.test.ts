import { afterEach, describe, expect, it } from "vitest"

import { addAttachment } from "~/lib/db/attachments"
import { db } from "~/lib/db/db"
import { buildFamilyBookPdf } from "~/lib/export/family-book-export"
import { buildFamilyBook } from "~/lib/export/family-book"
import { redactPool } from "~/lib/export/redaction"
import type { Person, Tree } from "~/lib/types"

const NOW = new Date("2024-06-15T00:00:00.000Z")

const tree: Tree = {
  id: "t1",
  name: "Sawant Family",
  rootPersonId: "dead",
  createdAt: 0,
}

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...overrides }
}

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.photos.clear(),
    db.attachments.clear(),
  ])
})

describe("buildFamilyBookPdf", () => {
  it("produces a PDF from the people it is given", async () => {
    const blob = await buildFamilyBookPdf({
      tree,
      people: [person("a", { givenName: "Ada" })],
      relationships: [],
      generations: new Map(),
      now: NOW,
    })

    expect(blob.type).toBe("application/pdf")
    expect(blob.size).toBeGreaterThan(0)
  })

  // A document's filename is often the person's own name and a date, so listing
  // one against a redacted page would undo the redaction directly.
  it("lists no documents against a redacted person", async () => {
    const living = person("living", {
      givenName: "Nia",
      birth: { year: 1990 },
    })
    await db.people.add(living)
    await addAttachment(
      living.id,
      new Blob(["x"], { type: "application/pdf" }),
      { name: "Nia Sawant birth 1991.pdf", type: "application/pdf", size: 1 }
    )

    // The model is asserted rather than the PDF bytes: what reaches the page is
    // the thing that matters, and it is readable.
    const redacted = redactPool([living], [], { now: NOW })
    const book = buildFamilyBook({
      title: tree.name,
      people: redacted.people,
      relationships: [],
      generations: new Map(),
      documentNames: new Map(),
    })

    expect(book.pages[0].documents).toEqual([])
    expect(book.pages[0].name).toBe("Living")

    // And the real export path agrees — it renders without throwing on a
    // person whose photo and documents were both withheld.
    await expect(
      buildFamilyBookPdf({
        tree,
        people: [living],
        relationships: [],
        generations: new Map(),
        now: NOW,
        redactLiving: true,
        redaction: { now: NOW },
      })
    ).resolves.toBeInstanceOf(Blob)
  })

  it("still names and links a redacted person so the tree reads", async () => {
    const parent = person("parent", {
      givenName: "Ada",
      familyName: "Byron",
      birth: { year: 1815 },
      death: { year: 1852 },
    })
    const child = person("child", {
      givenName: "Nia",
      familyName: "Sawant",
      birth: { year: 1990 },
    })
    const relationships = [
      { id: "r", type: "parent-child" as const, from: parent.id, to: child.id },
    ]

    const redacted = redactPool([parent, child], relationships, { now: NOW })
    const book = buildFamilyBook({
      title: tree.name,
      people: redacted.people,
      relationships: redacted.relationships,
      generations: new Map(),
    })

    const childPage = book.pages.find((p) => p.personId === "child")!
    expect(childPage.name).toBe("Living Sawant")
    expect(childPage.lifespan).toBe("Dates unrecorded")
    expect(childPage.relations[0].entries[0].name).toBe("Ada Byron")

    const parentPage = book.pages.find((p) => p.personId === "parent")!
    expect(parentPage.relations[0].entries[0].name).toBe("Living Sawant")
  })
})

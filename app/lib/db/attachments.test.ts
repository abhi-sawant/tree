import { afterEach, describe, expect, it } from "vitest"

import {
  AttachmentRejectedError,
  addAttachment,
  deleteAttachment,
  deleteAttachmentsForPerson,
  listAttachments,
  readAttachmentSizes,
  renameAttachment,
} from "~/lib/db/attachments"
import { db } from "~/lib/db/db"
import { createPerson, deletePerson } from "~/lib/db/people"

afterEach(async () => {
  await Promise.all([db.people.clear(), db.attachments.clear()])
})

function pdf(name = "certificate.pdf", bytes = "x") {
  return {
    blob: new Blob([bytes], { type: "application/pdf" }),
    candidate: { name, type: "application/pdf", size: bytes.length },
  }
}

describe("addAttachment", () => {
  it("stores the file against the person, with its size denormalised", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const { blob, candidate } = pdf()

    const stored = await addAttachment(person.id, blob, candidate, { now: 5 })

    expect(stored).toMatchObject({
      personId: person.id,
      name: "certificate.pdf",
      mime: "application/pdf",
      addedAt: 5,
    })
    expect(stored.size).toBe(blob.size)
    expect(await db.attachments.count()).toBe(1)
  })

  // Stored resolved rather than as reported, or a file the browser typed as ""
  // would come back out of a backup as an unopenable blob.
  it("resolves a blank reported type from the filename", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const stored = await addAttachment(person.id, new Blob(["x"]), {
      name: "scan.PNG",
      type: "",
      size: 1,
    })

    expect(stored.mime).toBe("image/png")
  })

  it("refuses a file that isn't a PDF or an image, and stores nothing", async () => {
    const person = await createPerson({ givenName: "Ada" })

    await expect(
      addAttachment(person.id, new Blob(["x"]), {
        name: "clip.mp4",
        type: "video/mp4",
        size: 1,
      })
    ).rejects.toBeInstanceOf(AttachmentRejectedError)
    expect(await db.attachments.count()).toBe(0)
  })

  it("refuses a file over the size limit", async () => {
    const person = await createPerson({ givenName: "Ada" })

    await expect(
      addAttachment(
        person.id,
        new Blob(["xxxx"]),
        { name: "big.pdf", type: "application/pdf", size: 4 },
        { maxBytes: 2 }
      )
    ).rejects.toBeInstanceOf(AttachmentRejectedError)
  })

  it("refuses to file a document against a person who doesn't exist", async () => {
    const { blob, candidate } = pdf()

    await expect(addAttachment("nobody", blob, candidate)).rejects.toThrow(
      /not found/i
    )
    expect(await db.attachments.count()).toBe(0)
  })
})

describe("listAttachments", () => {
  it("returns only this person's, oldest first", async () => {
    const [ada, grace] = await Promise.all([
      createPerson({ givenName: "Ada" }),
      createPerson({ givenName: "Grace" }),
    ])
    await addAttachment(ada.id, pdf("b.pdf").blob, pdf("b.pdf").candidate, {
      now: 20,
    })
    await addAttachment(ada.id, pdf("a.pdf").blob, pdf("a.pdf").candidate, {
      now: 10,
    })
    await addAttachment(grace.id, pdf("c.pdf").blob, pdf("c.pdf").candidate, {
      now: 15,
    })

    expect((await listAttachments(ada.id)).map((a) => a.name)).toEqual([
      "a.pdf",
      "b.pdf",
    ])
  })
})

describe("renameAttachment", () => {
  it("trims and saves a new name", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const { blob, candidate } = pdf()
    const stored = await addAttachment(person.id, blob, candidate)

    await renameAttachment(stored.id, "  Birth certificate  ")

    expect((await db.attachments.get(stored.id))?.name).toBe(
      "Birth certificate"
    )
  })

  // A blank name leaves a row nothing identifies and no sensible download
  // filename, so the old one is kept rather than accepted.
  it("keeps the old name rather than accepting a blank one", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const { blob, candidate } = pdf()
    const stored = await addAttachment(person.id, blob, candidate)

    await renameAttachment(stored.id, "   ")

    expect((await db.attachments.get(stored.id))?.name).toBe("certificate.pdf")
  })
})

describe("deleting", () => {
  it("removes one file", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const { blob, candidate } = pdf()
    const stored = await addAttachment(person.id, blob, candidate)

    await deleteAttachment(stored.id)

    expect(await db.attachments.count()).toBe(0)
  })

  it("removes every file of one person and leaves the others", async () => {
    const [ada, grace] = await Promise.all([
      createPerson({ givenName: "Ada" }),
      createPerson({ givenName: "Grace" }),
    ])
    await addAttachment(ada.id, pdf().blob, pdf().candidate)
    await addAttachment(ada.id, pdf("two.pdf").blob, pdf("two.pdf").candidate)
    await addAttachment(grace.id, pdf().blob, pdf().candidate)

    expect(await deleteAttachmentsForPerson(ada.id)).toBe(2)
    expect(await db.attachments.count()).toBe(1)
  })

  // An attachment row names its owner, so one left behind is unreachable from
  // anywhere in the UI — bytes nothing can open and nothing can delete.
  it("is cascaded by deletePerson", async () => {
    const person = await createPerson({ givenName: "Ada" })
    await addAttachment(person.id, pdf().blob, pdf().candidate)

    await deletePerson(person.id)

    expect(await db.attachments.count()).toBe(0)
  })
})

describe("readAttachmentSizes", () => {
  it("reports the fields the storage panel needs, without the blobs", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const { blob, candidate } = pdf("will.pdf", "abcd")
    await addAttachment(person.id, blob, candidate)

    const sizes = await readAttachmentSizes()

    expect(sizes).toEqual([
      {
        id: expect.any(String),
        personId: person.id,
        name: "will.pdf",
        mime: "application/pdf",
        size: 4,
      },
    ])
  })
})

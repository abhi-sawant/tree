import { describe, expect, it } from "vitest"

import {
  attachmentProblem,
  extensionOf,
  isAcceptedAttachmentMime,
  isPdfAttachment,
  MAX_ATTACHMENT_BYTES,
  resolveAttachmentMime,
} from "~/lib/attachments"

describe("extensionOf", () => {
  it("reads the last extension, lowercased", () => {
    expect(extensionOf("Scan.Final.PDF")).toBe("pdf")
  })

  it("answers empty for a name with no usable extension", () => {
    expect(extensionOf("scan")).toBe("")
    expect(extensionOf("scan.")).toBe("")
    // A dotfile's leading dot is not an extension.
    expect(extensionOf(".gitignore")).toBe("")
  })
})

describe("resolveAttachmentMime", () => {
  it("uses what the browser reported, without its parameters", () => {
    expect(
      resolveAttachmentMime("a.pdf", "application/pdf; charset=binary")
    ).toBe("application/pdf")
  })

  // Some file managers report nothing for a dragged file. That is not the
  // user's mistake, so it is guessed from the name rather than refused.
  it("falls back to the extension when the browser reports nothing", () => {
    expect(resolveAttachmentMime("certificate.pdf", "")).toBe("application/pdf")
    expect(resolveAttachmentMime("scan.JPEG", "")).toBe("image/jpeg")
  })

  it("gives up rather than guessing on an unknown extension", () => {
    expect(resolveAttachmentMime("notes.xyz", "")).toBe("")
  })
})

describe("isAcceptedAttachmentMime", () => {
  it("accepts PDFs and any image", () => {
    expect(isAcceptedAttachmentMime("application/pdf")).toBe(true)
    expect(isAcceptedAttachmentMime("image/tiff")).toBe(true)
  })

  it("rejects everything else", () => {
    for (const mime of ["video/mp4", "application/zip", "text/plain", ""]) {
      expect(isAcceptedAttachmentMime(mime)).toBe(false)
    }
  })
})

describe("attachmentProblem", () => {
  const ok = { name: "certificate.pdf", type: "application/pdf", size: 1000 }

  it("passes a PDF within the limit", () => {
    expect(attachmentProblem(ok)).toBeUndefined()
  })

  it("passes an image whose type the browser didn't report", () => {
    expect(
      attachmentProblem({ name: "scan.jpg", type: "", size: 1000 })
    ).toBeUndefined()
  })

  // Every message names the file and says what was wrong with it: the panel
  // shows these verbatim, and a refusal the reader can't act on is barely
  // better than a silent one.
  it("names the file and the reason for a wrong type", () => {
    const problem = attachmentProblem({
      name: "holiday.mp4",
      type: "video/mp4",
      size: 1000,
    })
    expect(problem).toContain("holiday.mp4")
    expect(problem).toContain("PDF or an image")
  })

  it("names the size and the limit when a file is too large", () => {
    const problem = attachmentProblem({
      ...ok,
      size: MAX_ATTACHMENT_BYTES + 1,
    })
    expect(problem).toContain("certificate.pdf")
    expect(problem).toContain("25.0 MB")
  })

  it("passes a file exactly at the limit", () => {
    expect(
      attachmentProblem({ ...ok, size: MAX_ATTACHMENT_BYTES })
    ).toBeUndefined()
  })

  // Almost always a failed copy or truncated download. Stored, it would be a
  // row in the list that downloads to nothing.
  it("refuses an empty file", () => {
    expect(attachmentProblem({ ...ok, size: 0 })).toContain("is empty")
  })

  it("takes the limit as an argument so a caller can be stricter", () => {
    expect(attachmentProblem(ok, 100)).toContain("over the")
  })
})

describe("isPdfAttachment", () => {
  it("distinguishes a PDF from an image", () => {
    expect(isPdfAttachment("application/pdf")).toBe(true)
    expect(isPdfAttachment("image/jpeg")).toBe(false)
  })
})

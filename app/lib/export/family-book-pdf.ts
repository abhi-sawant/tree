import { jsPDF } from "jspdf"

import type { BookPage, FamilyBook } from "~/lib/export/family-book"

// Turns the page model into paper. Everything about *what* is on a page is
// decided in family-book.ts; this file decides where on the sheet it goes and
// what number that sheet is — which is why the content is testable without
// rendering a PDF, and the numbering is testable without asserting on layout.

const MARGIN = 18
const PAGE_WIDTH = 210 // A4 portrait, mm
const PAGE_HEIGHT = 297
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const PHOTO_SIZE = 46
const LINE = 5
const FOOTER_Y = PAGE_HEIGHT - 10
const BODY_BOTTOM = FOOTER_Y - 12

// How many names fit in the contents at one per line.
export const CONTENTS_ENTRIES_PER_PAGE = 44

export interface FamilyBookPdfInput {
  book: FamilyBook
  generatedDate: Date
  // Cover photos as data URLs, by photo id. Absent means the page is laid out
  // without a picture rather than with a placeholder: a book of blank grey
  // squares reads as a printing fault, not as missing data.
  photoDataUrls?: ReadonlyMap<string, string>
  // Stated on the title page when the book was redacted, so a reader can never
  // mistake a run of "Living" entries for missing records.
  redactionNote?: string
}

// Where each person ended up, once everything was laid out. This is the whole
// reason the renderer owns numbering: a person whose note runs long takes two
// sheets, and every page after them moves.
export interface ContentsEntry {
  personId: string
  name: string
  pageNumber: number
}

export function contentsPageCountFor(peopleCount: number): number {
  return Math.max(1, Math.ceil(peopleCount / CONTENTS_ENTRIES_PER_PAGE))
}

export function renderFamilyBookPdf(input: FamilyBookPdfInput): Blob {
  return renderFamilyBook(input).blob
}

export interface RenderedFamilyBook {
  blob: Blob
  contents: ContentsEntry[]
  totalPages: number
}

// Laid out back to front: the person pages are rendered first, because how many
// sheets they take is not knowable until they are on paper. The title and
// contents are then inserted in front of them, at which point every page number
// is already settled.
export function renderFamilyBook(
  input: FamilyBookPdfInput
): RenderedFamilyBook {
  const { book } = input
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })

  // jsPDF starts with one blank page, which becomes the first person's.
  const startedAt: number[] = []
  book.pages.forEach((page, index) => {
    if (index > 0) doc.addPage()
    startedAt.push(doc.getNumberOfPages())
    drawPersonPage(doc, page, input)
  })

  const frontCount = 1 + contentsPageCountFor(book.pages.length)
  // Inserted at 1, 2, 3… rather than at 1 repeatedly, which would stack them
  // in reverse.
  for (let i = 1; i <= frontCount; i++) doc.insertPage(i)

  // jsPDF starts every document with a blank page. With nobody in the book
  // nothing claimed it, and it would otherwise ship as a blank final sheet.
  if (book.pages.length === 0) doc.deletePage(doc.getNumberOfPages())

  const contents: ContentsEntry[] = book.pages.map((page, index) => ({
    personId: page.personId,
    name: page.name,
    pageNumber: startedAt[index] + frontCount,
  }))

  doc.setPage(1)
  drawTitlePage(doc, input)
  drawContents(doc, contents, frontCount)

  // Every page but the title gets its footer here, in one pass over what was
  // actually produced — including the continuation sheets, which nothing else
  // knows the number of.
  for (let page = 2; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page)
    drawFooter(doc, page, book.title)
  }

  return {
    blob: doc.output("blob"),
    contents,
    totalPages: doc.getNumberOfPages(),
  }
}

function drawFooter(doc: jsPDF, page: number, title: string) {
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(140)
  doc.text(title, MARGIN, FOOTER_Y)
  doc.text(String(page), PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" })
  doc.setTextColor(0)
}

function drawTitlePage(doc: jsPDF, input: FamilyBookPdfInput) {
  const { book, generatedDate } = input
  doc.setFont("helvetica", "bold")
  doc.setFontSize(28)
  doc.text(doc.splitTextToSize(book.title, CONTENT_WIDTH), MARGIN, 80)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.setTextColor(90)
  const lines = [
    `${book.pages.length} ${book.pages.length === 1 ? "person" : "people"}, a page each`,
    `Generated ${generatedDate.toLocaleDateString()}`,
  ]
  if (book.bareCount > 0) {
    // Said here rather than left to be discovered forty pages in.
    lines.push(
      book.bareCount === 1
        ? "1 page carries only a name — nothing else is recorded yet"
        : `${book.bareCount} pages carry only a name — nothing else is recorded yet`
    )
  }
  if (input.redactionNote) lines.push(input.redactionNote)
  doc.text(lines, MARGIN, 96)
  doc.setTextColor(0)
}

function drawContents(
  doc: jsPDF,
  contents: ContentsEntry[],
  frontCount: number
) {
  const pageCount = frontCount - 1
  for (let index = 0; index < pageCount; index++) {
    doc.setPage(2 + index)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text(
      index === 0 ? "Contents" : "Contents (continued)",
      MARGIN,
      MARGIN + 6
    )

    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    let y = MARGIN + 18
    const slice = contents.slice(
      index * CONTENTS_ENTRIES_PER_PAGE,
      (index + 1) * CONTENTS_ENTRIES_PER_PAGE
    )
    for (const entry of slice) {
      doc.text(entry.name, MARGIN, y)
      doc.text(String(entry.pageNumber), PAGE_WIDTH - MARGIN, y, {
        align: "right",
      })
      y += LINE
    }
  }
}

// Draws a block of lines, breaking to a continuation sheet when it runs out of
// room. A page per person is the shape of the book, not a hard limit: someone
// with a long note and thirty children gets a second sheet rather than having
// their life silently truncated at the bottom margin.
function flow(doc: jsPDF, lines: string[], y: number, page: BookPage): number {
  let cursor = y
  for (const line of lines) {
    if (cursor > BODY_BOTTOM) {
      doc.addPage()
      doc.setFont("helvetica", "italic")
      doc.setFontSize(9)
      doc.setTextColor(140)
      doc.text(`${page.name}, continued`, MARGIN, MARGIN + 4)
      doc.setTextColor(0)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      cursor = MARGIN + 14
    }
    doc.text(line, MARGIN, cursor)
    cursor += LINE
  }
  return cursor
}

function heading(doc: jsPDF, text: string, y: number, page: BookPage): number {
  // Routed through flow so a heading landing at the very bottom moves to the
  // continuation sheet with the lines it introduces, rather than stranding
  // itself above a page break.
  const cursor = flow(doc, [""], y, page) - LINE
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(text.toUpperCase(), MARGIN, cursor)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  return cursor + LINE + 1
}

function drawPersonPage(doc: jsPDF, page: BookPage, input: FamilyBookPdfInput) {
  const photo = page.coverPhotoId
    ? input.photoDataUrls?.get(page.coverPhotoId)
    : undefined
  const headerLeft = photo ? MARGIN + PHOTO_SIZE + 8 : MARGIN
  const headerWidth = PAGE_WIDTH - MARGIN - headerLeft

  if (photo) {
    try {
      doc.addImage(photo, MARGIN, MARGIN, PHOTO_SIZE, PHOTO_SIZE)
    } catch {
      // A photo jsPDF can't decode must not take the whole book down with it.
      // The page simply prints without it.
    }
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text(doc.splitTextToSize(page.name, headerWidth), headerLeft, MARGIN + 8)

  let y = MARGIN + 16
  if (page.alsoKnownAs) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(10)
    doc.setTextColor(110)
    doc.text(page.alsoKnownAs, headerLeft, y)
    doc.setTextColor(0)
    y += LINE
  }
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.text(page.lifespan, headerLeft, y)

  // Below the photo or below the header, whichever is lower, so neither
  // overlaps the other.
  let cursor = Math.max(y + 10, photo ? MARGIN + PHOTO_SIZE + 10 : y + 10)
  doc.setFontSize(10)

  if (page.facts.length > 0) {
    cursor = heading(doc, "Details", cursor, page)
    cursor =
      flow(
        doc,
        page.facts.map((fact) => `${fact.label}: ${fact.value}`),
        cursor,
        page
      ) + 3
  }

  for (const group of page.relations) {
    cursor = heading(doc, group.heading, cursor, page)
    cursor =
      flow(
        doc,
        group.entries.map((entry) =>
          entry.detail ? `${entry.name} (${entry.detail})` : entry.name
        ),
        cursor,
        page
      ) + 3
  }

  if (page.notes.length > 0) {
    cursor = heading(doc, "Notes", cursor, page)
    cursor =
      flow(
        doc,
        page.notes.flatMap((line) =>
          line ? (doc.splitTextToSize(line, CONTENT_WIDTH) as string[]) : [""]
        ),
        cursor,
        page
      ) + 3
  }

  if (page.documents.length > 0) {
    cursor = heading(doc, "Documents held", cursor, page)
    flow(doc, page.documents, cursor, page)
  }
}

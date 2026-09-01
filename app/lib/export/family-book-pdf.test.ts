import { describe, expect, it } from "vitest"

import { buildFamilyBook } from "~/lib/export/family-book"
import {
  CONTENTS_ENTRIES_PER_PAGE,
  contentsPageCountFor,
  renderFamilyBook,
  toPdfText,
} from "~/lib/export/family-book-pdf"
import type { Person } from "~/lib/types"

const GENERATED = new Date("2024-06-01T00:00:00.000Z")

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...overrides }
}

function render(people: Person[]) {
  return renderFamilyBook({
    book: buildFamilyBook({
      title: "Sawant Family",
      people,
      relationships: [],
      generations: new Map(),
    }),
    generatedDate: GENERATED,
  })
}

describe("contentsPageCountFor", () => {
  it("is one page for an empty or small book", () => {
    expect(contentsPageCountFor(0)).toBe(1)
    expect(contentsPageCountFor(1)).toBe(1)
    expect(contentsPageCountFor(CONTENTS_ENTRIES_PER_PAGE)).toBe(1)
  })

  it("grows by one for each page's worth of names", () => {
    expect(contentsPageCountFor(CONTENTS_ENTRIES_PER_PAGE + 1)).toBe(2)
    expect(contentsPageCountFor(CONTENTS_ENTRIES_PER_PAGE * 3)).toBe(3)
  })
})

describe("renderFamilyBook", () => {
  it("produces a PDF", async () => {
    const { blob } = render([person("a")])

    expect(blob.type).toBe("application/pdf")
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
    expect([...head]).toEqual([0x25, 0x50, 0x44, 0x46]) // "%PDF"
  })

  it("numbers people after the title page and the contents", () => {
    const { contents, totalPages } = render([
      person("a"),
      person("b"),
      person("c"),
    ])

    // 1 title + 1 contents + 3 people.
    expect(contents.map((entry) => entry.pageNumber)).toEqual([3, 4, 5])
    expect(totalPages).toBe(5)
  })

  it("shifts everyone along when the contents needs a second page", () => {
    const people = Array.from(
      { length: CONTENTS_ENTRIES_PER_PAGE + 1 },
      (_, i) => person(`p${String(i).padStart(3, "0")}`)
    )

    const { contents } = render(people)

    // 1 title + 2 contents.
    expect(contents[0].pageNumber).toBe(4)
    expect(contents.at(-1)?.pageNumber).toBe(4 + people.length - 1)
  })

  // The reason numbering lives in the renderer at all: a page that spills onto
  // a second sheet moves every page after it, and a contents built from the
  // content model alone would then point at the wrong pages.
  it("keeps the contents correct when a long page overflows", () => {
    const longNote = Array.from({ length: 90 }, (_, i) => `Line ${i}`).join(
      "\n\n"
    )
    const { contents, totalPages } = render([
      person("a", { notes: longNote }),
      person("b"),
    ])

    expect(contents[0].pageNumber).toBe(3)
    // b starts after however many sheets a took — strictly more than one.
    expect(contents[1].pageNumber).toBeGreaterThan(4)
    expect(totalPages).toBe(contents[1].pageNumber)
  })

  it("lists every person in the contents, in book order", () => {
    const { contents } = render([
      person("second", { givenName: "Bea", birth: { year: 1950 } }),
      person("first", { givenName: "Ada", birth: { year: 1900 } }),
    ])

    expect(contents.map((entry) => entry.name)).toEqual(["Ada", "Bea"])
  })

  it("renders a title page and contents even with nobody in the book", () => {
    const { contents, totalPages } = render([])

    expect(contents).toEqual([])
    expect(totalPages).toBe(2)
  })

  // A photo jsPDF can't decode must not take the whole book down with it.
  it("still renders when a photo can't be decoded", () => {
    const book = buildFamilyBook({
      title: "T",
      people: [person("a", { photoId: "broken" })],
      relationships: [],
      generations: new Map(),
    })

    expect(() =>
      renderFamilyBook({
        book,
        generatedDate: GENERATED,
        photoDataUrls: new Map([["broken", "data:image/png;base64,!!!"]]),
      })
    ).not.toThrow()
  })
})

// jsPDF's standard fonts encode to WinAnsi and drop what they can't encode,
// silently. Unmapped, "1915–1990" reaches the page as "19151990" — one
// meaningless number — and a bulleted note loses its bullets.
describe("toPdfText", () => {
  it("keeps a lifespan's dash visible", () => {
    expect(toPdfText("1915\u20131990")).toBe("1915-1990")
  })

  it("keeps a note's bullets visible", () => {
    expect(toPdfText("\u2022 moved 1935")).toBe("- moved 1935")
  })

  it("substitutes typographic quotes, dashes and ellipses", () => {
    expect(toPdfText("\u201cAddy\u201d")).toBe('"Addy"')
    expect(toPdfText("\u2018a\u2019")).toBe("'a'")
    expect(toPdfText("a\u2014b")).toBe("a-b")
    expect(toPdfText("more\u2026")).toBe("more...")
    expect(toPdfText("a\u00a0b")).toBe("a b")
  })

  it("leaves Latin-1 accents alone — the standard fonts draw those", () => {
    expect(toPdfText("née Iyer")).toBe("née Iyer")
  })
})

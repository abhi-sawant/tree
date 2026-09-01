import { describe, expect, it } from "vitest"

import { parseInline, parseNotes, wikiLinkNames } from "~/lib/notes/markdown"

describe("parseInline", () => {
  it("reads plain text as one node", () => {
    expect(parseInline("just words")).toEqual([
      { kind: "text", text: "just words" },
    ])
  })

  it("reads bold, italic and code", () => {
    expect(parseInline("**loud**")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "loud" }] },
    ])
    expect(parseInline("*soft*")).toEqual([
      { kind: "em", children: [{ kind: "text", text: "soft" }] },
    ])
    expect(parseInline("`code`")).toEqual([{ kind: "code", text: "code" }])
  })

  // "**bold**" must not be read as an empty italic wrapping "*bold*".
  it("prefers bold over italic for a doubled marker", () => {
    expect(parseInline("a **b** c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " c" },
    ])
  })

  it("reads a wiki link and trims the name", () => {
    expect(parseInline("see [[ Arjun Sawant ]] here")).toEqual([
      { kind: "text", text: "see " },
      { kind: "person", name: "Arjun Sawant" },
      { kind: "text", text: " here" },
    ])
  })

  // Whichever marker comes first wins, so text comes out in the order written.
  it("keeps mixed markers in the order they were written", () => {
    const nodes = parseInline("`x` then *y*")
    expect(nodes.map((n) => n.kind)).toEqual(["code", "text", "em"])
    const reversed = parseInline("*y* then `x`")
    expect(reversed.map((n) => n.kind)).toEqual(["em", "text", "code"])
  })

  it("nests markers inside bold", () => {
    expect(parseInline("**see [[Ada]]**")).toEqual([
      {
        kind: "strong",
        children: [
          { kind: "text", text: "see " },
          { kind: "person", name: "Ada" },
        ],
      },
    ])
  })

  // The whole point of returning data rather than an HTML string: markup in a
  // note is text, the way whoever typed it meant it.
  it("treats anything that looks like HTML as plain text", () => {
    expect(parseInline('<img onerror="x">')).toEqual([
      { kind: "text", text: '<img onerror="x">' },
    ])
  })

  it("leaves an unclosed marker alone", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([
      { kind: "text", text: "2 * 3 = 6" },
    ])
    expect(parseInline("[[unclosed")).toEqual([
      { kind: "text", text: "[[unclosed" },
    ])
  })
})

describe("parseNotes", () => {
  it("reads a paragraph", () => {
    expect(parseNotes("Hello there.")).toEqual([
      { kind: "paragraph", children: [{ kind: "text", text: "Hello there." }] },
    ])
  })

  // A sentence soft-wrapped across two lines is one sentence.
  it("joins consecutive lines into one paragraph", () => {
    const blocks = parseNotes("one line\nand another")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      kind: "paragraph",
      children: [{ kind: "text", text: "one line and another" }],
    })
  })

  it("splits paragraphs on a blank line", () => {
    expect(parseNotes("first\n\nsecond")).toHaveLength(2)
  })

  it("reads headings at three levels", () => {
    const blocks = parseNotes("# One\n## Two\n### Three")
    expect(blocks.map((b) => b.kind === "heading" && b.level)).toEqual([
      1, 2, 3,
    ])
  })

  it("reads a bulleted list with any of the three markers", () => {
    const blocks = parseNotes("- a\n* b\n+ c")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false })
    expect(blocks[0].kind === "list" && blocks[0].items).toHaveLength(3)
  })

  it("reads a numbered list", () => {
    const blocks = parseNotes("1. a\n2) b")
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: true })
  })

  // A numbered list following a bulleted one is two lists, not one that
  // changes its mind halfway down.
  it("starts a new list when the marker changes", () => {
    const blocks = parseNotes("- a\n1. b")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ ordered: false })
    expect(blocks[1]).toMatchObject({ ordered: true })
  })

  it("ends a list at a blank line and at a paragraph", () => {
    expect(parseNotes("- a\n\nprose")).toHaveLength(2)
    expect(parseNotes("- a\nprose")).toHaveLength(2)
  })

  it("parses inline markup inside list items and headings", () => {
    const blocks = parseNotes("# See [[Ada]]\n- with **Bob**")
    expect(blocks[0]).toMatchObject({
      kind: "heading",
      children: [
        { kind: "text", text: "See " },
        { kind: "person", name: "Ada" },
      ],
    })
    expect(blocks[1].kind === "list" && blocks[1].items[0][1]).toMatchObject({
      kind: "strong",
    })
  })

  it("handles CRLF and bare CR the same as LF", () => {
    expect(parseNotes("a\r\n\r\nb")).toHaveLength(2)
    expect(parseNotes("a\r\rb")).toHaveLength(2)
  })

  it("reads empty or blank input as no blocks at all", () => {
    expect(parseNotes("")).toEqual([])
    expect(parseNotes("\n\n  \n")).toEqual([])
  })
})

describe("wikiLinkNames", () => {
  it("lists every name written, in order and without repeats", () => {
    expect(wikiLinkNames("[[Ada]] met [[Bob]] and [[Ada]] again")).toEqual([
      "Ada",
      "Bob",
    ])
  })

  it("finds nothing in a note with no links", () => {
    expect(wikiLinkNames("nothing here")).toEqual([])
    expect(wikiLinkNames("[[]]")).toEqual([])
  })
})

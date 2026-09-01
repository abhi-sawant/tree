import { describe, expect, it } from "vitest"

import {
  UTF8_BOM,
  escapeCsvField,
  isBlankRow,
  parseCsv,
  toCsv,
} from "~/lib/export/csv"

describe("escapeCsvField", () => {
  it("leaves an ordinary value alone", () => {
    expect(escapeCsvField("Sawant")).toBe("Sawant")
    expect(escapeCsvField("")).toBe("")
  })

  it("quotes a field containing a comma, quote or newline", () => {
    expect(escapeCsvField("Sawant, Arjun")).toBe('"Sawant, Arjun"')
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""')
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"')
  })
})

describe("toCsv", () => {
  // RFC 4180 says CRLF, and Excel on Windows is the least forgiving consumer.
  it("joins rows with CRLF", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c", "d"],
      ])
    ).toBe("a,b\r\nc,d")
  })
})

describe("parseCsv", () => {
  it("reads a simple file", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  // A file that has been through a Mac spreadsheet and a Windows one can carry
  // any of the three endings.
  it("accepts CRLF, LF and bare CR line endings", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
    expect(parseCsv("a,b\rc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("reads a quoted field containing a comma", () => {
    expect(parseCsv('"Sawant, Arjun",1890')).toEqual([
      ["Sawant, Arjun", "1890"],
    ])
  })

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('"He said ""hi""",x')).toEqual([['He said "hi"', "x"]])
  })

  it("reads a newline inside a quoted field as part of the field", () => {
    expect(parseCsv('"line one\nline two",x')).toEqual([
      ["line one\nline two", "x"],
    ])
  })

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]])
    expect(parseCsv(",,")).toEqual([["", "", ""]])
  })

  it("reads a last row with no trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  // Excel writes one; without stripping it the first column's header would be
  // "﻿Id" and never match.
  it("strips a leading byte-order mark", () => {
    expect(parseCsv(`${UTF8_BOM}a,b`)).toEqual([["a", "b"]])
  })

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([])
  })

  it("round-trips anything toCsv writes", () => {
    const rows = [
      ["Id", "Name", "Notes"],
      ["1", "Sawant, Arjun", 'Said "hello"'],
      ["2", "Priya", "line one\nline two"],
      ["3", "", ""],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe("isBlankRow", () => {
  // Spreadsheets routinely export trailing empty rows; treating them as people
  // would create a run of blank records on every import.
  it("recognises a row with nothing in it", () => {
    expect(isBlankRow([""])).toBe(true)
    expect(isBlankRow(["", "  ", ""])).toBe(true)
    expect(isBlankRow(["", "Arjun"])).toBe(false)
  })
})

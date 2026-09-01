// A minimal RFC 4180 reader/writer. No dependency: the format is small enough
// that pulling one in would cost more than it saves, and every rule it needs is
// tested below in csv.test.ts.

const QUOTE = '"'
const NEEDS_QUOTING = /[",\r\n]/

export function escapeCsvField(value: string): string {
  if (!NEEDS_QUOTING.test(value)) return value
  return QUOTE + value.replaceAll(QUOTE, QUOTE + QUOTE) + QUOTE
}

// CRLF, as RFC 4180 specifies. Excel on Windows is the main consumer of these
// files and is the least forgiving about it.
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n")
}

// A leading BOM makes Excel read the file as UTF-8 instead of guessing a
// legacy code page, which is the difference between "Ríos" and "RÃ­os" for
// anyone whose family names aren't ASCII.
export const UTF8_BOM = "﻿"

export function buildCsvBlob(rows: string[][]): Blob {
  return new Blob([UTF8_BOM + toCsv(rows)], {
    type: "text/csv;charset=utf-8",
  })
}

// Parses into rows of raw strings. Handles quoted fields containing commas,
// newlines and doubled quotes; accepts CRLF, LF or CR line endings, because a
// file that has been through a Mac spreadsheet and a Windows one can carry any
// of them.
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(UTF8_BOM) ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < input.length) {
    const char = input[i]

    if (inQuotes) {
      if (char === QUOTE) {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[i + 1] === QUOTE) {
          field += QUOTE
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === QUOTE) {
      inQuotes = true
      i++
      continue
    }
    if (char === ",") {
      endField()
      i++
      continue
    }
    if (char === "\r") {
      endRow()
      // Swallow the LF of a CRLF pair rather than reading it as a second row.
      if (input[i + 1] === "\n") i += 2
      else i++
      continue
    }
    if (char === "\n") {
      endRow()
      i++
      continue
    }

    field += char
    i++
  }

  // A file that doesn't end in a newline still has a last row; one that does
  // must not gain an empty one.
  if (field !== "" || row.length > 0) endRow()

  return rows
}

// Rows that are entirely empty carry nothing. Spreadsheets routinely export a
// few of these at the end of a sheet, and treating them as people would create
// a run of blank records on every import.
export function isBlankRow(row: string[]): boolean {
  return row.every((field) => field.trim() === "")
}

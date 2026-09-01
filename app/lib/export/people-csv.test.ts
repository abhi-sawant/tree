import { describe, expect, it } from "vitest"

import { parseCsv } from "~/lib/export/csv"
import {
  InvalidCsvError,
  PEOPLE_CSV_COLUMNS,
  buildPeopleCsv,
  formatCsvDate,
  parseCsvDate,
  parsePeopleCsv,
  peopleToCsvRows,
} from "~/lib/export/people-csv"
import type { Person, Relationship } from "~/lib/types"

function person(id: string, extra: Partial<Person> = {}): Person {
  return {
    id,
    givenName: id,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

describe("formatCsvDate", () => {
  // Year-first sorts correctly as text in a spreadsheet; "3 May 1890" does not.
  it("writes year-first, to the precision recorded", () => {
    expect(formatCsvDate({ year: 1890 })).toBe("1890")
    expect(formatCsvDate({ year: 1890, month: 5 })).toBe("1890-05")
    expect(formatCsvDate({ year: 1890, month: 5, day: 3 })).toBe("1890-05-03")
  })

  it("marks an approximate date", () => {
    expect(formatCsvDate({ year: 1890, approximate: true })).toBe("c. 1890")
  })

  it("writes nothing for an unrecorded or year-less date", () => {
    expect(formatCsvDate(undefined)).toBe("")
    expect(formatCsvDate({ month: 5 })).toBe("")
  })
})

describe("parseCsvDate", () => {
  it("reads back what formatCsvDate writes", () => {
    for (const date of [
      { year: 1890 },
      { year: 1890, month: 5 },
      { year: 1890, month: 5, day: 3 },
      { year: 1890, approximate: true },
      { year: 1890, month: 5, day: 3, approximate: true },
    ]) {
      expect(parseCsvDate(formatCsvDate(date))).toEqual(date)
    }
  })

  // A spreadsheet a family already keeps is far likelier to hold this shape.
  it("reads the app's own display format too", () => {
    expect(parseCsvDate("3 May 1890")).toEqual({ year: 1890, month: 5, day: 3 })
    expect(parseCsvDate("May 1890")).toEqual({ year: 1890, month: 5 })
    expect(parseCsvDate("c. 3 May 1890")).toEqual({
      year: 1890,
      month: 5,
      day: 3,
      approximate: true,
    })
  })

  it("accepts the other ways people write a circa date", () => {
    expect(parseCsvDate("abt 1890")).toEqual({ year: 1890, approximate: true })
    expect(parseCsvDate("ca. 1890")).toEqual({ year: 1890, approximate: true })
    expect(parseCsvDate("about 1890")).toEqual({
      year: 1890,
      approximate: true,
    })
  })

  // Refusing beats guessing: an invented date is indistinguishable from one a
  // relative actually recorded.
  it("refuses anything it cannot read exactly", () => {
    expect(parseCsvDate("sometime in the 90s")).toBeUndefined()
    expect(parseCsvDate("1890-13")).toBeUndefined()
    expect(parseCsvDate("1890-05-32")).toBeUndefined()
    expect(parseCsvDate("Smarch 1890")).toBeUndefined()
  })

  it("reads an empty cell as no date at all", () => {
    expect(parseCsvDate("")).toBeUndefined()
    expect(parseCsvDate("   ")).toBeUndefined()
  })
})

describe("peopleToCsvRows", () => {
  const arjun = person("a", { givenName: "Arjun", familyName: "Sawant" })
  const priya = person("b", { givenName: "Priya", familyName: "Iyer" })
  const anil = person("c", {
    givenName: "Anil",
    familyName: "Sawant",
    birth: { year: 1990 },
  })
  const relationships: Relationship[] = [
    { id: "r1", type: "spouse", from: "a", to: "b" },
    { id: "r2", type: "parent-child", from: "a", to: "c" },
    { id: "r3", type: "parent-child", from: "b", to: "c" },
  ]

  it("writes the documented header", () => {
    const rows = peopleToCsvRows({ people: [arjun], relationships: [] })
    expect(rows[0]).toEqual([...PEOPLE_CSV_COLUMNS])
  })

  // References are names, not ids: a family filling in a spreadsheet will never
  // type a UUID, and the point of this format is that they can read it.
  it("references parents and spouses by display name", () => {
    const rows = peopleToCsvRows({
      people: [arjun, priya, anil],
      relationships,
    })
    const anilRow = rows.find((r) => r[1] === "Anil")!
    expect(anilRow[8]).toBe("Arjun Sawant")
    expect(anilRow[9]).toBe("Priya Iyer")

    const arjunRow = rows.find((r) => r[1] === "Arjun")!
    expect(arjunRow[10]).toBe("Priya Iyer")
  })

  it("carries the id so a round-trip updates rather than duplicates", () => {
    const rows = peopleToCsvRows({ people: [arjun], relationships: [] })
    expect(rows[1][0]).toBe("a")
  })

  it("leaves unrecorded fields empty rather than writing a placeholder", () => {
    const rows = peopleToCsvRows({
      people: [person("x", { givenName: "Solo" })],
      relationships: [],
    })
    expect(rows[1].slice(2)).toEqual(["", "", "", "", "", "", "", "", "", ""])
  })

  it("joins several spouses into one cell", () => {
    const twice: Relationship[] = [
      { id: "r1", type: "spouse", from: "a", to: "b" },
      { id: "r2", type: "spouse", from: "a", to: "c" },
    ]
    const rows = peopleToCsvRows({
      people: [arjun, priya, anil],
      relationships: twice,
    })
    expect(rows.find((r) => r[1] === "Arjun")![10]).toBe(
      "Priya Iyer; Anil Sawant"
    )
  })

  it("survives a name containing a comma or a quote", () => {
    const awkward = person("q", {
      givenName: 'Ana "Nan"',
      familyName: "Ríos, Jr",
      notes: "line one\nline two",
    })
    const csv = buildPeopleCsv({ people: [awkward], relationships: [] })
    const back = parseCsv(csv)
    expect(back[1][1]).toBe('Ana "Nan"')
    expect(back[1][2]).toBe("Ríos, Jr")
    expect(back[1][11]).toBe("line one\nline two")
  })
})

describe("parsePeopleCsv", () => {
  it("reads a file this module wrote", () => {
    const csv = buildPeopleCsv({
      people: [
        person("a", {
          givenName: "Arjun",
          familyName: "Sawant",
          sex: "male",
          birth: { year: 1960 },
          notes: "Farmer",
        }),
      ],
      relationships: [],
    })
    const { rows, problems } = parsePeopleCsv(csv)
    expect(problems).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: "a",
      givenName: "Arjun",
      familyName: "Sawant",
      sex: "male",
      birth: { year: 1960 },
      notes: "Farmer",
    })
  })

  it("reads parent and spouse references", () => {
    const csv = [
      "Given name,Parent 1,Parent 2,Spouses",
      "Anil,Arjun Sawant,Priya Iyer,Meera; Kavita",
    ].join("\r\n")
    const { rows } = parsePeopleCsv(csv)
    expect(rows[0].parentRefs).toEqual(["Arjun Sawant", "Priya Iyer"])
    expect(rows[0].spouseRefs).toEqual(["Meera", "Kavita"])
  })

  // Somebody's own spreadsheet will not have the columns in this order, and may
  // not have all of them.
  it("matches columns by name, in any order, ignoring case", () => {
    const csv = ["FAMILY NAME,given name", "Sawant,Arjun"].join("\r\n")
    const { rows } = parsePeopleCsv(csv)
    expect(rows[0]).toMatchObject({ givenName: "Arjun", familyName: "Sawant" })
  })

  it("accepts the short forms of sex and ignores anything else", () => {
    const csv = ["Given name,Sex", "A,M", "B,f", "C,unknown"].join("\r\n")
    const { rows } = parsePeopleCsv(csv)
    expect(rows.map((r) => r.sex)).toEqual(["male", "female", undefined])
  })

  // A row with no name is not a person. Skipping it and saying so beats
  // creating an "Unnamed" record the reader then has to hunt down.
  it("skips a row with no given name and reports it", () => {
    const csv = ["Given name,Family name", ",Sawant", "Arjun,Sawant"].join(
      "\r\n"
    )
    const { rows, problems } = parsePeopleCsv(csv)
    expect(rows).toHaveLength(1)
    expect(problems[0]).toContain("Row 2")
  })

  it("keeps a person whose date it cannot read, and says which date", () => {
    const csv = ["Given name,Birth", "Arjun,sometime in the 90s"].join("\r\n")
    const { rows, problems } = parsePeopleCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].birth).toBeUndefined()
    expect(problems[0]).toContain("sometime in the 90s")
  })

  it("ignores blank rows a spreadsheet left at the end", () => {
    const csv = ["Given name", "Arjun", "", "  ", ""].join("\r\n")
    const { rows, problems } = parsePeopleCsv(csv)
    expect(rows).toHaveLength(1)
    expect(problems).toEqual([])
  })

  it("refuses a file that is not a people CSV at all", () => {
    expect(() => parsePeopleCsv("apples,pears\r\n1,2")).toThrow(InvalidCsvError)
    expect(() => parsePeopleCsv("")).toThrow(InvalidCsvError)
  })

  it("numbers rows the way the reader's spreadsheet does", () => {
    const csv = ["Given name", "Arjun", ""].join("\r\n")
    expect(parsePeopleCsv(csv).rows[0].lineNumber).toBe(2)
  })
})

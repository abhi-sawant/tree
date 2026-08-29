import { describe, expect, it } from "vitest"

import { comparePartialDate, formatPartialDate, partialDateToGedcomDate } from "~/lib/partial-date"

describe("formatPartialDate", () => {
  it("returns empty string for no date", () => {
    expect(formatPartialDate(undefined)).toBe("")
    expect(formatPartialDate({})).toBe("")
  })

  it("formats year only", () => {
    expect(formatPartialDate({ year: 1890 })).toBe("1890")
  })

  it("formats year and month", () => {
    expect(formatPartialDate({ year: 1890, month: 3 })).toBe("Mar 1890")
  })

  it("formats full date", () => {
    expect(formatPartialDate({ year: 1890, month: 3, day: 12 })).toBe("12 Mar 1890")
  })

  it("prefixes approximate dates with 'c. '", () => {
    expect(formatPartialDate({ year: 1890, approximate: true })).toBe("c. 1890")
    expect(formatPartialDate({ year: 1890, month: 3, day: 12, approximate: true })).toBe(
      "c. 12 Mar 1890",
    )
  })

  it("does not prefix an empty result even if approximate", () => {
    expect(formatPartialDate({ approximate: true })).toBe("")
  })
})

describe("comparePartialDate", () => {
  it("sorts undefined dates last", () => {
    const dates = [undefined, { year: 1900 }]
    dates.sort(comparePartialDate)
    expect(dates).toEqual([{ year: 1900 }, undefined])
  })

  it("treats a dateless PartialDate object like undefined", () => {
    expect(comparePartialDate({}, { year: 1900 })).toBeGreaterThan(0)
  })

  it("orders by year", () => {
    expect(comparePartialDate({ year: 1850 }, { year: 1900 })).toBeLessThan(0)
    expect(comparePartialDate({ year: 1900 }, { year: 1850 })).toBeGreaterThan(0)
  })

  it("orders by month within the same year", () => {
    expect(
      comparePartialDate({ year: 1900, month: 3 }, { year: 1900, month: 6 }),
    ).toBeLessThan(0)
  })

  it("treats missing month/day as earliest-in-period", () => {
    expect(comparePartialDate({ year: 1900 }, { year: 1900, month: 1, day: 1 })).toBe(0)
  })

  it("does not let approximate affect ordering", () => {
    expect(
      comparePartialDate({ year: 1900, approximate: true }, { year: 1900 }),
    ).toBe(0)
  })

  it("sorts a mixed array correctly end-to-end", () => {
    const dates = [
      { year: 1950 },
      undefined,
      { year: 1900, month: 6, day: 15 },
      { year: 1900, month: 1 },
    ]
    dates.sort(comparePartialDate)
    expect(dates).toEqual([
      { year: 1900, month: 1 },
      { year: 1900, month: 6, day: 15 },
      { year: 1950 },
      undefined,
    ])
  })
})

describe("partialDateToGedcomDate", () => {
  it("returns empty string for no date", () => {
    expect(partialDateToGedcomDate(undefined)).toBe("")
    expect(partialDateToGedcomDate({})).toBe("")
  })

  it("formats year only", () => {
    expect(partialDateToGedcomDate({ year: 1890 })).toBe("1890")
  })

  it("formats approximate year", () => {
    expect(partialDateToGedcomDate({ year: 1890, approximate: true })).toBe("ABT 1890")
  })

  it("formats year and month", () => {
    expect(partialDateToGedcomDate({ year: 1890, month: 3 })).toBe("MAR 1890")
  })

  it("formats full date", () => {
    expect(partialDateToGedcomDate({ year: 1890, month: 3, day: 12 })).toBe("12 MAR 1890")
  })

  it("formats approximate full date", () => {
    expect(
      partialDateToGedcomDate({ year: 1890, month: 3, day: 12, approximate: true }),
    ).toBe("ABT 12 MAR 1890")
  })
})

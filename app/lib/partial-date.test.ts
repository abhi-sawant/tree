import { describe, expect, it } from "vitest"

import {
  comparePartialDate,
  dateBounds,
  definitelyBefore,
  formatPartialDate,
  maximumYearsBetween,
  minimumYearsBetween,
  partialDateToGedcomDate,
} from "~/lib/partial-date"

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
    expect(formatPartialDate({ year: 1890, month: 3, day: 12 })).toBe(
      "12 Mar 1890"
    )
  })

  it("prefixes approximate dates with 'c. '", () => {
    expect(formatPartialDate({ year: 1890, approximate: true })).toBe("c. 1890")
    expect(
      formatPartialDate({ year: 1890, month: 3, day: 12, approximate: true })
    ).toBe("c. 12 Mar 1890")
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
    expect(comparePartialDate({ year: 1900 }, { year: 1850 })).toBeGreaterThan(
      0
    )
  })

  it("orders by month within the same year", () => {
    expect(
      comparePartialDate({ year: 1900, month: 3 }, { year: 1900, month: 6 })
    ).toBeLessThan(0)
  })

  it("treats missing month/day as earliest-in-period", () => {
    expect(
      comparePartialDate({ year: 1900 }, { year: 1900, month: 1, day: 1 })
    ).toBe(0)
  })

  it("does not let approximate affect ordering", () => {
    expect(
      comparePartialDate({ year: 1900, approximate: true }, { year: 1900 })
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
    expect(partialDateToGedcomDate({ year: 1890, approximate: true })).toBe(
      "ABT 1890"
    )
  })

  it("formats year and month", () => {
    expect(partialDateToGedcomDate({ year: 1890, month: 3 })).toBe("MAR 1890")
  })

  it("formats full date", () => {
    expect(partialDateToGedcomDate({ year: 1890, month: 3, day: 12 })).toBe(
      "12 MAR 1890"
    )
  })

  it("formats approximate full date", () => {
    expect(
      partialDateToGedcomDate({
        year: 1890,
        month: 3,
        day: 12,
        approximate: true,
      })
    ).toBe("ABT 12 MAR 1890")
  })
})

describe("dateBounds", () => {
  it("is undefined without a year, since nothing can be placed", () => {
    expect(dateBounds(undefined)).toBeUndefined()
    expect(dateBounds({})).toBeUndefined()
    expect(dateBounds({ month: 6, day: 1 })).toBeUndefined()
  })

  it("spans the whole year for a bare year", () => {
    const bounds = dateBounds({ year: 1950 })!
    expect(bounds.latest - bounds.earliest).toBe(371)
  })

  it("spans the month when the month is known", () => {
    const bounds = dateBounds({ year: 1950, month: 6 })!
    expect(bounds.latest - bounds.earliest).toBe(30)
  })

  it("collapses to a point for a full date", () => {
    const bounds = dateBounds({ year: 1950, month: 6, day: 15 })!
    expect(bounds.latest).toBe(bounds.earliest)
  })

  it("widens an approximate date either way", () => {
    const exact = dateBounds({ year: 1950, month: 6, day: 15 })!
    const circa = dateBounds({
      year: 1950,
      month: 6,
      day: 15,
      approximate: true,
    })!
    expect(circa.earliest).toBeLessThan(exact.earliest)
    expect(circa.latest).toBeGreaterThan(exact.latest)
  })
})

describe("definitelyBefore", () => {
  it("is true only when the spans cannot overlap", () => {
    expect(definitelyBefore({ year: 1940 }, { year: 1950 })).toBe(true)
    expect(definitelyBefore({ year: 1950 }, { year: 1940 })).toBe(false)
  })

  it("is false for two identical bare years", () => {
    expect(definitelyBefore({ year: 1950 }, { year: 1950 })).toBe(false)
  })

  it("is false when a month sits inside the other's year", () => {
    expect(definitelyBefore({ year: 1950, month: 3 }, { year: 1950 })).toBe(
      false
    )
  })

  it("is true for precise dates in the same year", () => {
    expect(
      definitelyBefore(
        { year: 1950, month: 3, day: 1 },
        { year: 1950, month: 6, day: 1 }
      )
    ).toBe(true)
  })

  it("is false whenever either date is unknown", () => {
    expect(definitelyBefore(undefined, { year: 1950 })).toBe(false)
    expect(definitelyBefore({ year: 1950 }, undefined)).toBe(false)
  })

  it("is false when an approximate margin could close the gap", () => {
    expect(
      definitelyBefore({ year: 1949, approximate: true }, { year: 1950 })
    ).toBe(false)
  })

  it("does not share comparePartialDate's sorting fiction", () => {
    // comparePartialDate collapses a bare year to 1 January, which is right for
    // sorting and would be a false accusation here.
    expect(
      comparePartialDate({ year: 1950 }, { year: 1950, month: 6 })
    ).toBeLessThan(0)
    expect(definitelyBefore({ year: 1950 }, { year: 1950, month: 6 })).toBe(
      false
    )
  })
})

describe("minimumYearsBetween / maximumYearsBetween", () => {
  it("brackets the gap between two bare years", () => {
    expect(minimumYearsBetween({ year: 1970 }, { year: 1982 })).toBeCloseTo(
      11,
      1
    )
    expect(maximumYearsBetween({ year: 1970 }, { year: 1982 })).toBeCloseTo(
      13,
      1
    )
  })

  it("agrees exactly for two full dates", () => {
    const a = { year: 1950, month: 1, day: 1 }
    const b = { year: 1960, month: 1, day: 1 }
    expect(minimumYearsBetween(a, b)).toBe(maximumYearsBetween(a, b))
  })

  it("goes negative when the second date might come first", () => {
    expect(minimumYearsBetween({ year: 1980 }, { year: 1950 })!).toBeLessThan(0)
  })

  it("is undefined when either date is unknown", () => {
    expect(minimumYearsBetween(undefined, { year: 1950 })).toBeUndefined()
    expect(maximumYearsBetween({ year: 1950 }, {})).toBeUndefined()
  })
})

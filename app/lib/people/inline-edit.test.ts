import { describe, expect, it } from "vitest"

import {
  applyInlineEdit,
  inlineDisplayValue,
  inlineEditValue,
  isNoOpEdit,
} from "~/lib/people/inline-edit"
import type { Person } from "~/lib/types"

function person(extra: Partial<Person> = {}): Person {
  return {
    id: "p1",
    givenName: "Arjun",
    familyName: "Sawant",
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

describe("inlineEditValue", () => {
  it("opens a name cell on its current value", () => {
    expect(inlineEditValue(person(), "givenName")).toBe("Arjun")
    expect(inlineEditValue(person(), "familyName")).toBe("Sawant")
    expect(
      inlineEditValue(person({ familyName: undefined }), "familyName")
    ).toBe("")
  })

  // The cell shows "3 May 1890" but edits only the year, so the editor must
  // open on the year alone rather than on the rendered date.
  it("opens a date cell on the year alone", () => {
    const p = person({ birth: { year: 1890, month: 5, day: 3 } })
    expect(inlineEditValue(p, "birthYear")).toBe("1890")
    expect(inlineDisplayValue(p, "birthYear")).toBe("3 May 1890")
  })

  it("opens an unrecorded date cell empty", () => {
    expect(inlineEditValue(person(), "birthYear")).toBe("")
    expect(inlineDisplayValue(person(), "deathYear")).toBe("")
  })
})

describe("applyInlineEdit — names", () => {
  it("trims a given name", () => {
    expect(applyInlineEdit(person(), "givenName", "  Anil ")).toEqual({
      ok: true,
      patch: { givenName: "Anil" },
    })
  })

  // PersonFormSchema requires one, so this has to be refused here with
  // something a reader can act on rather than deep inside updatePerson.
  it("refuses an empty given name", () => {
    const result = applyInlineEdit(person(), "givenName", "   ")
    expect(result.ok).toBe(false)
  })

  // Absent rather than "", so a cleared family name matches everyone who never
  // had one recorded.
  it("stores a cleared family name as absent", () => {
    expect(applyInlineEdit(person(), "familyName", "  ")).toEqual({
      ok: true,
      patch: { familyName: undefined },
    })
  })
})

describe("applyInlineEdit — years", () => {
  it("sets a year where there was no date at all", () => {
    expect(applyInlineEdit(person(), "birthYear", "1912")).toEqual({
      ok: true,
      patch: { birth: { year: 1912 } },
    })
  })

  // Editing the year of "c. 3 May 1890" must not throw away the day or turn a
  // circa date into an exact one.
  it("carries month, day and the approximate flag through", () => {
    const p = person({
      birth: { year: 1890, month: 5, day: 3, approximate: true },
    })
    expect(applyInlineEdit(p, "birthYear", "1891")).toEqual({
      ok: true,
      patch: { birth: { year: 1891, month: 5, day: 3, approximate: true } },
    })
  })

  // A month with no year denotes nothing — formatPartialDate renders it empty
  // and every partial-date comparison treats it as unknown — so keeping it
  // behind an emptied cell would store a value that reads as absent everywhere
  // and reappear if a year were typed later.
  it("clears the whole date when the year is emptied", () => {
    const p = person({ death: { year: 1970, month: 2, day: 9 } })
    expect(applyInlineEdit(p, "deathYear", "")).toEqual({
      ok: true,
      patch: { death: undefined },
    })
  })

  it("edits the death year independently of the birth", () => {
    const p = person({ birth: { year: 1890 }, death: { year: 1960 } })
    expect(applyInlineEdit(p, "deathYear", "1961")).toEqual({
      ok: true,
      patch: { death: { year: 1961 } },
    })
  })

  it("refuses anything that isn't digits", () => {
    expect(applyInlineEdit(person(), "birthYear", "19th century").ok).toBe(
      false
    )
    expect(applyInlineEdit(person(), "birthYear", "18 90").ok).toBe(false)
    expect(applyInlineEdit(person(), "birthYear", "1890.5").ok).toBe(false)
  })

  it("refuses a year far outside anything a record could carry", () => {
    expect(applyInlineEdit(person(), "birthYear", "19990").ok).toBe(false)
    expect(applyInlineEdit(person(), "birthYear", "-99999").ok).toBe(false)
  })

  it("accepts a BC year", () => {
    expect(applyInlineEdit(person(), "birthYear", "-44")).toEqual({
      ok: true,
      patch: { birth: { year: -44 } },
    })
  })
})

describe("isNoOpEdit", () => {
  // Clicking into a cell and straight back out must not bump updatedAt or wake
  // the change signal that drives snapshots and the backup nudge.
  it("recognises an edit that changes nothing", () => {
    expect(isNoOpEdit(person(), "givenName", "Arjun")).toBe(true)
    expect(isNoOpEdit(person(), "givenName", " Arjun ")).toBe(true)
    expect(isNoOpEdit(person(), "givenName", "Anil")).toBe(false)
  })

  it("compares a date cell on the year", () => {
    const p = person({ birth: { year: 1890, month: 5 } })
    expect(isNoOpEdit(p, "birthYear", "1890")).toBe(true)
    expect(isNoOpEdit(p, "birthYear", "1891")).toBe(false)
  })
})

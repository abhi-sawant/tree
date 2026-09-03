import { describe, expect, it } from "vitest"

import {
  duplicateKey,
  duplicatePersonIds,
  filterDismissed,
  findingKey,
  findingPersonIds,
} from "~/lib/analysis/dismissals"
import type { DuplicateCandidate } from "~/lib/analysis/duplicates"
import type { Finding } from "~/lib/analysis/validate"

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    code: "missing-birth-year",
    severity: "warning",
    message: "No birth year recorded.",
    personIds: ["b", "a"],
    ...overrides,
  }
}

function duplicate(personIds: [string, string]): DuplicateCandidate {
  return { personIds, labels: ["A", "B"], score: 0.8, reasons: [] }
}

describe("findingKey", () => {
  it("does not depend on the order the validator listed people in", () => {
    // That order is presentation — which person to take the reader to first —
    // and presentation must not change identity.
    expect(findingKey(finding({ personIds: ["a", "b"] }))).toBe(
      findingKey(finding({ personIds: ["b", "a"] }))
    )
  })

  it("distinguishes different rules about the same people", () => {
    expect(findingKey(finding({ code: "missing-birth-year" }))).not.toBe(
      findingKey(finding({ code: "not-in-any-tree" }))
    )
  })

  it("distinguishes the same rule about different people", () => {
    expect(findingKey(finding({ personIds: ["a"] }))).not.toBe(
      findingKey(finding({ personIds: ["a", "b"] }))
    )
  })

  it("ignores the message, which is generated text", () => {
    expect(findingKey(finding({ message: "one wording" }))).toBe(
      findingKey(finding({ message: "another wording" }))
    )
  })
})

describe("duplicateKey", () => {
  it("is the same whichever way round the pair is given", () => {
    expect(duplicateKey(duplicate(["a", "b"]))).toBe(
      duplicateKey(duplicate(["b", "a"]))
    )
  })

  it("cannot collide with a finding about the same people", () => {
    expect(duplicateKey(duplicate(["a", "b"]))).not.toBe(
      findingKey(finding({ personIds: ["a", "b"] }))
    )
  })
})

describe("person ids", () => {
  it("are sorted, so a stored dismissal can be found by either person", () => {
    expect(findingPersonIds(finding({ personIds: ["b", "a"] }))).toEqual([
      "a",
      "b",
    ])
    expect(duplicatePersonIds(duplicate(["b", "a"]))).toEqual(["a", "b"])
  })
})

describe("filterDismissed", () => {
  it("drops only what was dismissed", () => {
    const kept = finding({ code: "not-in-any-tree", personIds: ["c"] })
    const dropped = finding({ personIds: ["a"] })
    const result = filterDismissed(
      [kept, dropped],
      findingKey,
      new Set([findingKey(dropped)])
    )
    expect(result).toEqual([kept])
  })

  it("keeps a different rule about the same person", () => {
    const dismissed = finding({ code: "missing-birth-year", personIds: ["a"] })
    const other = finding({ code: "not-in-any-tree", personIds: ["a"] })
    const result = filterDismissed(
      [other],
      findingKey,
      new Set([findingKey(dismissed)])
    )
    expect(result).toEqual([other])
  })
})

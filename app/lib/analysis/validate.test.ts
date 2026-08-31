import { describe, expect, it } from "vitest"

import { countBySeverity, validate } from "~/lib/analysis/validate"
import type { FindingCode, ValidateInput } from "~/lib/analysis/validate"
import type {
  ParentChildSubtype,
  PartialDate,
  Person,
  Relationship,
  TreeMember,
} from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    givenName: id,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function parentChild(
  from: string,
  to: string,
  subtype?: ParentChildSubtype
): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to, subtype }
}

function spouse(from: string, to: string, start?: PartialDate): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to, start }
}

// Every person is put in a tree and given a birth year by default, so the
// warnings for "no tree" and "no birth year" don't drown out the rule under
// test. Individual tests opt out where that's the point.
function run(
  people: Person[],
  relationships: Relationship[] = [],
  memberships?: TreeMember[]
) {
  const input: ValidateInput = {
    people,
    relationships,
    memberships:
      memberships ??
      people.map((p) => ({ treeId: "t1", personId: p.id }) as TreeMember),
  }
  return validate(input)
}

function codes(people: Person[], relationships: Relationship[] = []) {
  return run(people, relationships).map((f) => f.code)
}

function has(actual: FindingCode[], code: FindingCode) {
  return actual.includes(code)
}

describe("validate — a clean pool", () => {
  it("reports nothing for ordinary, complete data", () => {
    const findings = run(
      [
        person("parent", { birth: { year: 1950 }, death: { year: 2010 } }),
        person("child", { birth: { year: 1980 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(findings).toEqual([])
  })
})

describe("validate — death before birth", () => {
  it("reports a death definitely before the birth", () => {
    const found = codes([
      person("a", { birth: { year: 1950 }, death: { year: 1940 } }),
    ])
    expect(has(found, "death-before-birth")).toBe(true)
  })

  it("stays silent when both dates are the same bare year", () => {
    // 1950 means anywhere in 1950 on both sides: the data cannot say which
    // came first, so neither can we.
    const found = codes([
      person("a", { birth: { year: 1950 }, death: { year: 1950 } }),
    ])
    expect(has(found, "death-before-birth")).toBe(false)
  })

  it("stays silent for a bare year against a month inside it", () => {
    const found = codes([
      person("a", { birth: { year: 1950, month: 6 }, death: { year: 1950 } }),
    ])
    expect(has(found, "death-before-birth")).toBe(false)
  })

  it("reports when precise dates settle it inside one year", () => {
    const found = codes([
      person("a", {
        birth: { year: 1950, month: 6, day: 1 },
        death: { year: 1950, month: 3, day: 1 },
      }),
    ])
    expect(has(found, "death-before-birth")).toBe(true)
  })

  it("stays silent when an approximate date could close the gap", () => {
    const found = codes([
      person("a", {
        birth: { year: 1950 },
        death: { year: 1949, approximate: true },
      }),
    ])
    expect(has(found, "death-before-birth")).toBe(false)
  })
})

describe("validate — child born before parent", () => {
  it("reports a child whose birth definitely precedes the parent's", () => {
    const found = codes(
      [
        person("parent", { birth: { year: 1980 } }),
        person("child", { birth: { year: 1950 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "child-born-before-parent")).toBe(true)
  })

  it("does not also report parent-too-young for the same mistake", () => {
    const found = codes(
      [
        person("parent", { birth: { year: 1980 } }),
        person("child", { birth: { year: 1950 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "parent-too-young")).toBe(false)
  })

  it("allows a step-parent younger than the step-child", () => {
    const found = codes(
      [
        person("stepparent", { birth: { year: 1990 } }),
        person("child", { birth: { year: 1960 } }),
      ],
      [parentChild("stepparent", "child", "step")]
    )
    expect(has(found, "child-born-before-parent")).toBe(false)
  })

  it("allows a guardian younger than their ward", () => {
    const found = codes(
      [
        person("guardian", { birth: { year: 1990 } }),
        person("child", { birth: { year: 1960 } }),
      ],
      [parentChild("guardian", "child", "guardian")]
    )
    expect(has(found, "child-born-before-parent")).toBe(false)
  })

  it("still reports an adoptive parent born after the child", () => {
    const found = codes(
      [
        person("parent", { birth: { year: 1990 } }),
        person("child", { birth: { year: 1960 } }),
      ],
      [parentChild("parent", "child", "adopted")]
    )
    expect(has(found, "child-born-before-parent")).toBe(true)
  })
})

describe("validate — parent too young", () => {
  it("reports a biological parent who could only have been under 12", () => {
    const found = codes(
      [
        person("parent", { birth: { year: 1970 } }),
        person("child", { birth: { year: 1978 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "parent-too-young")).toBe(true)
  })

  it("stays silent when the gap could reach 12 years", () => {
    // 1970 and 1982 as bare years span a gap of 11 to 13 — 12 is possible, so
    // there is nothing to report.
    const found = codes(
      [
        person("parent", { birth: { year: 1970 } }),
        person("child", { birth: { year: 1982 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "parent-too-young")).toBe(false)
  })

  it("exempts every non-biological link", () => {
    for (const subtype of [
      "adopted",
      "step",
      "foster",
      "guardian",
    ] as ParentChildSubtype[]) {
      const found = codes(
        [
          person("parent", { birth: { year: 1970 } }),
          person("child", { birth: { year: 1978 } }),
        ],
        [parentChild("parent", "child", subtype)]
      )
      expect(has(found, "parent-too-young")).toBe(false)
    }
  })

  it("stays silent when either birth year is unknown", () => {
    const found = codes(
      [person("parent"), person("child", { birth: { year: 1978 } })],
      [parentChild("parent", "child")]
    )
    expect(has(found, "parent-too-young")).toBe(false)
  })
})

describe("validate — child born after parent's death", () => {
  it("allows a posthumous birth inside the nine-month window", () => {
    const found = codes(
      [
        person("parent", {
          birth: { year: 1950 },
          death: { year: 1980, month: 1, day: 15 },
        }),
        person("child", { birth: { year: 1980, month: 7, day: 20 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "child-born-after-parent-death")).toBe(false)
  })

  it("reports a biological birth well past that window", () => {
    const found = codes(
      [
        person("parent", { birth: { year: 1950 }, death: { year: 1980 } }),
        person("child", { birth: { year: 1985 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "child-born-after-parent-death")).toBe(true)
  })

  it("holds a non-biological parent to a zero window", () => {
    // You cannot adopt a child born after you died, so the nine-month
    // allowance a biological father gets does not apply here.
    const found = codes(
      [
        person("parent", {
          birth: { year: 1950 },
          death: { year: 1980, month: 1, day: 15 },
        }),
        person("child", { birth: { year: 1980, month: 7, day: 20 } }),
      ],
      [parentChild("parent", "child", "adopted")]
    )
    expect(has(found, "child-born-after-parent-death")).toBe(true)
  })

  it("stays silent when the parent has no death date", () => {
    const found = codes(
      [
        person("parent", { birth: { year: 1950 } }),
        person("child", { birth: { year: 1985 } }),
      ],
      [parentChild("parent", "child")]
    )
    expect(has(found, "child-born-after-parent-death")).toBe(false)
  })
})

describe("validate — marriage dates", () => {
  it("reports a marriage before a spouse was born", () => {
    const found = codes(
      [
        person("a", { birth: { year: 1950 } }),
        person("b", { birth: { year: 1990 } }),
      ],
      [spouse("a", "b", { year: 1975 })]
    )
    expect(has(found, "marriage-before-birth")).toBe(true)
  })

  it("reports a marriage after a spouse died", () => {
    const found = codes(
      [
        person("a", { birth: { year: 1950 }, death: { year: 1970 } }),
        person("b", { birth: { year: 1952 } }),
      ],
      [spouse("a", "b", { year: 1990 })]
    )
    expect(has(found, "marriage-after-death")).toBe(true)
  })

  it("stays silent when the marriage has no date", () => {
    const found = codes(
      [
        person("a", { birth: { year: 1950 }, death: { year: 1970 } }),
        person("b", { birth: { year: 1990 } }),
      ],
      [spouse("a", "b")]
    )
    expect(has(found, "marriage-after-death")).toBe(false)
    expect(has(found, "marriage-before-birth")).toBe(false)
  })

  it("names both spouses so either can be opened", () => {
    const findings = run(
      [
        person("a", { birth: { year: 1950 } }),
        person("b", { birth: { year: 1990 } }),
      ],
      [spouse("a", "b", { year: 1975 })]
    )
    const finding = findings.find((f) => f.code === "marriage-before-birth")!
    expect(finding.personIds).toEqual(["b", "a"])
  })
})

describe("validate — warnings", () => {
  it("flags an implausible lifespan", () => {
    const found = codes([
      person("a", { birth: { year: 1800 }, death: { year: 1950 } }),
    ])
    expect(has(found, "implausible-lifespan")).toBe(true)
  })

  it("does not flag a long but possible life", () => {
    const found = codes([
      person("a", { birth: { year: 1900 }, death: { year: 2005 } }),
    ])
    expect(has(found, "implausible-lifespan")).toBe(false)
  })

  it("flags an unresolved placeholder", () => {
    const found = codes([person("a", { isPlaceholder: true })])
    expect(has(found, "unresolved-placeholder")).toBe(true)
  })

  it("does not also nag a placeholder about its missing birth year", () => {
    // A placeholder is a known gap already being reported as one; a second
    // finding about the same person's emptiness is noise.
    const found = codes([person("a", { isPlaceholder: true })])
    expect(has(found, "missing-birth-year")).toBe(false)
  })

  it("flags someone who belongs to no tree", () => {
    const findings = validate({
      people: [person("a", { birth: { year: 1950 } })],
      relationships: [],
      memberships: [],
    })
    expect(findings.map((f) => f.code)).toContain("not-in-any-tree")
  })

  it("does not flag someone who belongs to a tree", () => {
    const found = codes([person("a", { birth: { year: 1950 } })])
    expect(has(found, "not-in-any-tree")).toBe(false)
  })

  it("flags a missing birth year", () => {
    const found = codes([person("a")])
    expect(has(found, "missing-birth-year")).toBe(true)
  })
})

describe("validate — output shape", () => {
  it("puts errors before warnings", () => {
    const findings = run([
      person("a", { birth: { year: 1950 }, death: { year: 1940 } }),
      person("b", { isPlaceholder: true }),
    ])
    const firstWarning = findings.findIndex((f) => f.severity === "warning")
    const lastError = findings.map((f) => f.severity).lastIndexOf("error")
    expect(lastError).toBeLessThan(firstWarning)
  })

  it("is stable across repeated runs on the same input", () => {
    const people = [
      person("a", { birth: { year: 1950 }, death: { year: 1940 } }),
      person("b", { isPlaceholder: true }),
      person("c"),
    ]
    expect(run(people)).toEqual(run(people))
  })

  it("ignores relationships pointing at people who are not in the pool", () => {
    const findings = run(
      [person("a", { birth: { year: 1950 } })],
      [parentChild("a", "ghost"), spouse("a", "ghost", { year: 1900 })]
    )
    expect(findings).toEqual([])
  })

  it("counts by severity", () => {
    const findings = run([
      person("a", { birth: { year: 1950 }, death: { year: 1940 } }),
      person("b", { isPlaceholder: true }),
    ])
    expect(countBySeverity(findings)).toEqual({ error: 1, warning: 1 })
  })
})

import { describe, expect, it } from "vitest"

import {
  personNodeAriaLabel,
  personSpokenName,
  unionNodeAriaLabel,
} from "~/lib/canvas/aria-labels"
import { sampleTreeData } from "~/lib/demo/sample-tree"
import { deriveUnions } from "~/lib/graph/derive-unions"
import type { Person } from "~/lib/types"

const sample = sampleTreeData(1_700_000_000_000)

function personOf(id: string): Person {
  const found = sample.people.find((person) => person.id === id)
  if (!found) throw new Error(`No sample person ${id}`)
  return found
}

function labelOf(id: string, generation?: number, pinned?: boolean): string {
  return personNodeAriaLabel({
    person: personOf(id),
    people: sample.people,
    relationships: sample.relationships,
    generation,
    pinned,
  })
}

describe("personSpokenName", () => {
  it("reads a lifespan as two dates", () => {
    expect(personSpokenName(personOf("demo-p1"))).toBe(
      "Ravi Sawant, 12 Mar 1888 – 4 Nov 1961"
    )
  })

  it("includes a nickname the way the card shows it", () => {
    expect(personSpokenName(personOf("demo-p3"))).toBe(
      "Anil “Bapu” Sawant, 22 Jul 1915 – 30 Jan 1990"
    )
  })

  // "Meera Nair, 1946 –" read aloud sounds like the sentence was cut off.
  it("says 'born' when there is no death date", () => {
    expect(personSpokenName(personOf("demo-p7"))).toBe(
      "Meera Nair, born 14 Sep 1946"
    )
  })

  it("says 'died' when there is no birth date", () => {
    expect(
      personSpokenName({
        id: "x",
        givenName: "Someone",
        death: { year: 1900 },
        createdAt: 0,
        updatedAt: 0,
      })
    ).toBe("Someone, died 1900")
  })

  it("is just the name when no dates are recorded", () => {
    expect(
      personSpokenName({
        id: "x",
        givenName: "Someone",
        createdAt: 0,
        updatedAt: 0,
      })
    ).toBe("Someone")
  })
})

describe("personNodeAriaLabel", () => {
  // The relationships are the whole reason this exists: they are what the lines
  // on the canvas say, and lines are what a screen reader cannot read.
  it("names the spouse and the parents, and counts the children", () => {
    expect(labelOf("demo-p3", 1)).toBe(
      "Anil “Bapu” Sawant, 22 Jul 1915 – 30 Jan 1990. Generation 2. " +
        "Married to Kamala Sawant. Parents: Ravi Sawant, Sushila Sawant. " +
        "3 children."
    )
  })

  it("names both spouses of somebody married twice", () => {
    expect(labelOf("demo-p7")).toContain(
      "Married to Suresh Nair and David Fernandes"
    )
  })

  it("says so when no parents are recorded", () => {
    expect(labelOf("demo-p1")).toContain("No parents recorded")
  })

  it("uses the singular for an only child", () => {
    expect(labelOf("demo-p8")).toContain("1 child.")
  })

  it("mentions a multiple birth, which is otherwise only an icon", () => {
    expect(labelOf("demo-p9")).toContain("One of a multiple birth")
  })

  it("mentions a hand-placed card, which is otherwise only a pin", () => {
    expect(labelOf("demo-p1", 0, true)).toContain("Placed by hand")
    expect(labelOf("demo-p1", 0, false)).not.toContain("Placed by hand")
  })

  it("says a placeholder is a placeholder", () => {
    const label = personNodeAriaLabel({
      person: {
        id: "p",
        givenName: "Unknown",
        isPlaceholder: true,
        createdAt: 0,
        updatedAt: 0,
      },
      people: [],
      relationships: [],
    })
    expect(label).toContain("Placeholder, name not yet known")
  })

  it("speaks the generation one-based, as the toolbar shows it", () => {
    expect(labelOf("demo-p1", 0)).toContain("Generation 1")
    expect(labelOf("demo-p1")).not.toContain("Generation")
  })

  // A relationship can point at somebody who isn't in the pool handed to the
  // label — a focus scope, a hidden generation. Better to say something true
  // than to render "undefined".
  it("does not invent a name for a relative it cannot find", () => {
    const label = personNodeAriaLabel({
      person: personOf("demo-p3"),
      people: [personOf("demo-p3")],
      relationships: sample.relationships,
    })
    expect(label).toContain("someone not recorded here")
    expect(label).not.toContain("undefined")
  })
})

describe("unionNodeAriaLabel", () => {
  const { unions } = deriveUnions(sample.people, sample.relationships)
  const unionFor = (a: string, b: string) => {
    const found = unions.find(
      (union) => union.parents.includes(a) && union.parents.includes(b)
    )
    if (!found) throw new Error(`No union for ${a} and ${b}`)
    return found
  }

  it("reads a marriage with its date", () => {
    expect(
      unionNodeAriaLabel(unionFor("demo-p1", "demo-p2"), sample.people)
    ).toBe("Marriage of Ravi Sawant and Sushila Sawant, from 1911.")
  })

  it("says when a marriage ended", () => {
    expect(
      unionNodeAriaLabel(unionFor("demo-p7", "demo-p10"), sample.people)
    ).toBe(
      "Marriage of Meera Nair and Suresh Nair, from 5 Apr 1969, ended 1981."
    )
  })

  // An implicit union exists because two people share a child. Calling it a
  // marriage would assert something the data does not say.
  it("does not call an unrecorded pairing a marriage", () => {
    const label = unionNodeAriaLabel(
      {
        id: "u",
        kind: "implicit",
        parents: ["demo-p1", "demo-p4"],
      },
      sample.people
    )
    expect(label).toBe(
      "Ravi Sawant and Kamala Sawant, parents of the same children."
    )
  })
})

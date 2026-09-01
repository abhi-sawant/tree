import { describe, expect, it } from "vitest"

import { validate } from "~/lib/analysis/validate"
import {
  isDemoId,
  sampleTreeData,
  SAMPLE_ROOT_ID,
  SAMPLE_TREE_ID,
} from "~/lib/demo/sample-tree"
import { deriveUnions } from "~/lib/graph/derive-unions"
import { sortSiblingIds } from "~/lib/graph/order-family-graph"
import { parseNotes, wikiLinkNames } from "~/lib/notes/markdown"
import { NameIndex } from "~/lib/people/name-index"
import { comparePartialDate } from "~/lib/partial-date"
import {
  PersonSchema,
  RelationshipSchema,
  TreeMemberSchema,
  TreeSchema,
} from "~/lib/schemas"

// Pinned rather than the clock, so createdAt is exactly the declaration order
// and the sibling-order assertions below mean something.
const NOW = 1_700_000_000_000
const data = sampleTreeData(NOW)

describe("the sample family as data", () => {
  it("validates against the schemas every other write path goes through", () => {
    for (const person of data.people) {
      expect(() => PersonSchema.parse(person)).not.toThrow()
    }
    for (const relationship of data.relationships) {
      expect(() => RelationshipSchema.parse(relationship)).not.toThrow()
    }
    expect(() => TreeSchema.parse(data.tree)).not.toThrow()
    for (const member of data.members) {
      expect(() => TreeMemberSchema.parse(member)).not.toThrow()
    }
  })

  it("uses fixed, prefixed, unique ids", () => {
    const ids = data.people.map((person) => person.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(isDemoId)).toBe(true)
    expect(data.relationships.every((r) => isDemoId(r.id))).toBe(true)
    expect(isDemoId(SAMPLE_TREE_ID)).toBe(true)
  })

  it("is the same data twice, and hands out copies", () => {
    const first = sampleTreeData(NOW)
    const second = sampleTreeData(NOW)
    expect(first).toEqual(second)

    first.relationships[0].start = { year: 1066 }
    expect(sampleTreeData(NOW).relationships[0].start).toEqual({ year: 1911 })
  })
})

describe("the sample family as a tree", () => {
  const peopleIds = new Set(data.people.map((person) => person.id))

  it("has both ends of every relationship present", () => {
    for (const relationship of data.relationships) {
      expect(peopleIds.has(relationship.from)).toBe(true)
      expect(peopleIds.has(relationship.to)).toBe(true)
    }
  })

  it("puts everyone in the tree, root included", () => {
    expect(data.members.map((m) => m.personId).sort()).toEqual(
      [...peopleIds].sort()
    )
    expect(data.members.every((m) => m.treeId === SAMPLE_TREE_ID)).toBe(true)
    expect(peopleIds.has(data.tree.rootPersonId)).toBe(true)
    expect(data.tree.rootPersonId).toBe(SAMPLE_ROOT_ID)
  })

  // The invariants addRelationship enforces. loadSampleTree writes rows
  // directly and so never gets checked by it — these are the check instead, and
  // they run whether or not anybody loads the sample.
  it("satisfies every rule addRelationship would have applied", () => {
    const parents = new Map<string, string[]>()
    for (const relationship of data.relationships) {
      expect(relationship.from).not.toBe(relationship.to)
      if (relationship.type !== "parent-child") continue
      const list = parents.get(relationship.to) ?? []
      list.push(relationship.from)
      parents.set(relationship.to, list)
    }

    for (const [childId, parentIds] of parents) {
      expect(parentIds.length, `parents of ${childId}`).toBeLessThanOrEqual(2)
      expect(new Set(parentIds).size).toBe(parentIds.length)
    }

    // No cycles: walking up from anybody has to terminate without meeting them
    // again. Cheap here, and the one error in a fixture like this that would
    // hang the layout engine rather than merely look wrong.
    for (const personId of peopleIds) {
      const seen = new Set<string>()
      let frontier = [personId]
      while (frontier.length > 0) {
        const next: string[] = []
        for (const id of frontier) {
          if (seen.has(id)) continue
          seen.add(id)
          for (const parentId of parents.get(id) ?? []) {
            expect(parentId).not.toBe(personId)
            next.push(parentId)
          }
        }
        frontier = next
      }
    }
  })

  // A shipped fixture that lights up the Health view in red would teach a
  // first-time reader that the app is broken. Nothing here is undecidable
  // either, so the bar is zero findings and not merely zero errors.
  it("reports nothing at all in the Health view", () => {
    const findings = validate({
      people: data.people,
      relationships: data.relationships,
      memberships: data.members,
    })
    expect(findings).toEqual([])
  })

  it("draws a sibling row in birth order", () => {
    const peopleById = new Map(data.people.map((person) => [person.id, person]))
    const childrenByParent = new Map<string, string[]>()
    for (const relationship of data.relationships) {
      if (relationship.type !== "parent-child") continue
      const list = childrenByParent.get(relationship.from) ?? []
      if (!list.includes(relationship.to)) list.push(relationship.to)
      childrenByParent.set(relationship.from, list)
    }

    for (const [parentId, childIds] of childrenByParent) {
      const ordered = sortSiblingIds(childIds, peopleById)
      const byBirth = [...childIds].sort((a, b) =>
        comparePartialDate(peopleById.get(a)?.birth, peopleById.get(b)?.birth)
      )
      expect(ordered, `children of ${parentId}`).toEqual(byBirth)
    }
  })
})

describe("what the sample family is there to show", () => {
  const { unions } = deriveUnions(data.people, data.relationships)

  it("shows a remarriage as two unions on one person", () => {
    const meeras = unions.filter((union) => union.parents.includes("demo-p7"))
    expect(meeras).toHaveLength(2)
    expect(meeras.filter((union) => union.end)).toHaveLength(1)
  })

  it("shows an adoption, a multiple birth, a maiden name and a nickname", () => {
    expect(
      data.relationships.filter((r) => r.subtype === "adopted")
    ).toHaveLength(2)

    const twins = data.people.filter(
      (person) => person.multipleBirthGroup === "demo-twins-1949"
    )
    expect(twins).toHaveLength(2)
    expect(new Set(twins.map((t) => t.birth?.year))).toEqual(new Set([1949]))

    expect(data.people.some((person) => person.maidenName)).toBe(true)
    expect(data.people.some((person) => person.nickname)).toBe(true)
    expect(data.people.some((person) => person.customFields?.length)).toBe(true)
    expect(data.people.some((person) => person.birth?.approximate)).toBe(true)
  })

  it("has somebody presumed living, so redaction has something to hide", () => {
    expect(data.people.some((person) => !person.death)).toBe(true)
  })

  // The notes are the sample's own explanation of itself, and they point at
  // people by name. A [[link]] that missed would render dotted and inert — the
  // app demonstrating its own broken link on first run.
  it("resolves every [[link]] in its notes", () => {
    const index = new NameIndex(data.people)
    const links = data.people.flatMap((person) =>
      person.notes ? wikiLinkNames(person.notes) : []
    )
    expect(links.length).toBeGreaterThan(0)
    for (const name of links) {
      expect(index.resolve(name), name).toMatchObject({ ok: true })
    }
  })

  // parseNotes closes a list on the first line that isn't a bullet, so a
  // wrapped list item silently becomes a list, a stray paragraph and a second
  // list. Pinning the structure is the only way that shows up as a failure
  // rather than as slightly wrong prose nobody reads twice.
  it("renders its own explanation as the blocks it was written as", () => {
    const root = data.people.find((person) => person.id === SAMPLE_ROOT_ID)
    const blocks = parseNotes(root?.notes ?? "")
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
    ])
    const list = blocks[2]
    expect(list.kind === "list" && list.items).toHaveLength(4)
  })

  it("carries no photos, as advertised", () => {
    expect(
      data.people.every((person) => !person.photoId && !person.photoIds?.length)
    ).toBe(true)
  })
})

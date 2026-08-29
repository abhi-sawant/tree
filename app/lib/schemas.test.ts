import { describe, expect, it } from "vitest"

import {
  BackupEnvelopeSchema,
  PartialDateSchema,
  PersonFormSchema,
  PersonSchema,
  RelationshipSchema,
  TreeSchema,
} from "~/lib/schemas"

describe("PartialDateSchema", () => {
  it.each([0, 13])("rejects month %i", (month) => {
    expect(PartialDateSchema.safeParse({ month }).success).toBe(false)
  })

  it.each([0, 32])("rejects day %i", (day) => {
    expect(PartialDateSchema.safeParse({ day }).success).toBe(false)
  })

  it.each([1, 12])("accepts boundary month %i", (month) => {
    expect(PartialDateSchema.safeParse({ month }).success).toBe(true)
  })

  it.each([1, 31])("accepts boundary day %i", (day) => {
    expect(PartialDateSchema.safeParse({ day }).success).toBe(true)
  })
})

describe("PersonSchema", () => {
  it("rejects an empty givenName", () => {
    const result = PersonSchema.safeParse({
      id: "1",
      givenName: "",
      createdAt: 0,
      updatedAt: 0,
    })
    expect(result.success).toBe(false)
  })

  it("accepts a minimal valid person", () => {
    const result = PersonSchema.safeParse({
      id: "1",
      givenName: "Ada",
      createdAt: 0,
      updatedAt: 0,
    })
    expect(result.success).toBe(true)
  })

  it("PersonFormSchema omits id/createdAt/updatedAt", () => {
    const result = PersonFormSchema.safeParse({ givenName: "Ada" })
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty("id")
    expect(result.data).not.toHaveProperty("createdAt")
    expect(result.data).not.toHaveProperty("updatedAt")
  })
})

describe("RelationshipSchema", () => {
  it("rejects a type outside parent-child/spouse", () => {
    const result = RelationshipSchema.safeParse({
      id: "1",
      type: "sibling",
      from: "a",
      to: "b",
    })
    expect(result.success).toBe(false)
  })

  it("accepts a valid parent-child relationship", () => {
    const result = RelationshipSchema.safeParse({
      id: "1",
      type: "parent-child",
      from: "a",
      to: "b",
    })
    expect(result.success).toBe(true)
  })
})

describe("TreeSchema", () => {
  it("rejects an empty name", () => {
    const result = TreeSchema.safeParse({
      id: "1",
      name: "",
      rootPersonId: "root",
      createdAt: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe("BackupEnvelopeSchema", () => {
  function validEnvelope(overrides: Record<string, unknown> = {}) {
    return {
      schema: 1,
      people: [],
      relationships: [],
      trees: [],
      members: [],
      ...overrides,
    }
  }

  it("rejects a schema version other than 1", () => {
    const result = BackupEnvelopeSchema.safeParse(validEnvelope({ schema: 2 }))
    expect(result.success).toBe(false)
  })

  it("defaults photos to [] when omitted", () => {
    const result = BackupEnvelopeSchema.safeParse(validEnvelope())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.photos).toEqual([])
    }
  })

  it("rejects a structurally invalid envelope", () => {
    const result = BackupEnvelopeSchema.safeParse(
      validEnvelope({ people: "not-an-array" })
    )
    expect(result.success).toBe(false)
  })
})

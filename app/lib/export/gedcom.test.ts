import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  buildGedcomText,
  exportGedcom,
  exportGedcomZip,
  planGedcomMedia,
  type GedcomMedia,
} from "~/lib/export/gedcom"
import type { Person, Relationship } from "~/lib/types"

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    givenName: "",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function parentChild(from: string, to: string): Relationship {
  return { id: crypto.randomUUID(), type: "parent-child", from, to }
}

function spouse(
  from: string,
  to: string,
  overrides: Partial<Relationship> = {}
): Relationship {
  return { id: crypto.randomUUID(), type: "spouse", from, to, ...overrides }
}

// Fixture: p-a married p-x (real union, child p-child-a); p-b (placeholder)
// unmarried with p-x (implicit union, child p-child-b) — a remarriage case
// since p-x is shared across both unions; p-a also solely parents
// p-child-solo (no second parent recorded); p-isolated has no relationships
// at all.
const people: Person[] = [
  person({
    id: "p-a",
    givenName: "Alice",
    familyName: "Smith",
    birth: { year: 1950 },
  }),
  person({
    id: "p-b",
    givenName: "Bob",
    familyName: "Jones",
    isPlaceholder: true,
  }),
  person({ id: "p-child-a", givenName: "ChildA" }),
  person({ id: "p-child-b", givenName: "ChildB" }),
  person({ id: "p-child-solo", givenName: "ChildSolo" }),
  person({ id: "p-isolated", givenName: "Isolated" }),
  person({
    id: "p-x",
    givenName: "Xavier",
    familyName: "Root",
    birth: { year: 1948, month: 6, day: 1 },
    death: { year: 2020, approximate: true },
    notes: "Multi-line\nnote here",
  }),
]

const relationships: Relationship[] = [
  spouse("p-a", "p-x", { start: { year: 1980 } }),
  parentChild("p-a", "p-child-a"),
  parentChild("p-x", "p-child-a"),
  parentChild("p-b", "p-child-b"),
  parentChild("p-x", "p-child-b"),
  parentChild("p-a", "p-child-solo"),
]

const EXPECTED_GEDCOM = `0 HEAD
1 SOUR FAMILY_TREE_GENERATOR
2 NAME Family Tree Generator
2 VERS 1.0
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
1 SUBM @SUBM1@
0 @SUBM1@ SUBM
1 NAME Family Tree Generator User
0 @I1@ INDI
1 NAME Alice /Smith/
1 BIRT
2 DATE 1950
1 FAMS @F1@
1 FAMS @F2@
0 @I2@ INDI
1 NAME Bob /Jones/
1 FAMS @F3@
0 @I3@ INDI
1 NAME ChildA //
1 FAMC @F2@
0 @I4@ INDI
1 NAME ChildB //
1 FAMC @F3@
0 @I5@ INDI
1 NAME ChildSolo //
1 FAMC @F1@
0 @I6@ INDI
1 NAME Isolated //
0 @I7@ INDI
1 NAME Xavier /Root/
1 BIRT
2 DATE 1 JUN 1948
1 DEAT
2 DATE ABT 2020
1 NOTE Multi-line
2 CONT note here
1 FAMS @F2@
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I5@
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I7@
1 CHIL @I3@
1 MARR
2 DATE 1980
0 @F3@ FAM
1 HUSB @I2@
1 WIFE @I7@
1 CHIL @I4@
0 TRLR
`

// planGedcomMedia returns a flat list; buildGedcomText wants it grouped, since
// a person can now carry several photos.
function mediaByPerson(plan: GedcomMedia[]): Map<string, GedcomMedia[]> {
  const byPerson = new Map<string, GedcomMedia[]>()
  for (const media of plan) {
    const list = byPerson.get(media.personId) ?? []
    list.push(media)
    byPerson.set(media.personId, list)
  }
  return byPerson
}

describe("buildGedcomText", () => {
  it("produces the exact expected GEDCOM text for a fixture family", () => {
    expect(buildGedcomText(people, relationships)).toBe(EXPECTED_GEDCOM)
  })

  it("omits BIRT/DEAT entirely when no date is recorded", () => {
    const text = buildGedcomText(people, relationships)
    const isolatedRecord = text.split("0 @I6@ INDI")[1].split("\n0 ")[0]
    expect(isolatedRecord).not.toContain("BIRT")
    expect(isolatedRecord).not.toContain("DEAT")
  })

  it("renders a placeholder person with no special tag or marker (D6)", () => {
    const text = buildGedcomText(people, relationships)
    const placeholderRecord = text.split("0 @I2@ INDI")[1].split("\n0 ")[0]
    expect(placeholderRecord).toBe(`
1 NAME Bob /Jones/
1 FAMS @F3@`)
  })

  it("omits MARR entirely for an implicit union", () => {
    const text = buildGedcomText(people, relationships)
    const implicitFamily = text.split("0 @F3@ FAM")[1].split("\n0 ")[0]
    expect(implicitFamily).not.toContain("MARR")
  })

  it("emits a solo-parent family with only HUSB and CHIL, no WIFE", () => {
    const text = buildGedcomText(people, relationships)
    const soloFamily = text.split("0 @F1@ FAM")[1].split("\n0 ")[0]
    expect(soloFamily).not.toContain("WIFE")
    expect(soloFamily).toContain("1 HUSB @I1@")
    expect(soloFamily).toContain("1 CHIL @I5@")
  })

  it("renders an empty surname as GivenName //", () => {
    const text = buildGedcomText(people, relationships)
    expect(text).toContain("1 NAME ChildA //")
  })

  it("produces a minimal valid file (HEAD + TRLR only) for an empty pool", () => {
    const text = buildGedcomText([], [])
    expect(text).toBe(
      `0 HEAD
1 SOUR FAMILY_TREE_GENERATOR
2 NAME Family Tree Generator
2 VERS 1.0
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
1 SUBM @SUBM1@
0 @SUBM1@ SUBM
1 NAME Family Tree Generator User
0 TRLR
`
    )
  })

  it("omits SEX entirely when sex is not recorded", () => {
    const text = buildGedcomText(people, relationships)
    expect(text).not.toContain("1 SEX")
  })

  it("emits SEX between NAME and the events, mapping other to U", () => {
    const text = buildGedcomText(
      [
        person({ id: "p-1", givenName: "Fern", sex: "female" }),
        person({
          id: "p-2",
          givenName: "Mel",
          sex: "male",
          birth: { year: 1900 },
        }),
        person({ id: "p-3", givenName: "Ori", sex: "other" }),
      ],
      []
    )
    expect(text).toContain("0 @I1@ INDI\n1 NAME Fern //\n1 SEX F")
    expect(text).toContain("0 @I2@ INDI\n1 NAME Mel //\n1 SEX M\n1 BIRT")
    expect(text).toContain("0 @I3@ INDI\n1 NAME Ori //\n1 SEX U")
  })

  it("assigns HUSB/WIFE by recorded sex, not by id order", () => {
    // p-a sorts first but is female, so the id-order fallback would have put
    // her in HUSB.
    const text = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Ada", sex: "female" }),
        person({ id: "p-b", givenName: "Ben", sex: "male" }),
        person({ id: "p-c", givenName: "Cass" }),
      ],
      [
        spouse("p-a", "p-b"),
        parentChild("p-a", "p-c"),
        parentChild("p-b", "p-c"),
      ]
    )
    const family = text.split("0 @F1@ FAM")[1].split("\n0 ")[0]
    expect(family).toContain("1 HUSB @I2@")
    expect(family).toContain("1 WIFE @I1@")
  })

  it("falls back to id order when sex cannot decide the pair", () => {
    // Both female, and a couple with sex recorded on neither: in both cases
    // the ascending id sort has to settle it so exports stay reproducible.
    const bothFemale = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Ada", sex: "female" }),
        person({ id: "p-b", givenName: "Bea", sex: "female" }),
        person({ id: "p-c", givenName: "Cass" }),
      ],
      [
        spouse("p-a", "p-b"),
        parentChild("p-a", "p-c"),
        parentChild("p-b", "p-c"),
      ]
    )
    const family = bothFemale.split("0 @F1@ FAM")[1].split("\n0 ")[0]
    expect(family).toContain("1 HUSB @I1@")
    expect(family).toContain("1 WIFE @I2@")

    const neitherRecorded = buildGedcomText(people, relationships)
    expect(neitherRecorded.split("0 @F2@ FAM")[1].split("\n0 ")[0]).toContain(
      "1 HUSB @I1@"
    )
  })

  it("pairs an unrecorded parent against a recorded one by the recorded sex", () => {
    // Only p-b's sex is known. A female known parent must still take WIFE,
    // leaving HUSB for the parent we know nothing about.
    const text = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Ada" }),
        person({ id: "p-b", givenName: "Bea", sex: "female" }),
        person({ id: "p-c", givenName: "Cass" }),
      ],
      [
        spouse("p-a", "p-b"),
        parentChild("p-a", "p-c"),
        parentChild("p-b", "p-c"),
      ]
    )
    const family = text.split("0 @F1@ FAM")[1].split("\n0 ")[0]
    expect(family).toContain("1 HUSB @I1@")
    expect(family).toContain("1 WIFE @I2@")
  })

  it("emits a maiden name as a second NAME, primary name first", () => {
    const text = buildGedcomText(
      [
        person({
          id: "p-1",
          givenName: "Ada",
          familyName: "King",
          maidenName: "Byron",
        }),
      ],
      []
    )
    expect(text).toContain("1 NAME Ada /King/\n1 NAME Ada /Byron/")
  })

  it("skips a maiden name that just repeats the family name", () => {
    const text = buildGedcomText(
      [
        person({
          id: "p-1",
          givenName: "Ada",
          familyName: "Byron",
          maidenName: "Byron",
        }),
      ],
      []
    )
    const record = text.split("0 @I1@ INDI")[1].split("\n0 ")[0]
    expect(record.match(/1 NAME/g)).toHaveLength(1)
  })

  it("does not put a nickname on the NAME line", () => {
    // 5.5.1 has no nickname field, and every importer parses the surname out
    // of NAME — a nickname smuggled in there would corrupt that.
    const text = buildGedcomText(
      [person({ id: "p-1", givenName: "Augusta", nickname: "Ada" })],
      []
    )
    expect(text).not.toContain("Ada")
  })

  it("qualifies FAMC with PEDI when both parent links agree", () => {
    const text = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Ann" }),
        person({ id: "p-b", givenName: "Bob" }),
        person({ id: "p-c", givenName: "Cass" }),
      ],
      [
        spouse("p-a", "p-b"),
        { ...parentChild("p-a", "p-c"), subtype: "adopted" as const },
        { ...parentChild("p-b", "p-c"), subtype: "adopted" as const },
      ]
    )
    expect(text).toContain("1 FAMC @F1@\n2 PEDI adopted")
  })

  it("omits PEDI for subtypes 5.5.1 cannot express", () => {
    const text = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Ann" }),
        person({ id: "p-c", givenName: "Cass" }),
      ],
      [{ ...parentChild("p-a", "p-c"), subtype: "step" as const }]
    )
    expect(text).toContain("1 FAMC @F1@")
    expect(text).not.toContain("PEDI")
  })

  it("omits PEDI when the two parent links disagree", () => {
    const text = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Ann" }),
        person({ id: "p-b", givenName: "Bob" }),
        person({ id: "p-c", givenName: "Cass" }),
      ],
      [
        spouse("p-a", "p-b"),
        parentChild("p-a", "p-c"),
        { ...parentChild("p-b", "p-c"), subtype: "adopted" as const },
      ]
    )
    expect(text).toContain("1 FAMC @F1@")
    expect(text).not.toContain("PEDI")
  })

  it("emits no PEDI for an ordinary biological link", () => {
    expect(buildGedcomText(people, relationships)).not.toContain("PEDI")
  })

  it("appends custom fields to the NOTE block as label: value", () => {
    const text = buildGedcomText(
      [
        person({
          id: "p-1",
          givenName: "Ada",
          notes: "A note",
          customFields: [
            { label: "Occupation", value: "Mathematician" },
            { label: "Residence", value: "London" },
          ],
        }),
      ],
      []
    )
    expect(text).toContain(
      "1 NOTE A note\n2 CONT Occupation: Mathematician\n2 CONT Residence: London"
    )
  })

  it("opens the NOTE block with a custom field when there are no notes", () => {
    const text = buildGedcomText(
      [
        person({
          id: "p-1",
          givenName: "Ada",
          customFields: [{ label: "Occupation", value: "Mathematician" }],
        }),
      ],
      []
    )
    expect(text).toContain("1 NOTE Occupation: Mathematician")
    expect(text).not.toContain("2 CONT")
  })

  it("emits no NOTE at all when neither notes nor custom fields exist", () => {
    const text = buildGedcomText([person({ id: "p-1", givenName: "Ada" })], [])
    const record = text.split("0 @I1@ INDI")[1].split("\n0 ")[0]
    expect(record).not.toContain("NOTE")
  })

  it("silently excludes a malformed 3-parent child without throwing", () => {
    const threeParents: Relationship[] = [
      parentChild("p-a", "p-child-a"),
      parentChild("p-b", "p-child-a"),
      parentChild("p-x", "p-child-a"),
    ]
    const text = buildGedcomText(
      [
        person({ id: "p-a", givenName: "Alice" }),
        person({ id: "p-b", givenName: "Bob" }),
        person({ id: "p-x", givenName: "Xavier" }),
        person({ id: "p-child-a", givenName: "ChildA" }),
      ],
      threeParents
    )
    expect(text).toContain("INDI")
    expect(text).not.toContain("FAMC")
    expect(text).not.toContain("@F1@")
  })
})

afterEach(async () => {
  await Promise.all([db.people.clear(), db.relationships.clear()])
})

describe("exportGedcom", () => {
  it("reads all people/relationships from Dexie and returns a text/plain Blob", async () => {
    await db.people.bulkAdd([
      person({ id: "seed-a", givenName: "Seed A" }),
      person({ id: "seed-b", givenName: "Seed B" }),
    ])

    const blob = await exportGedcom()
    expect(blob.type).toBe("text/plain;charset=utf-8")

    const text = await blob.text()
    expect(text).toContain("0 HEAD")
    expect(text).toContain("0 TRLR")
    expect(text.match(/ INDI/g)).toHaveLength(2)
  })

  it("includes every person regardless of tree membership (D14)", async () => {
    const treeId = crypto.randomUUID()
    await db.people.bulkAdd([
      person({ id: "member-a", givenName: "MemberA" }),
      person({ id: "no-tree-b", givenName: "NoTreeB" }),
    ])
    await db.members.add({ treeId, personId: "member-a" })

    const text = await (await exportGedcom()).text()
    expect(text).toContain("MemberA")
    expect(text).toContain("NoTreeB")

    await db.members.clear()
  })
})

describe("planGedcomMedia", () => {
  it("names each media file after the person's own xref", () => {
    const withPhotos = [
      person({ id: "p-a", givenName: "Alice", photoId: "photo-a" }),
      person({ id: "p-b", givenName: "Bob", photoId: "photo-b" }),
    ]
    const plan = planGedcomMedia(
      withPhotos,
      new Map([
        ["photo-a", "image/jpeg"],
        ["photo-b", "image/png"],
      ])
    )

    // Ids sort ascending, so p-a is @I1@ and p-b is @I2@.
    expect(plan).toEqual([
      {
        personId: "p-a",
        photoId: "photo-a",
        path: "media/I1.jpg",
        form: "jpg",
        title: "Alice",
      },
      {
        personId: "p-b",
        photoId: "photo-b",
        path: "media/I2.png",
        form: "png",
        title: "Bob",
      },
    ])
  })

  it("skips people with no photo, and photos missing from the pool", () => {
    const plan = planGedcomMedia(
      [
        person({ id: "p-a", givenName: "Alice" }),
        person({ id: "p-b", givenName: "Bob", photoId: "orphaned" }),
      ],
      new Map()
    )

    expect(plan).toEqual([])
  })

  // The one real coupling risk: paths are planned separately from the text, so
  // if the two ever disagreed on numbering, photos would attach to the wrong
  // people. Both sort ids ascending — pin that.
  it("agrees with buildGedcomText's xref numbering", () => {
    const withPhotos = people.map((p) => ({ ...p, photoId: `photo-${p.id}` }))
    const mimes = new Map(withPhotos.map((p) => [p.photoId!, "image/jpeg"]))
    const plan = planGedcomMedia(withPhotos, mimes)
    const text = buildGedcomText(withPhotos, relationships, mediaByPerson(plan))

    for (const media of plan) {
      const stem = media.path.replace("media/", "").replace(".jpg", "")
      const record = text.split(`0 @${stem}@ INDI\n`)[1].split("\n0 ")[0]
      expect(record).toContain(`2 FILE ${media.path}`)
    }
  })
})

describe("planGedcomMedia with several photos per person", () => {
  it("numbers a person's later photos and keeps the first path unchanged", () => {
    const plan = planGedcomMedia(
      [
        person({
          id: "p-a",
          givenName: "Alice",
          photoIds: ["ph-1", "ph-2", "ph-3"],
        }),
      ],
      new Map([
        ["ph-1", "image/jpeg"],
        ["ph-2", "image/png"],
        ["ph-3", "image/jpeg"],
      ])
    )

    expect(plan.map((media) => media.path)).toEqual([
      "media/I1.jpg",
      "media/I1-2.png",
      "media/I1-3.jpg",
    ])
    expect(plan.map((media) => media.photoId)).toEqual(["ph-1", "ph-2", "ph-3"])
  })

  // Numbering counts what resolved, not the person's whole list: a gap would
  // make the same tree export under different filenames depending on which
  // blobs happened to be readable.
  it("leaves no gap in the numbering when a photo's blob is missing", () => {
    const plan = planGedcomMedia(
      [
        person({
          id: "p-a",
          givenName: "Alice",
          photoIds: ["ph-1", "gone", "ph-3"],
        }),
      ],
      new Map([
        ["ph-1", "image/jpeg"],
        ["ph-3", "image/jpeg"],
      ])
    )

    expect(plan.map((media) => media.path)).toEqual([
      "media/I1.jpg",
      "media/I1-2.jpg",
    ])
  })

  it("emits one OBJE block per photo, in gallery order", () => {
    const withPhotos = [
      person({
        id: "p-a",
        givenName: "Alice",
        familyName: "Smith",
        photoIds: ["ph-1", "ph-2"],
      }),
    ]
    const plan = planGedcomMedia(
      withPhotos,
      new Map([
        ["ph-1", "image/jpeg"],
        ["ph-2", "image/jpeg"],
      ])
    )

    expect(buildGedcomText(withPhotos, [], mediaByPerson(plan))).toContain(
      [
        "1 OBJE",
        "2 FILE media/I1.jpg",
        "3 FORM jpg",
        "2 TITL Alice Smith",
        "1 OBJE",
        "2 FILE media/I1-2.jpg",
        "3 FORM jpg",
        "2 TITL Alice Smith",
      ].join("\n")
    )
  })
})

describe("buildGedcomText with media", () => {
  it("emits the embedded OBJE block last in the INDI record", () => {
    const withPhoto = [
      person({
        id: "p-a",
        givenName: "Alice",
        familyName: "Smith",
        photoId: "photo-a",
      }),
    ]
    const plan = planGedcomMedia(
      withPhoto,
      new Map([["photo-a", "image/jpeg"]])
    )
    const text = buildGedcomText(withPhoto, [], mediaByPerson(plan))

    expect(text).toContain(
      [
        "0 @I1@ INDI",
        "1 NAME Alice /Smith/",
        "1 OBJE",
        "2 FILE media/I1.jpg",
        "3 FORM jpg",
        "2 TITL Alice Smith",
      ].join("\n")
    )
  })

  // The media argument is optional so every existing call site and golden-text
  // assertion keeps working untouched.
  it("is byte-identical to the no-media output when media is omitted", () => {
    expect(buildGedcomText(people, relationships, new Map())).toBe(
      buildGedcomText(people, relationships)
    )
  })
})

describe("exportGedcomZip", () => {
  afterEach(async () => {
    await Promise.all([
      db.people.clear(),
      db.relationships.clear(),
      db.photos.clear(),
    ])
  })

  it("packs the .ged at the archive root beside its media/ folder", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 8, 9])
    await db.photos.add({
      id: "photo-a",
      mime: "image/jpeg",
      blob: new Blob([bytes], { type: "image/jpeg" }),
    })
    await db.people.add(
      person({ id: "p-a", givenName: "Alice", photoId: "photo-a" })
    )

    const zip = await exportGedcomZip(new Date("2026-08-31T10:00:00Z"))
    const { unzipSync, strFromU8 } = await import("fflate")
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()))

    // Relative FILE paths resolve against the directory holding the .ged, so
    // both must sit at the archive root.
    expect(Object.keys(entries).sort()).toEqual([
      "family-tree-2026-08-31.ged",
      "media/I1.jpg",
    ])
    expect(entries["media/I1.jpg"]).toEqual(bytes)
    expect(strFromU8(entries["family-tree-2026-08-31.ged"])).toContain(
      "2 FILE media/I1.jpg"
    )
  })
})

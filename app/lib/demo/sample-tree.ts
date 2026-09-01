// The bundled sample family: four generations of invented people, so somebody
// opening the app for the first time can see what a filled-in tree looks like
// before typing a single name of their own.
//
// Pure and dependency-free, and the same export the tests use as a fixture.
// That is the point of building it this way round: a fixture that ships is a
// fixture that gets looked at, so a rule that quietly stops holding — a
// validator finding on the demo data, a relationship the graph layer would
// refuse — fails a test instead of greeting the next new user.
//
// Two things it deliberately does not carry:
//
// **Ids are fixed and prefixed**, not random. That buys three things at once:
// loading twice restores the sample rather than duplicating it, removing it is
// an exact set of rows rather than a guess, and a test can name a person. The
// alternative — an `isDemo` flag on Person — would ride in every backup and
// every GEDCOM export from now on to record something that is only ever true
// of the sample's own rows in one browser.
//
// **No photos.** Bundling image bytes would grow an offline install for a set
// of invented faces, and generating placeholder portraits would be inventing
// likenesses of people who don't exist. The photo wall therefore reports that
// none of the sample has a photo, which is true.

import type { Person, Relationship, Tree, TreeMember } from "~/lib/types"

export const DEMO_ID_PREFIX = "demo-"

export function isDemoId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX)
}

export const SAMPLE_TREE_ID = "demo-tree"
// Says "sample" in the sidebar, in the topbar and on every export, so it can
// never be mistaken for the reader's own family halfway through an afternoon.
export const SAMPLE_TREE_NAME = "Sample family (demo)"

// The root, and the person whose notes explain what the rest of it is showing.
export const SAMPLE_ROOT_ID = "demo-p1"

export interface SampleTreeData {
  people: Person[]
  relationships: Relationship[]
  tree: Tree
  members: TreeMember[]
}

// Everything but the timestamps, which are stamped in declaration order below.
type SamplePerson = Omit<Person, "createdAt" | "updatedAt">

// Declared eldest-first within each sibling row, because createdAt is what
// orderFamilyGraph sorts a row by and the stamps below follow this order. A
// sibling declared out of turn would draw out of birth order.
const SAMPLE_PEOPLE: SamplePerson[] = [
  // ── Generation 1 ────────────────────────────────────────────────────────
  {
    id: SAMPLE_ROOT_ID,
    givenName: "Ravi",
    familyName: "Sawant",
    sex: "male",
    birth: { year: 1888, month: 3, day: 12 },
    death: { year: 1961, month: 11, day: 4 },
    customFields: [
      { label: "Occupation", value: "Millwright" },
      { label: "Born in", value: "Ratnagiri" },
    ],
    // One line per list item, because parseNotes closes a list on the first
    // line that isn't a bullet — a wrapped item would render as two blocks.
    // Paragraphs may wrap; they are joined with a space.
    notes: [
      "## This family is invented",
      "",
      "Nobody here is real. Remove the whole sample from **Settings → Sample",
      "family** whenever you like — it takes nothing of yours with it.",
      "",
      "- *c. 1892* on [[Sushila Sawant]] is a year nobody wrote down exactly.",
      "- The dashed line down to [[Arjun Sawant]] is an adoption.",
      "- [[Meera Nair]] married twice; the hollow ring is the ended marriage.",
      "- [[Rohan Sawant]] and [[Latha Sawant]] are twins, drawn side by side.",
    ].join("\n"),
  },
  {
    id: "demo-p2",
    givenName: "Sushila",
    familyName: "Sawant",
    maidenName: "Deshpande",
    sex: "female",
    // Approximate on purpose: the commonest shape of a real genealogy date, and
    // the one the app widens rather than pretends to know.
    birth: { year: 1892, approximate: true },
    death: { year: 1978 },
  },

  // ── Generation 2 ────────────────────────────────────────────────────────
  {
    id: "demo-p3",
    givenName: "Anil",
    familyName: "Sawant",
    nickname: "Bapu",
    sex: "male",
    birth: { year: 1915, month: 7, day: 22 },
    death: { year: 1990, month: 1, day: 30 },
    customFields: [{ label: "Occupation", value: "Schoolmaster" }],
    notes: "Taught at the village school for thirty-one years.",
  },
  {
    id: "demo-p4",
    givenName: "Kamala",
    familyName: "Sawant",
    maidenName: "Iyer",
    sex: "female",
    birth: { year: 1920, month: 5, day: 3 },
    death: { year: 2004 },
  },
  {
    id: "demo-p5",
    givenName: "Vijaya",
    familyName: "Pereira",
    maidenName: "Sawant",
    sex: "female",
    birth: { year: 1918 },
    death: { year: 2001 },
  },
  {
    id: "demo-p6",
    givenName: "Thomas",
    familyName: "Pereira",
    sex: "male",
    birth: { year: 1916 },
    death: { year: 1989 },
  },

  // ── Generation 3 ────────────────────────────────────────────────────────
  {
    id: "demo-p7",
    givenName: "Meera",
    familyName: "Nair",
    maidenName: "Sawant",
    sex: "female",
    birth: { year: 1946, month: 9, day: 14 },
  },
  {
    id: "demo-p8",
    givenName: "Rohan",
    familyName: "Sawant",
    sex: "male",
    birth: { year: 1949, month: 6, day: 8 },
    multipleBirthGroup: "demo-twins-1949",
  },
  {
    id: "demo-p9",
    givenName: "Latha",
    familyName: "Sawant",
    sex: "female",
    birth: { year: 1949, month: 6, day: 8 },
    multipleBirthGroup: "demo-twins-1949",
  },
  {
    id: "demo-p10",
    givenName: "Suresh",
    familyName: "Nair",
    sex: "male",
    birth: { year: 1944 },
  },
  {
    id: "demo-p11",
    givenName: "David",
    familyName: "Fernandes",
    sex: "male",
    birth: { year: 1943 },
  },
  {
    id: "demo-p12",
    givenName: "Priya",
    familyName: "Sawant",
    maidenName: "Menon",
    sex: "female",
    birth: { year: 1952 },
  },

  // ── Generation 4 ────────────────────────────────────────────────────────
  {
    id: "demo-p13",
    givenName: "Anita",
    familyName: "Nair",
    sex: "female",
    birth: { year: 1972, month: 2, day: 19 },
  },
  {
    id: "demo-p14",
    givenName: "Karan",
    familyName: "Nair",
    sex: "male",
    birth: { year: 1975 },
  },
  {
    id: "demo-p15",
    givenName: "Arjun",
    familyName: "Sawant",
    sex: "male",
    birth: { year: 1980 },
    notes: "Adopted in 1981 — the parent-child line to him is drawn dashed.",
  },
]

// Relationship ids are fixed for the same reason person ids are: a second load
// has to overwrite these rows rather than add a duplicate marriage.
const SAMPLE_RELATIONSHIPS: Relationship[] = [
  {
    id: "demo-r1",
    type: "spouse",
    from: "demo-p1",
    to: "demo-p2",
    start: { year: 1911 },
  },
  { id: "demo-r2", type: "parent-child", from: "demo-p1", to: "demo-p3" },
  { id: "demo-r3", type: "parent-child", from: "demo-p2", to: "demo-p3" },
  { id: "demo-r4", type: "parent-child", from: "demo-p1", to: "demo-p5" },
  { id: "demo-r5", type: "parent-child", from: "demo-p2", to: "demo-p5" },

  {
    id: "demo-r6",
    type: "spouse",
    from: "demo-p3",
    to: "demo-p4",
    start: { year: 1943, month: 2, day: 3 },
  },
  {
    id: "demo-r7",
    type: "spouse",
    from: "demo-p5",
    to: "demo-p6",
    start: { year: 1940 },
  },

  { id: "demo-r8", type: "parent-child", from: "demo-p3", to: "demo-p7" },
  { id: "demo-r9", type: "parent-child", from: "demo-p4", to: "demo-p7" },
  { id: "demo-r10", type: "parent-child", from: "demo-p3", to: "demo-p8" },
  { id: "demo-r11", type: "parent-child", from: "demo-p4", to: "demo-p8" },
  { id: "demo-r12", type: "parent-child", from: "demo-p3", to: "demo-p9" },
  { id: "demo-r13", type: "parent-child", from: "demo-p4", to: "demo-p9" },

  // Ended, so the couple's line draws dashed and their union ring hollow.
  {
    id: "demo-r14",
    type: "spouse",
    from: "demo-p7",
    to: "demo-p10",
    start: { year: 1969, month: 4, day: 5 },
    end: { year: 1981 },
  },
  // The remarriage. Two unions on one person is the case a family tree has to
  // draw and a pedigree chart cannot.
  {
    id: "demo-r15",
    type: "spouse",
    from: "demo-p7",
    to: "demo-p11",
    start: { year: 1985, month: 8, day: 30 },
  },
  {
    id: "demo-r16",
    type: "spouse",
    from: "demo-p8",
    to: "demo-p12",
    start: { year: 1975 },
  },

  { id: "demo-r17", type: "parent-child", from: "demo-p7", to: "demo-p13" },
  { id: "demo-r18", type: "parent-child", from: "demo-p10", to: "demo-p13" },
  { id: "demo-r19", type: "parent-child", from: "demo-p7", to: "demo-p14" },
  { id: "demo-r20", type: "parent-child", from: "demo-p10", to: "demo-p14" },

  {
    id: "demo-r21",
    type: "parent-child",
    from: "demo-p8",
    to: "demo-p15",
    subtype: "adopted",
  },
  {
    id: "demo-r22",
    type: "parent-child",
    from: "demo-p12",
    to: "demo-p15",
    subtype: "adopted",
  },
]

// How many people the sample holds. Exported so the copy offering it can say
// the number without a second person having to remember to update it — a
// "fifteen invented people" that had drifted to sixteen would be the app being
// wrong about the one thing on screen the reader can count.
export const SAMPLE_PERSON_COUNT = SAMPLE_PEOPLE.length

// One millisecond apart, in declaration order, for the reason addFamily spaces
// its children out: orderFamilyGraph breaks a createdAt tie on the id, and
// fifteen people sharing one timestamp would lay a sibling row out in an order
// that has nothing to do with who was born first.
const STAMP_SPACING_MS = 1

export function sampleTreeData(now: number = Date.now()): SampleTreeData {
  const people: Person[] = SAMPLE_PEOPLE.map((person, index) => ({
    ...person,
    createdAt: now + index * STAMP_SPACING_MS,
    updatedAt: now + index * STAMP_SPACING_MS,
  }))

  return {
    people,
    // Copied rather than handed out, so a caller that mutates what it is given
    // cannot change what the next load writes.
    relationships: SAMPLE_RELATIONSHIPS.map((relationship) => ({
      ...relationship,
    })),
    tree: {
      id: SAMPLE_TREE_ID,
      name: SAMPLE_TREE_NAME,
      rootPersonId: SAMPLE_ROOT_ID,
      createdAt: now,
    },
    // No x/y: the sample should show what the automatic layout does with a real
    // family, not a set of positions chosen by hand on somebody else's screen.
    members: people.map((person) => ({
      treeId: SAMPLE_TREE_ID,
      personId: person.id,
    })),
  }
}

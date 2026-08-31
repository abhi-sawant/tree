import { deriveUnions } from "~/lib/graph/derive-unions"
import { sharedParentLinkSubtype } from "~/lib/graph/parent-links"
import { partialDateToGedcomDate } from "~/lib/partial-date"
import { db } from "~/lib/db/db"
import { blobToBytes, zipEntries, type ZipEntries } from "~/lib/export/archive"
import { gedcomFilename } from "~/lib/export/filenames"
import { extensionForMime, gedcomFormForExtension } from "~/lib/export/mime"
import type {
  ParentChildSubtype,
  PartialDate,
  Person,
  Relationship,
  Sex,
} from "~/lib/types"

export const GEDCOM_MEDIA_DIR = "media"

export interface GedcomMedia {
  personId: string
  photoId: string
  path: string // "media/I3.jpg", relative to the .ged at the archive root
  form: string // GEDCOM MULTIMEDIA_FORMAT, e.g. "jpg"
  title: string
}

const HEAD_LINES = [
  "0 HEAD",
  "1 SOUR FAMILY_TREE_GENERATOR",
  "2 NAME Family Tree Generator",
  "2 VERS 1.0",
  "1 GEDC",
  "2 VERS 5.5.1",
  "2 FORM LINEAGE-LINKED",
  "1 CHAR UTF-8",
  "1 SUBM @SUBM1@",
  "0 @SUBM1@ SUBM",
  "1 NAME Family Tree Generator User",
]

interface FamilyGroup {
  key: string
  // One entry for a solo-parent group (no recorded spouse — HUSB only),
  // two for a union (sorted ascending: lower id -> HUSB, higher id -> WIFE).
  parents: string[]
  children: string[]
  hasMarriageEvidence: boolean
  marriageDate?: PartialDate
}

// Assigns sequential xref ids (@I1@, @F1@, ...) by sorting the input ids
// ascending, so output is deterministic regardless of source array order.
function assignXrefs(ids: string[], prefix: string): Map<string, string> {
  const sorted = [...ids].sort()
  const map = new Map<string, string>()
  sorted.forEach((id, index) => map.set(id, `@${prefix}${index + 1}@`))
  return map
}

// GEDCOM 5.5.1 gives FAM two sex-specific parent slots, HUSB and WIFE, with no
// neutral alternative — so the pair has to be ordered by recorded sex for the
// tags to mean what they claim. Where sex can't decide it (unrecorded on either
// side, "other", or both the same), fall back to the ascending id sort so the
// output stays deterministic across exports.
function orderParentsForFamily(
  parentIds: string[],
  peopleById: ReadonlyMap<string, Person>
): string[] {
  const sorted = [...parentIds].sort()
  if (sorted.length !== 2) return sorted

  const [a, b] = sorted
  const sexA = peopleById.get(a)?.sex
  const sexB = peopleById.get(b)?.sex

  if (sexA === "male" && sexB !== "male") return [a, b]
  if (sexB === "male" && sexA !== "male") return [b, a]
  if (sexA === "female" && sexB !== "female") return [b, a]
  if (sexB === "female" && sexA !== "female") return [a, b]
  return sorted
}

// deriveUnions groups two-parent children into UnionNodes but leaves
// single-parent children as a flat list — group those by parent here so
// every recorded parent-child link ends up in exactly one FamilyGroup.
function buildFamilyGroups(
  people: Person[],
  relationships: Relationship[]
): FamilyGroup[] {
  const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
    people,
    relationships
  )
  const peopleById = new Map(people.map((person) => [person.id, person]))

  const groups: FamilyGroup[] = unions.map((union) => ({
    key: union.id,
    parents: orderParentsForFamily([...union.parents], peopleById),
    children: twoParentLinks
      .filter((link) => link.unionId === union.id)
      .map((link) => link.childId)
      .sort(),
    hasMarriageEvidence: union.kind === "real",
    marriageDate: union.start,
  }))

  const soloChildrenByParent = new Map<string, string[]>()
  for (const link of singleParentLinks) {
    const children = soloChildrenByParent.get(link.parentId) ?? []
    children.push(link.childId)
    soloChildrenByParent.set(link.parentId, children)
  }
  for (const [parentId, children] of soloChildrenByParent) {
    groups.push({
      key: `solo:${parentId}`,
      parents: [parentId],
      children: children.sort(),
      hasMarriageEvidence: false,
    })
  }

  return groups.sort((a, b) => a.key.localeCompare(b.key))
}

function formatGedcomName(person: Person, surname?: string): string {
  return `${person.givenName} /${surname ?? person.familyName ?? ""}/`
}

// 5.5.1 allows an INDI to carry several NAME structures, so a maiden name goes
// out as a second one; importers treat the first as primary, which keeps the
// name the family uses in front. Nickname is not emitted: 5.5.1 has no field
// for it (NICK arrives in GEDCOM 7), and smuggling it into NAME would corrupt
// the surname parsing every importer does on that line.
function nameLines(person: Person): string[] {
  const lines = [`1 NAME ${formatGedcomName(person)}`]
  if (person.maidenName && person.maidenName !== person.familyName) {
    lines.push(`1 NAME ${formatGedcomName(person, person.maidenName)}`)
  }
  return lines
}

// A bare BIRT/DEAT tag with no DATE would assert the event happened with an
// unknown date — but Person has no separate "known deceased" flag, so an
// unresolvable date must omit the event entirely rather than assert it.
function dateEventLines(tag: string, date?: PartialDate): string[] {
  const gedcomDate = partialDateToGedcomDate(date)
  return gedcomDate ? [`1 ${tag}`, `2 DATE ${gedcomDate}`] : []
}

// SEX is optional in 5.5.1, which admits only M, F and U. An unrecorded sex is
// omitted rather than written as U, for the same reason dateEventLines omits a
// bare BIRT: absent data must not be exported as an assertion. "other" has no
// 5.5.1 representation and maps to U — recorded but undetermined is the closest
// the version allows (GEDCOM 7 adds X).
function sexLines(sex?: Sex): string[] {
  if (!sex) return []
  const code = sex === "male" ? "M" : sex === "female" ? "F" : "U"
  return [`1 SEX ${code}`]
}

// Custom fields ride along in the NOTE block as "label: value" lines rather
// than inventing non-standard tags for them: an underscore-prefixed extension
// tag would be dropped or flagged by other genealogy tools, while a note is
// something every importer keeps and every reader can read.
function noteLines(person: Person): string[] {
  const lines = [
    ...(person.notes ? person.notes.split("\n") : []),
    ...(person.customFields ?? []).map(
      ({ label, value }) => `${label}: ${value}`
    ),
  ]
  if (lines.length === 0) return []
  const [first, ...rest] = lines
  return [`1 NOTE ${first}`, ...rest.map((line) => `2 CONT ${line}`)]
}

// The embedded MULTIMEDIA_LINK form, not a top-level OBJE record with a
// pointer: a person has at most one photo (Person.photoId is a scalar) and
// photos are never shared between individuals, so the pointer form's only
// advantage doesn't apply here. Emitting both forms would make importers
// create duplicate media items. Note TITL sits under OBJE at level 2 in this
// form — it moves under FILE only in the top-level record form.
function mediaLines(media?: GedcomMedia): string[] {
  if (!media) return []
  return [
    "1 OBJE",
    `2 FILE ${media.path}`,
    `3 FORM ${media.form}`,
    ...(media.title ? [`2 TITL ${media.title}`] : []),
  ]
}

function emitIndividual(
  person: Person,
  xref: string,
  famcXref: string | undefined,
  famsXrefs: string[],
  famcGroup: FamilyGroup | undefined,
  relationships: Relationship[],
  media?: GedcomMedia
): string[] {
  return [
    `0 ${xref} INDI`,
    ...nameLines(person),
    ...sexLines(person.sex),
    ...dateEventLines("BIRT", person.birth),
    ...dateEventLines("DEAT", person.death),
    ...noteLines(person),
    ...famcLines(famcXref, person, famcGroup, relationships),
    ...famsXrefs.map((famsXref) => `1 FAMS ${famsXref}`),
    // Last in the INDI record, matching the 5.5.1 substructure order.
    ...mediaLines(media),
  ]
}

// PEDI qualifies a child's FAMC link. 5.5.1 defines only adopted, birth, foster
// and sealing, so "step" and "guardian" have nothing to map to and are omitted
// rather than smuggled through as a non-standard value; "biological" is left
// implicit, matching every other omit-what-is-the-default choice in this writer.
const PEDI_BY_SUBTYPE: Partial<Record<ParentChildSubtype, string>> = {
  adopted: "adopted",
  foster: "foster",
}

function famcLines(
  famcXref: string | undefined,
  person: Person,
  group: FamilyGroup | undefined,
  relationships: Relationship[]
): string[] {
  if (!famcXref) return []
  const subtype = group
    ? sharedParentLinkSubtype(relationships, person.id, group.parents)
    : undefined
  const pedi = subtype ? PEDI_BY_SUBTYPE[subtype] : undefined
  return pedi
    ? [`1 FAMC ${famcXref}`, `2 PEDI ${pedi}`]
    : [`1 FAMC ${famcXref}`]
}

function emitFamily(
  familyXref: string,
  group: FamilyGroup,
  personXrefs: Map<string, string>
): string[] {
  const [husb, wife] = group.parents
  const lines = [
    `0 ${familyXref} FAM`,
    `1 HUSB ${personXrefs.get(husb)}`,
    ...(wife ? [`1 WIFE ${personXrefs.get(wife)}`] : []),
    ...group.children.map((childId) => `1 CHIL ${personXrefs.get(childId)}`),
  ]
  if (group.hasMarriageEvidence) {
    lines.push("1 MARR")
    const gedcomDate = partialDateToGedcomDate(group.marriageDate)
    if (gedcomDate) lines.push(`2 DATE ${gedcomDate}`)
  }
  return lines
}

export function buildGedcomText(
  people: Person[],
  relationships: Relationship[],
  media?: ReadonlyMap<string, GedcomMedia>
): string {
  const personXrefs = assignXrefs(
    people.map((person) => person.id),
    "I"
  )
  const familyGroups = buildFamilyGroups(people, relationships)
  const familyXrefs = assignXrefs(
    familyGroups.map((group) => group.key),
    "F"
  )

  // A child appears in at most one FamilyGroup as a child (D7 caps parents at
  // 2), so FAMC is a plain map. FAMS lists accumulate in familyGroups' order,
  // which is already ascending by xref (both are sorted by the same key).
  const famcByPerson = new Map<string, string>()
  const famcGroupByPerson = new Map<string, FamilyGroup>()
  const famsByPerson = new Map<string, string[]>()
  for (const group of familyGroups) {
    const familyXref = familyXrefs.get(group.key)!
    for (const parentId of group.parents) {
      const famsXrefs = famsByPerson.get(parentId) ?? []
      famsXrefs.push(familyXref)
      famsByPerson.set(parentId, famsXrefs)
    }
    for (const childId of group.children) {
      famcByPerson.set(childId, familyXref)
      famcGroupByPerson.set(childId, group)
    }
  }

  const sortedPeople = [...people].sort((a, b) => a.id.localeCompare(b.id))
  const individualLines = sortedPeople.flatMap((person) =>
    emitIndividual(
      person,
      personXrefs.get(person.id)!,
      famcByPerson.get(person.id),
      famsByPerson.get(person.id) ?? [],
      famcGroupByPerson.get(person.id),
      relationships,
      media?.get(person.id)
    )
  )

  const familyLines = familyGroups.flatMap((group) =>
    emitFamily(familyXrefs.get(group.key)!, group, personXrefs)
  )

  return (
    [...HEAD_LINES, ...individualLines, ...familyLines, "0 TRLR"].join("\n") +
    "\n"
  )
}

export async function exportGedcom(): Promise<Blob> {
  const [people, relationships] = await Promise.all([
    db.people.toArray(),
    db.relationships.toArray(),
  ])

  return new Blob([buildGedcomText(people, relationships)], {
    type: "text/plain;charset=utf-8",
  })
}

function displayName(person: Person): string {
  return [person.givenName, person.familyName].filter(Boolean).join(" ")
}

// Pure, and deliberately assigns xrefs the same way buildGedcomText does (both
// sort ids ascending), so a media path's stem always names the INDI it hangs
// off. The stem is the xref rather than the photo's UUID: it keeps the FILE
// value inside 5.5.1's nominal 30-character limit, and doesn't leak internal
// ids into a file the user hands to third parties.
export function planGedcomMedia(
  people: Person[],
  photoMimes: ReadonlyMap<string, string>
): GedcomMedia[] {
  const personXrefs = assignXrefs(
    people.map((person) => person.id),
    "I"
  )

  const media: GedcomMedia[] = []
  for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
    const mime = person.photoId && photoMimes.get(person.photoId)
    if (!person.photoId || !mime) continue
    const stem = personXrefs.get(person.id)!.replaceAll("@", "")
    const extension = extensionForMime(mime)
    media.push({
      personId: person.id,
      photoId: person.photoId,
      path: `${GEDCOM_MEDIA_DIR}/${stem}.${extension}`,
      form: gedcomFormForExtension(extension),
      title: displayName(person),
    })
  }
  return media
}

// The .ged sits at the archive root beside media/, because importers resolve a
// relative FILE path against the directory holding the .ged.
export async function exportGedcomZip(now: Date = new Date()): Promise<Blob> {
  const [people, relationships, photos] = await Promise.all([
    db.people.toArray(),
    db.relationships.toArray(),
    db.photos.toArray(),
  ])

  const photosById = new Map(photos.map((photo) => [photo.id, photo]))
  const plan = planGedcomMedia(
    people,
    new Map(photos.map((photo) => [photo.id, photo.mime]))
  )

  const entries: ZipEntries = {}
  for (const media of plan) {
    const photo = photosById.get(media.photoId)!
    entries[media.path] = [await blobToBytes(photo.blob), 0]
  }

  const text = buildGedcomText(
    people,
    relationships,
    new Map(plan.map((media) => [media.personId, media]))
  )
  entries[gedcomFilename(now)] = [new TextEncoder().encode(text), 6]

  return zipEntries(entries, now)
}

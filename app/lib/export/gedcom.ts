import { deriveUnions } from "~/lib/graph/derive-unions"
import { partialDateToGedcomDate } from "~/lib/partial-date"
import { db } from "~/lib/db/db"
import type { PartialDate, Person, Relationship } from "~/lib/types"

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

  const groups: FamilyGroup[] = unions.map((union) => ({
    key: union.id,
    parents: [...union.parents].sort(),
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

function formatGedcomName(person: Person): string {
  return `${person.givenName} /${person.familyName ?? ""}/`
}

// A bare BIRT/DEAT tag with no DATE would assert the event happened with an
// unknown date — but Person has no separate "known deceased" flag, so an
// unresolvable date must omit the event entirely rather than assert it.
function dateEventLines(tag: string, date?: PartialDate): string[] {
  const gedcomDate = partialDateToGedcomDate(date)
  return gedcomDate ? [`1 ${tag}`, `2 DATE ${gedcomDate}`] : []
}

function noteLines(notes?: string): string[] {
  if (!notes) return []
  const [first, ...rest] = notes.split("\n")
  return [`1 NOTE ${first}`, ...rest.map((line) => `2 CONT ${line}`)]
}

function emitIndividual(
  person: Person,
  xref: string,
  famcXref: string | undefined,
  famsXrefs: string[]
): string[] {
  return [
    `0 ${xref} INDI`,
    `1 NAME ${formatGedcomName(person)}`,
    ...dateEventLines("BIRT", person.birth),
    ...dateEventLines("DEAT", person.death),
    ...noteLines(person.notes),
    ...(famcXref ? [`1 FAMC ${famcXref}`] : []),
    ...famsXrefs.map((famsXref) => `1 FAMS ${famsXref}`),
  ]
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
  relationships: Relationship[]
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
    }
  }

  const sortedPeople = [...people].sort((a, b) => a.id.localeCompare(b.id))
  const individualLines = sortedPeople.flatMap((person) =>
    emitIndividual(
      person,
      personXrefs.get(person.id)!,
      famcByPerson.get(person.id),
      famsByPerson.get(person.id) ?? []
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

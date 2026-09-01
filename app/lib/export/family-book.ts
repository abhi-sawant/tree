import { notesToPlainText } from "~/lib/notes/markdown"
import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId } from "~/lib/person-photos"
import { comparePartialDate, formatPartialDate } from "~/lib/partial-date"
import { subtypeOf } from "~/lib/graph/parent-links"
import type { Person, Relationship, Sex } from "~/lib/types"

// The book a person actually hands to a relative: one page each, with a face,
// the dates, who they belonged to and whatever was written about them.
//
// Deliberately not a rendering of the canvas. FUTURE-SCOPE §7's tiled-canvas
// PDF is a hard layout problem with a poor answer — a wall chart chopped into
// A4 squares is unreadable at both ends, unreadable as a whole and unreadable
// as a page. A page per person sidesteps it entirely and is the form family
// history has been printed in for a century.
//
// This module is pure and knows nothing about jsPDF: it decides what is on each
// page and in what order, and family-book-pdf.ts decides where on the paper it
// lands. That split is what makes the content testable without rendering a PDF.

const SEX_LABEL: Record<Sex, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
}

export interface BookFact {
  label: string
  value: string
}

export interface BookRelation {
  personId?: string
  // "Anil Sawant" — already assembled through personDisplayName, so the book
  // and the screen name people the same way.
  name: string
  // The parenthetical after the name: dates, and how the link came about.
  detail?: string
}

export interface BookRelationGroup {
  heading: string
  entries: BookRelation[]
}

export interface BookPage {
  personId: string
  name: string
  // Maiden name and nickname, as one line, when either differs from the name
  // above. Left out entirely when there is nothing to say.
  alsoKnownAs?: string
  lifespan: string
  facts: BookFact[]
  relations: BookRelationGroup[]
  // The note, flattened to plain lines. Markdown markers and [[link]] brackets
  // are gone: on paper there is nothing to click and nothing to bold reliably.
  notes: string[]
  documents: string[]
  coverPhotoId?: string
}

export interface FamilyBook {
  title: string
  // Deliberately unnumbered. Page numbers belong to paper, and a page here can
  // spill onto a second sheet — a long note, thirty children — which shifts
  // every number after it. Numbering them from the content would make the
  // contents point at the wrong pages the first time anyone overflowed, so the
  // renderer assigns numbers from what it actually laid out.
  pages: BookPage[]
  // People in scope with nothing on their page but a name. Counted, not hidden:
  // a book that quietly skipped them would misrepresent how complete it is.
  bareCount: number
}

export interface BuildFamilyBookInput {
  title: string
  people: Person[]
  relationships: Relationship[]
  // Generation numbers from the open tree, used only for ordering.
  generations: ReadonlyMap<string, number>
  // Names of each person's documents, by person id. Listed rather than
  // embedded: a scan is a page of its own kind, and inlining twenty of them
  // would turn a readable book into an unsorted pile of paper.
  documentNames?: ReadonlyMap<string, string[]>
}

const SUBTYPE_DETAIL: Record<string, string | undefined> = {
  biological: undefined,
  adopted: "adopted",
  step: "step",
  foster: "foster",
  guardian: "guardian",
}

function lifespanOf(person: Person): string {
  const birth = formatPartialDate(person.birth)
  const death = formatPartialDate(person.death)
  if (birth && death) return `${birth} – ${death}`
  if (birth) return `b. ${birth}`
  if (death) return `d. ${death}`
  return "Dates unrecorded"
}

// The dates after a relative's name. Short on purpose: this is an index entry,
// not a second biography, and the person has their own page.
function shortDates(person: Person | undefined): string | undefined {
  if (!person) return undefined
  const birth = formatPartialDate(person.birth)
  const death = formatPartialDate(person.death)
  if (birth && death) return `${birth}–${death}`
  if (birth) return `b. ${birth}`
  if (death) return `d. ${death}`
  return undefined
}

function joinDetail(parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((part): part is string => !!part)
  return kept.length > 0 ? kept.join(", ") : undefined
}

function alsoKnownAsOf(person: Person): string | undefined {
  const parts: string[] = []
  if (person.nickname) parts.push(`“${person.nickname}”`)
  if (person.maidenName && person.maidenName !== person.familyName) {
    parts.push(`née ${person.maidenName}`)
  }
  return parts.length > 0 ? parts.join(", ") : undefined
}

function factsOf(person: Person): BookFact[] {
  const facts: BookFact[] = []
  const birth = formatPartialDate(person.birth)
  const death = formatPartialDate(person.death)
  if (birth) facts.push({ label: "Born", value: birth })
  if (death) facts.push({ label: "Died", value: death })
  if (person.sex) facts.push({ label: "Sex", value: SEX_LABEL[person.sex] })
  for (const field of person.customFields ?? []) {
    facts.push({ label: field.label, value: field.value })
  }
  return facts
}

export function buildFamilyBook(input: BuildFamilyBookInput): FamilyBook {
  const { title, people, relationships, generations, documentNames } = input

  const byId = new Map(people.map((person) => [person.id, person]))

  // Generation first so the book reads from the oldest recorded generation
  // down, then by birth date within a generation, then by name. Someone with
  // no generation number — possible if the caller passes people outside the
  // tree it computed generations for — sorts after those that have one rather
  // than being treated as generation zero.
  const ordered = [...people].sort((a, b) => {
    const ga = generations.get(a.id) ?? Number.POSITIVE_INFINITY
    const gb = generations.get(b.id) ?? Number.POSITIVE_INFINITY
    if (ga !== gb) return ga - gb
    const byDate = comparePartialDate(a.birth, b.birth)
    if (byDate !== 0) return byDate
    return (
      personDisplayName(a).localeCompare(personDisplayName(b)) ||
      a.id.localeCompare(b.id)
    )
  })

  const relationEntry = (personId: string, detail?: string): BookRelation => {
    const person = byId.get(personId)
    return {
      personId: person?.id,
      // A relative outside the book's scope is still named, because leaving
      // them out would make a page say someone had one parent when the record
      // says two. Only their page is missing, and the entry says so.
      name: person ? personDisplayName(person) : "Not in this book",
      detail: person
        ? joinDetail([shortDates(person), detail])
        : joinDetail([detail]),
    }
  }

  const byName = (a: BookRelation, b: BookRelation) =>
    a.name.localeCompare(b.name)

  const pages: BookPage[] = ordered.map((person) => {
    const parentLinks = relationships.filter(
      (r) => r.type === "parent-child" && r.to === person.id
    )
    const childLinks = relationships.filter(
      (r) => r.type === "parent-child" && r.from === person.id
    )
    const spouseLinks = relationships.filter(
      (r) => r.type === "spouse" && (r.from === person.id || r.to === person.id)
    )

    const parentIds = new Set(parentLinks.map((r) => r.from))
    // Anyone sharing at least one parent. Half-siblings included and not
    // distinguished: the page lists who someone grew up beside, and the exact
    // parentage of each is on their own page.
    const siblingIds = new Set(
      relationships
        .filter(
          (r) =>
            r.type === "parent-child" &&
            parentIds.has(r.from) &&
            r.to !== person.id
        )
        .map((r) => r.to)
    )

    const relations: BookRelationGroup[] = []
    if (parentLinks.length > 0) {
      relations.push({
        heading: "Parents",
        entries: parentLinks
          .map((r) => relationEntry(r.from, SUBTYPE_DETAIL[subtypeOf(r)]))
          .sort(byName),
      })
    }
    if (spouseLinks.length > 0) {
      relations.push({
        heading: spouseLinks.length === 1 ? "Spouse" : "Spouses",
        entries: spouseLinks
          .map((r) => {
            const otherId = r.from === person.id ? r.to : r.from
            const married = formatPartialDate(r.start)
            const ended = formatPartialDate(r.end)
            return relationEntry(
              otherId,
              joinDetail([
                married ? `m. ${married}` : undefined,
                // A recorded end date is a fact about the marriage and belongs
                // on the page; an absent one asserts nothing either way.
                ended ? `until ${ended}` : undefined,
              ])
            )
          })
          .sort(byName),
      })
    }
    if (siblingIds.size > 0) {
      relations.push({
        heading: "Siblings",
        entries: [...siblingIds].map((id) => relationEntry(id)).sort(byName),
      })
    }
    if (childLinks.length > 0) {
      relations.push({
        heading: "Children",
        entries: childLinks
          .map((r) => relationEntry(r.to, SUBTYPE_DETAIL[subtypeOf(r)]))
          .sort(byName),
      })
    }

    return {
      personId: person.id,
      name: personDisplayName(person),
      alsoKnownAs: alsoKnownAsOf(person),
      lifespan: lifespanOf(person),
      facts: factsOf(person),
      relations,
      notes: person.notes ? notesToPlainText(person.notes) : [],
      documents: documentNames?.get(person.id) ?? [],
      coverPhotoId: coverPhotoId(person),
    }
  })

  const bareCount = pages.filter(
    (page) =>
      page.facts.length === 0 &&
      page.relations.length === 0 &&
      page.notes.length === 0 &&
      !page.coverPhotoId
  ).length

  return { title, pages, bareCount }
}

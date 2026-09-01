import { personDisplayName } from "~/lib/person-name"
import { coverPhotoId, personPhotoCount } from "~/lib/person-photos"
import { comparePartialDate, formatPartialDate } from "~/lib/partial-date"
import type { Person } from "~/lib/types"

export type PhotoWallSort = "birth" | "name"

export const PHOTO_WALL_SORTS: Array<{ value: PhotoWallSort; label: string }> =
  [
    { value: "birth", label: "Oldest first" },
    { value: "name", label: "By name" },
  ]

export interface PhotoWallEntry {
  personId: string
  name: string
  coverPhotoId: string
  // Everything after the cover. Shown as a count on the tile rather than as
  // more tiles: the wall is one face per person, and four pictures of the same
  // grandmother would crowd out three other people.
  extraPhotoCount: number
  // Already formatted — "1912 – 1987", "b. c. 1880", or "" when neither date is
  // recorded. Built here so the tile has no date logic of its own.
  lifespan: string
}

export interface PhotoWall {
  entries: PhotoWallEntry[]
  // How many people were considered, and how many of them had a face. Both
  // reported, because "34 of 112 people have a photo" is the number that tells
  // someone where the gaps are — a bare grid of 34 looks complete.
  considered: number
  withPhoto: number
}

function lifespanOf(person: Person): string {
  const birth = formatPartialDate(person.birth)
  const death = formatPartialDate(person.death)
  if (birth && death) return `${birth} – ${death}`
  if (birth) return `b. ${birth}`
  if (death) return `d. ${death}`
  return ""
}

export interface PhotoWallOptions {
  sort?: PhotoWallSort
  // When given, only these people are considered. The caller decides whether
  // the wall means "this tree" or "everybody" — see the view, which offers both.
  limitToPersonIds?: ReadonlySet<string>
}

export function buildPhotoWall(
  people: Person[],
  options: PhotoWallOptions = {}
): PhotoWall {
  const { sort = "birth", limitToPersonIds } = options

  const considered = limitToPersonIds
    ? people.filter((person) => limitToPersonIds.has(person.id))
    : people

  const entries: PhotoWallEntry[] = []
  for (const person of considered) {
    const cover = coverPhotoId(person)
    if (!cover) continue
    entries.push({
      personId: person.id,
      name: personDisplayName(person),
      coverPhotoId: cover,
      extraPhotoCount: personPhotoCount(person) - 1,
      lifespan: lifespanOf(person),
    })
  }

  // Chronological by default, because a wall of faces reads as generations
  // when it is: parents land beside parents. comparePartialDate is the right
  // comparator here and not one of the span-aware ones — this is a sort, not a
  // claim about who was born first, and it already puts unknown dates last.
  // Ties break on name so the order is stable rather than dependent on the
  // order Dexie happened to return rows in.
  const birthById = new Map(people.map((person) => [person.id, person.birth]))
  entries.sort((a, b) => {
    if (sort === "birth") {
      const byDate = comparePartialDate(
        birthById.get(a.personId),
        birthById.get(b.personId)
      )
      if (byDate !== 0) return byDate
    }
    return a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId)
  })

  return {
    entries,
    considered: considered.length,
    withPhoto: entries.length,
  }
}

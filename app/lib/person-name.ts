import type { Person } from "~/lib/types"

export type NameableFields = Pick<
  Person,
  "givenName" | "familyName" | "nickname"
>

// The single place a person's name is assembled for display — the canvas card,
// the people table, the picker and the command palette all render through here
// so a nickname can't show up in one list and not another.
//
// Genealogy convention writes a nickname in quotes between the given and family
// names. Showing it is also what makes a nickname search hit legible: the row
// explains why it matched.
//
// Deliberately NOT shared with the GEDCOM writer's own name formatting. That has
// a fixed wire format ("Given /Family/") which must not drift with a UI
// presentation choice.
// The parts a display name is built from, in the order it builds them. Exposed
// so a UI that has to make individual parts editable — the People table's
// inline name cell — can lay them out itself without restating the order and
// drifting from personDisplayName, which is still the single place a name is
// assembled for plain display.
export interface PersonNameSegments {
  givenName: string
  // Already quoted, since the quotes are part of the convention rather than
  // decoration a caller might add differently.
  nickname?: string
  familyName?: string
}

export function personNameSegments(person: NameableFields): PersonNameSegments {
  return {
    givenName: person.givenName,
    nickname: person.nickname ? `“${person.nickname}”` : undefined,
    familyName: person.familyName || undefined,
  }
}

export const UNNAMED = "Unnamed"

export function personDisplayName(person: NameableFields): string {
  const { givenName, nickname, familyName } = personNameSegments(person)
  return [givenName, nickname, familyName].filter(Boolean).join(" ") || UNNAMED
}

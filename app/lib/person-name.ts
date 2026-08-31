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
export function personDisplayName(person: NameableFields): string {
  const nickname = person.nickname ? `“${person.nickname}”` : undefined
  return (
    [person.givenName, nickname, person.familyName].filter(Boolean).join(" ") ||
    "Unnamed"
  )
}

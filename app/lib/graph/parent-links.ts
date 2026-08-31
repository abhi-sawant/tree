import type { ParentChildSubtype, Relationship } from "~/lib/types"

export const DEFAULT_SUBTYPE: ParentChildSubtype = "biological"

export function subtypeOf(relationship: Relationship): ParentChildSubtype {
  return relationship.subtype ?? DEFAULT_SUBTYPE
}

// The subtype that *every* recorded parent link from `parentIds` to `childId`
// agrees on, or undefined when they disagree (or when there are no links).
//
// A couple's connector to a child is one line and a FAM's PEDI is one value, so
// neither can express "biological through her, step through him". When the two
// links disagree, both callers fall back to the plain biological presentation
// rather than picking a side: claiming a child is not descended from a couple
// they are half-descended from is the worse of the two errors, and the exact
// per-parent truth is always visible in the detail panel's Family tab.
export function sharedParentLinkSubtype(
  relationships: Relationship[],
  childId: string,
  parentIds: readonly string[]
): ParentChildSubtype | undefined {
  const parents = new Set(parentIds)
  const subtypes = new Set(
    relationships
      .filter(
        (r) =>
          r.type === "parent-child" && r.to === childId && parents.has(r.from)
      )
      .map(subtypeOf)
  )
  if (subtypes.size !== 1) return undefined
  return [...subtypes][0]
}

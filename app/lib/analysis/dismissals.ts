import type { DuplicateCandidate } from "~/lib/analysis/duplicates"
import type { Finding } from "~/lib/analysis/validate"

// Findings and duplicate pairs are recomputed from the graph every time the
// Health view renders; neither has an id, and neither can be given one,
// because nothing about them is stored. So a dismissal is identified by its
// content: what was said, and who it was said about.
//
// The consequence is worth stating plainly, because it is the whole risk of
// this design: dismissing a finding silences THAT finding about THOSE people
// and nothing else. Correct a date so a different rule fires about the same
// person and the new finding surfaces — which is what you want, since it is a
// different claim. Edit the data so the same rule fires about a different set
// of people and that surfaces too. What a dismissal can never do is hide
// something the reader has not already read and rejected.
//
// Person ids are sorted so the key does not depend on the order the validator
// happened to list them in — that order is presentation (D34: the person to
// take the reader to first), and presentation must not change identity.

export type DismissalKind = "finding" | "duplicate"

export function findingKey(finding: Finding): string {
  return `${finding.code}:${[...finding.personIds].sort().join(",")}`
}

export function duplicateKey(candidate: DuplicateCandidate): string {
  return `duplicate:${[...candidate.personIds].sort().join(",")}`
}

// The people a dismissal is about, so deleting one of them can take the
// dismissal with it rather than leaving a key that can never match again.
export function findingPersonIds(finding: Finding): string[] {
  return [...finding.personIds].sort()
}

export function duplicatePersonIds(candidate: DuplicateCandidate): string[] {
  return [...candidate.personIds].sort()
}

export function filterDismissed<T>(
  items: T[],
  keyOf: (item: T) => string,
  dismissedKeys: ReadonlySet<string>
): T[] {
  return items.filter((item) => !dismissedKeys.has(keyOf(item)))
}

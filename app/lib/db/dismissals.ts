import { db } from "~/lib/db/db"
import type { Dismissal, DismissalKind } from "~/lib/types"

export interface DismissInput {
  key: string
  kind: DismissalKind
  personIds: string[]
}

// `now` injected rather than read here, so a test can pin what "dismissed on"
// says without stubbing the clock globally.
export async function dismiss(
  input: DismissInput,
  now: Date = new Date()
): Promise<void> {
  await db.dismissals.put({
    key: input.key,
    kind: input.kind,
    personIds: [...input.personIds].sort(),
    dismissedAt: now.getTime(),
  })
}

export async function undismiss(key: string): Promise<void> {
  await db.dismissals.delete(key)
}

export async function listDismissals(): Promise<Dismissal[]> {
  return db.dismissals.toArray()
}

// Called from deletePerson's cascade. A dismissal about somebody who no longer
// exists can never match a finding again, so keeping it would only mean a row
// that grows and never shrinks — and, worse, one that could silence a *new*
// finding if that id were ever reissued.
export async function removeDismissalsForPerson(
  personId: string
): Promise<void> {
  await db.dismissals.where("personIds").equals(personId).delete()
}

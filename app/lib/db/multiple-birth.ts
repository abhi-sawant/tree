import { db } from "~/lib/db/db"
import { updatePerson } from "~/lib/db/people"

// Sets who a person was born together with, as a whole group in one write.
//
// The group is always {personId} ∪ siblingIds. Anyone who held the person's
// previous token but isn't in the new group is cleared, which is what makes
// "uncheck one of three triplets" leave the other two grouped and the third
// alone. A group that would end up with a single member is cleared entirely —
// a multiple birth of one is not a fact about anybody.
export async function setMultipleBirthGroup(
  personId: string,
  siblingIds: string[]
): Promise<void> {
  await db.transaction("rw", db.people, async () => {
    const person = await db.people.get(personId)
    if (!person) throw new Error(`Person not found: ${personId}`)

    const previousToken = person.multipleBirthGroup
    const formerMembers = previousToken
      ? await db.people
          .filter((p) => p.multipleBirthGroup === previousToken)
          .toArray()
      : []

    const groupIds = [...new Set([personId, ...siblingIds])]
    // Reuse a token already in play so an edit doesn't churn the value on
    // people whose membership didn't actually change.
    const token =
      groupIds.length < 2 ? undefined : (previousToken ?? crypto.randomUUID())

    for (const member of formerMembers) {
      if (!groupIds.includes(member.id)) {
        await updatePerson(member.id, { multipleBirthGroup: undefined })
      }
    }
    for (const id of groupIds) {
      await updatePerson(id, { multipleBirthGroup: token })
    }
  })
}

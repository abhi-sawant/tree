import { db } from "~/lib/db/db"
import { personPhotoIds } from "~/lib/person-photos"
import { PersonFormSchema, type PersonFormValues } from "~/lib/schemas"
import { requestPersistentStorage } from "~/lib/storage"
import type { Person } from "~/lib/types"

// Derived from the form schema rather than restated, so adding a Person field
// only means touching schemas.ts. Both photo fields are excluded because photos
// are written through lib/photos.ts (it owns the blob's lifecycle and the rule
// tying the two fields together), never as part of a plain create.
export type CreatePersonInput = Omit<PersonFormValues, "photoId" | "photoIds">

export interface CreatePersonOptions {
  // Overrides the clock. createdAt is what orderFamilyGraph sorts a sibling row
  // by, and several people created inside one millisecond would tie and fall
  // back to comparing random UUIDs — which scrambles the order they were
  // entered in. Any caller creating a batch of siblings at once must space them
  // out here. (Prefer injecting `now` over reading the clock.)
  createdAt?: number
}

export async function createPerson(
  input: CreatePersonInput,
  options: CreatePersonOptions = {}
): Promise<Person> {
  const now = options.createdAt ?? Date.now()
  const person: Person = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  PersonFormSchema.parse(person)
  await db.people.add(person)
  void requestPersistentStorage()
  return person
}

export type UpdatePersonInput = Partial<
  Omit<Person, "id" | "createdAt" | "updatedAt">
>

export async function updatePerson(
  id: string,
  patch: UpdatePersonInput
): Promise<Person> {
  const existing = await db.people.get(id)
  if (!existing) throw new Error(`Person not found: ${id}`)

  const updated: Person = { ...existing, ...patch, id, updatedAt: Date.now() }
  PersonFormSchema.parse(updated)
  await db.people.put(updated)
  return updated
}

export async function getPerson(id: string): Promise<Person | undefined> {
  return db.people.get(id)
}

export interface SearchPeopleOptions {
  includePlaceholders?: boolean // default true
}

export async function searchPeople(
  query: string,
  options: SearchPeopleOptions = {}
): Promise<Person[]> {
  const { includePlaceholders = true } = options
  const normalized = query.trim().toLowerCase()

  const people = await db.people.toArray()
  return people.filter((person) => {
    if (!includePlaceholders && person.isPlaceholder) return false
    if (!normalized) return true
    // Maiden name and nickname are searched alongside the display name: a
    // woman recorded under her married name is otherwise unfindable by the
    // name her birth records carry, which is the name a researcher has.
    const haystack = [
      person.givenName,
      person.familyName,
      person.maidenName,
      person.nickname,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return haystack.includes(normalized)
  })
}

export interface TreeRef {
  id: string
  name: string
}

export async function getTreesForPerson(personId: string): Promise<TreeRef[]> {
  const memberships = await db.members
    .where("personId")
    .equals(personId)
    .toArray()
  const trees = await db.trees.bulkGet(memberships.map((m) => m.treeId))
  return trees
    .filter((tree) => tree !== undefined)
    .map((tree) => ({ id: tree.id, name: tree.name }))
}

export interface DeleteImpact {
  blockingTrees: TreeRef[]
  memberOfTrees: TreeRef[]
}

export async function getDeleteImpact(personId: string): Promise<DeleteImpact> {
  const [blockingTrees, memberOfTrees] = await Promise.all([
    db.trees.where("rootPersonId").equals(personId).toArray(),
    getTreesForPerson(personId),
  ])
  return {
    blockingTrees: blockingTrees.map((tree) => ({
      id: tree.id,
      name: tree.name,
    })),
    memberOfTrees,
  }
}

export class PersonIsRootError extends Error {
  readonly personId: string
  readonly trees: TreeRef[]

  constructor(personId: string, trees: TreeRef[]) {
    super(`Cannot delete: person is the root of ${trees.length} tree(s)`)
    this.name = "PersonIsRootError"
    this.personId = personId
    this.trees = trees
  }
}

export async function deletePerson(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.people,
      db.relationships,
      db.members,
      db.photos,
      db.trees,
      db.attachments,
    ],
    async () => {
      const rootTrees = await db.trees
        .where("rootPersonId")
        .equals(id)
        .toArray()
      if (rootTrees.length > 0) {
        throw new PersonIsRootError(
          id,
          rootTrees.map((tree) => ({ id: tree.id, name: tree.name }))
        )
      }

      await db.relationships.where("from").equals(id).delete()
      await db.relationships.where("to").equals(id).delete()
      await db.members.where("personId").equals(id).delete()

      const person = await db.people.get(id)
      // Every photo, not just the cover: a person deleted with four photos
      // would otherwise leave three blobs behind that nothing points at, which
      // the storage panel can only report as orphans and never attribute.
      await db.photos.bulkDelete(personPhotoIds(person))
      // Their documents too. An attachment row names its owner, so one left
      // behind is unreachable from anywhere in the UI — bytes nothing can open
      // and nothing can delete.
      await db.attachments.where("personId").equals(id).delete()

      await db.people.delete(id)
    }
  )
}

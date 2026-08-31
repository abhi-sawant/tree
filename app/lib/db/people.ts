import { db } from "~/lib/db/db"
import { PersonFormSchema, type PersonFormValues } from "~/lib/schemas"
import { requestPersistentStorage } from "~/lib/storage"
import type { Person } from "~/lib/types"

// Derived from the form schema rather than restated, so adding a Person field
// only means touching schemas.ts. `photoId` is excluded because photos are
// written through setPersonPhoto (it owns the blob's lifecycle), never as part
// of a plain create.
export type CreatePersonInput = Omit<PersonFormValues, "photoId">

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const now = Date.now()
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
    const fullName =
      `${person.givenName} ${person.familyName ?? ""}`.toLowerCase()
    return fullName.includes(normalized)
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
    db.people,
    db.relationships,
    db.members,
    db.photos,
    db.trees,
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
      if (person?.photoId) await db.photos.delete(person.photoId)

      await db.people.delete(id)
    }
  )
}

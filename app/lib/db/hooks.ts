import { useLiveQuery } from "dexie-react-hooks"

import { db } from "~/lib/db/db"
import { getTreesForPerson, searchPeople, type SearchPeopleOptions, type TreeRef } from "~/lib/db/people"
import type { Person, Photo, Relationship, Tree, TreeMember } from "~/lib/types"

export function usePerson(id: string | undefined): Person | undefined {
  return useLiveQuery(() => (id ? db.people.get(id) : undefined), [id])
}

export function usePeople(): Person[] | undefined {
  return useLiveQuery(() => db.people.toArray(), [])
}

export function useTree(id: string | undefined): Tree | undefined {
  return useLiveQuery(() => (id ? db.trees.get(id) : undefined), [id])
}

export function useTrees(): Tree[] | undefined {
  return useLiveQuery(() => db.trees.toArray(), [])
}

export function useTreeMembers(treeId: string | undefined): TreeMember[] | undefined {
  return useLiveQuery(
    () => (treeId ? db.members.where("treeId").equals(treeId).toArray() : []),
    [treeId],
  )
}

export function useRelationshipsForPerson(
  personId: string | undefined,
): Relationship[] | undefined {
  return useLiveQuery(async () => {
    if (!personId) return []
    const [asFrom, asTo] = await Promise.all([
      db.relationships.where("from").equals(personId).toArray(),
      db.relationships.where("to").equals(personId).toArray(),
    ])
    return [...asFrom, ...asTo]
  }, [personId])
}

export function usePhoto(photoId: string | undefined): Photo | undefined {
  return useLiveQuery(() => (photoId ? db.photos.get(photoId) : undefined), [photoId])
}

export function useSearchPeople(
  query: string,
  options?: SearchPeopleOptions,
): Person[] | undefined {
  return useLiveQuery(
    () => searchPeople(query, options),
    [query, options?.includePlaceholders],
  )
}

export function useMembers(): TreeMember[] | undefined {
  return useLiveQuery(() => db.members.toArray(), [])
}

export function useTreesForPerson(personId: string | undefined): TreeRef[] | undefined {
  return useLiveQuery(() => (personId ? getTreesForPerson(personId) : []), [personId])
}

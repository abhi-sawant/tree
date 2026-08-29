import { useLiveQuery } from "dexie-react-hooks"

import { db } from "~/lib/db/db"
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

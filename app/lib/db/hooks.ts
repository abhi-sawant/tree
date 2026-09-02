import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useState } from "react"

import { listSnapshots, type SnapshotSummary } from "~/lib/backup/snapshots"
import { db } from "~/lib/db/db"
import {
  getTreesForPerson,
  searchPeople,
  type SearchPeopleOptions,
  type TreeRef,
} from "~/lib/db/people"
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

export function useTreeMembers(
  treeId: string | undefined
): TreeMember[] | undefined {
  return useLiveQuery(
    () => (treeId ? db.members.where("treeId").equals(treeId).toArray() : []),
    [treeId]
  )
}

export function useRelationships(): Relationship[] | undefined {
  return useLiveQuery(() => db.relationships.toArray(), [])
}

export function useRelationshipsForPerson(
  personId: string | undefined
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
  return useLiveQuery(
    () => (photoId ? db.photos.get(photoId) : undefined),
    [photoId]
  )
}

export function usePhotoUrl(photoId: string | undefined): string | undefined {
  const photo = usePhoto(photoId)
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!photo) {
      setUrl(undefined)
      return
    }
    const objectUrl = URL.createObjectURL(photo.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo?.id])

  return url
}

// One object URL per photo, in the order the ids were given, with the whole set
// revoked and rebuilt whenever that order or membership changes.
//
// Deliberately not built out of N usePhotoUrl calls: the id list is dynamic, and
// a hook per photo would break the rules of hooks the moment a photo is added
// or removed. The join key is what makes the effect fire on a reorder as well
// as on an add — a gallery that reordered without re-rendering its images would
// show the right pictures in the wrong places.
export function usePhotoUrls(photoIds: string[]): Map<string, string> {
  const key = photoIds.join(",")
  const photos = useLiveQuery(
    async () => (photoIds.length ? db.photos.bulkGet(photoIds) : []),
    [key]
  )
  const [urls, setUrls] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!photos) return
    const created: string[] = []
    const next = new Map<string, string>()
    for (const photo of photos) {
      if (!photo) continue
      const url = URL.createObjectURL(photo.blob)
      created.push(url)
      next.set(photo.id, url)
    }
    setUrls(next)
    return () => {
      for (const url of created) URL.revokeObjectURL(url)
    }
  }, [photos])

  return urls
}

export function useSearchPeople(
  query: string,
  options?: SearchPeopleOptions
): Person[] | undefined {
  return useLiveQuery(
    () => searchPeople(query, options),
    [query, options?.includePlaceholders]
  )
}

export function useMembers(): TreeMember[] | undefined {
  return useLiveQuery(() => db.members.toArray(), [])
}

export function useTreesForPerson(
  personId: string | undefined
): TreeRef[] | undefined {
  return useLiveQuery(
    () => (personId ? getTreesForPerson(personId) : []),
    [personId]
  )
}

// Blob-free by construction — listSnapshots drops it — so keeping this live
// costs nothing even with ten archives stored.
export function useSnapshots(): SnapshotSummary[] | undefined {
  return useLiveQuery(() => listSnapshots(), [])
}

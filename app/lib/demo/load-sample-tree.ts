// Putting the sample family into this browser, and taking it back out again.
//
// The taking-out half is the part that had to be got right. A demo you cannot
// remove cleanly is worse than no demo at all: whoever tries it does so before
// they trust the app, and finding a set of invented people mixed in with their
// grandmother afterwards is exactly the reason people don't try things.

import { db } from "~/lib/db/db"
import { deletePerson, PersonIsRootError } from "~/lib/db/people"
import { deleteTree } from "~/lib/db/trees"
import {
  isDemoId,
  sampleTreeData,
  SAMPLE_TREE_ID,
  type SampleTreeData,
} from "~/lib/demo/sample-tree"
import { personPhotoIds } from "~/lib/person-photos"
import { personDisplayName } from "~/lib/person-name"

export interface SampleTreeStatus {
  // Whether the sample tree itself is here. Separate from the count below,
  // because a reader who removed the tree but kept a person out of it is in a
  // real state the panel has to be able to describe.
  treePresent: boolean
  personCount: number
}

export async function getSampleTreeStatus(): Promise<SampleTreeStatus> {
  const [tree, people] = await Promise.all([
    db.trees.get(SAMPLE_TREE_ID),
    db.people.toArray(),
  ])
  return {
    treePresent: !!tree,
    personCount: people.filter((person) => isDemoId(person.id)).length,
  }
}

export interface LoadSampleTreeResult {
  treeId: string
  people: number
}

// Additive, and never a replacement. The one thing a "try it before you commit"
// affordance must not be able to do is destroy what somebody already entered,
// so this writes a tree of its own alongside whatever is here and touches
// nothing else.
//
// `put` rather than `add`, so loading a second time restores the sample to how
// it shipped instead of failing or duplicating it. That is also the honest
// reading of pressing the button twice: the ids are fixed, so there is only ever
// one sample family, and asking for it again means asking for it as it was.
//
// It writes rows directly rather than going through createPerson/addRelationship
// — the only place in the app that does. Those helpers are how *user* input
// becomes data, and they would refuse this on the second load: everyone already
// has their two parents. The invariants they enforce are asserted against this
// fixture in sample-tree.test.ts instead, which is a stronger guarantee than a
// runtime check that only ever runs on data that cannot change.
export async function loadSampleTree(
  now: number = Date.now()
): Promise<LoadSampleTreeResult> {
  const data: SampleTreeData = sampleTreeData(now)

  await db.transaction(
    "rw",
    [db.people, db.relationships, db.trees, db.members],
    async () => {
      await Promise.all([
        db.people.bulkPut(data.people),
        db.relationships.bulkPut(data.relationships),
        db.trees.put(data.tree),
        db.members.bulkPut(data.members),
      ])
    }
  )

  // Deliberately no requestPersistentStorage() here, unlike createPerson. The
  // browser's "keep this site's data" prompt should be spent on the first
  // person somebody actually cares about, not on a family they are still
  // deciding whether to trust the app with.
  return { treeId: data.tree.id, people: data.people.length }
}

export interface KeptDemoPerson {
  id: string
  name: string
  reason: string
}

export interface RemoveSampleTreeResult {
  treeRemoved: boolean
  peopleRemoved: number
  // Relationships joining a sample person to somebody the reader entered
  // themselves. Counted and reported rather than refused: the sample person is
  // going, so the link cannot stay, but a link disappearing from a real
  // person's record is not something to do silently.
  linksToOwnDataRemoved: number
  // Files added to a sample person. Nothing puts them there but the reader, so
  // the count is how the warning stays true rather than hypothetical.
  photosRemoved: number
  documentsRemoved: number
  keptPeople: KeptDemoPerson[]
}

// Deletes exactly the sample rows: the ids are fixed, so the set is known
// rather than inferred.
//
// Not one transaction, on purpose. Each person goes out through deletePerson,
// which already owns what "delete a person" means — the relationship sweep, the
// membership sweep, the photos, the documents, and the refusal when somebody is
// a tree's root. A hand-rolled cascade inside a single transaction would be a
// second definition of that, and the one most likely to be forgotten the next
// time a table is added (Phase 6 added the documents table to exactly this
// cascade). The cost is that a failure part-way leaves some of the sample
// behind — which is recoverable by pressing the button again, because every
// step here is idempotent.
export async function removeSampleTree(): Promise<RemoveSampleTreeResult> {
  const [allPeople, allRelationships, allTrees, allAttachments] =
    await Promise.all([
      db.people.toArray(),
      db.relationships.toArray(),
      db.trees.toArray(),
      db.attachments.toArray(),
    ])

  const demoPeople = allPeople.filter((person) => isDemoId(person.id))
  const demoIds = new Set(demoPeople.map((person) => person.id))

  // Any tree but the sample's own. The sample tree is deleted first below, so
  // being its root is not a reason to keep anybody.
  const blockedBy = new Map<string, string>()
  for (const tree of allTrees) {
    if (tree.id === SAMPLE_TREE_ID) continue
    if (demoIds.has(tree.rootPersonId))
      blockedBy.set(tree.rootPersonId, tree.name)
  }

  const removable = demoPeople.filter((person) => !blockedBy.has(person.id))
  const removableIds = new Set(removable.map((person) => person.id))

  // "One end is going and the other end is theirs" — not simply "one end is
  // going". A link between a sample person being removed and a sample person
  // being kept is still entirely within the sample, and counting it would
  // warn the reader about their own data losing something it never had.
  const linksToOwnDataRemoved = allRelationships.filter(
    (relationship) =>
      (removableIds.has(relationship.from) && !demoIds.has(relationship.to)) ||
      (removableIds.has(relationship.to) && !demoIds.has(relationship.from))
  ).length

  const photosRemoved = removable.reduce(
    (total, person) => total + personPhotoIds(person).length,
    0
  )
  const documentsRemoved = allAttachments.filter((attachment) =>
    removableIds.has(attachment.personId)
  ).length

  const keptPeople: KeptDemoPerson[] = []
  for (const [personId, treeName] of blockedBy) {
    const person = demoPeople.find((candidate) => candidate.id === personId)
    keptPeople.push({
      id: personId,
      name: person ? personDisplayName(person) : personId,
      reason: `still the root of your tree “${treeName}”`,
    })
  }

  // Before the people, so nobody is the root of it by the time they are
  // deleted. This also drops any of the reader's own people they had added to
  // the sample tree — from the tree only; §2.3's distinction holds, those
  // people keep every relationship and every other membership they have.
  const tree = await db.trees.get(SAMPLE_TREE_ID)
  if (tree) await deleteTree(SAMPLE_TREE_ID)

  let peopleRemoved = 0
  for (const person of removable) {
    try {
      await deletePerson(person.id)
      peopleRemoved += 1
    } catch (error) {
      // The root guard again, from the other side: a tree created between the
      // read above and this write. Reported the same way rather than thrown,
      // so one awkward person doesn't strand the other fourteen.
      if (!(error instanceof PersonIsRootError)) throw error
      keptPeople.push({
        id: person.id,
        name: personDisplayName(person),
        reason: `still the root of ${error.trees.length === 1 ? `your tree “${error.trees[0].name}”` : `${error.trees.length} of your trees`}`,
      })
    }
  }

  return {
    treeRemoved: !!tree,
    peopleRemoved,
    linksToOwnDataRemoved,
    photosRemoved,
    documentsRemoved,
    keptPeople,
  }
}

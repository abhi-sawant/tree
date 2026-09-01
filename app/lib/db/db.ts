import Dexie, { type Table } from "dexie"

import { dataChangeMiddleware } from "~/lib/db/change-signal"
import type {
  AppMetaRow,
  Attachment,
  BackupTarget,
  Person,
  Photo,
  Relationship,
  Snapshot,
  Tree,
  TreeMember,
} from "~/lib/types"

export class FamilyTreeDB extends Dexie {
  people!: Table<Person, string>
  relationships!: Table<Relationship, string>
  trees!: Table<Tree, string>
  members!: Table<TreeMember, [string, string]>
  photos!: Table<Photo, string>
  attachments!: Table<Attachment, string>
  appMeta!: Table<AppMetaRow, string>
  snapshots!: Table<Snapshot, string>
  backupTargets!: Table<BackupTarget, string>

  constructor() {
    super("FamilyTreeDB")
    this.version(1).stores({
      people: "id, givenName, familyName, [givenName+familyName]",
      relationships: "id, from, to, type",
      trees: "id, rootPersonId",
      members: "[treeId+personId], treeId, personId",
      photos: "id",
    })
    this.version(2).stores({
      appMeta: "key",
    })
    // Additive index only — Dexie reindexes existing rows itself, so no
    // upgrade callback is needed. `sex` is indexed for the aggregate queries
    // that read it in bulk rather than for any single-person lookup.
    this.version(3).stores({
      people: "id, givenName, familyName, sex, [givenName+familyName]",
    })
    // A new store, so this one does need a version bump — unlike the optional
    // non-indexed Person fields added in Phases 1-3. `createdAt` is indexed
    // because retention only ever asks for these in date order.
    this.version(4).stores({
      snapshots: "id, createdAt",
    })
    // Another new store. Holds at most one row, but a keyed table is still the
    // right shape: a directory handle is an opaque structured-clonable object,
    // which appMeta's string `value` cannot hold.
    this.version(5).stores({
      backupTargets: "id",
    })
    // A new store again, so another bump. `personId` is indexed because every
    // read of this table is "what did this person's file drawer hold" — the
    // detail panel, the delete cascade and a merge all ask exactly that.
    this.version(6).stores({
      attachments: "id, personId",
    })

    // Installed here rather than at the app root so that anything importing
    // `db` — including tests — is watched. See change-signal.ts for why this
    // sits at the DBCore layer instead of in the lib/db helpers.
    this.use(dataChangeMiddleware())
  }
}

export const db = new FamilyTreeDB()

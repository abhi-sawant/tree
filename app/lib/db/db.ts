import Dexie, { type Table } from "dexie"

import type {
  AppMetaRow,
  Person,
  Photo,
  Relationship,
  Tree,
  TreeMember,
} from "~/lib/types"

export class FamilyTreeDB extends Dexie {
  people!: Table<Person, string>
  relationships!: Table<Relationship, string>
  trees!: Table<Tree, string>
  members!: Table<TreeMember, [string, string]>
  photos!: Table<Photo, string>
  appMeta!: Table<AppMetaRow, string>

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
  }
}

export const db = new FamilyTreeDB()

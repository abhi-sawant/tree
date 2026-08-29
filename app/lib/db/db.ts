import Dexie, { type Table } from "dexie"

import type { Person, Photo, Relationship, Tree, TreeMember } from "~/lib/types"

export class FamilyTreeDB extends Dexie {
  people!: Table<Person, string>
  relationships!: Table<Relationship, string>
  trees!: Table<Tree, string>
  members!: Table<TreeMember, [string, string]>
  photos!: Table<Photo, string>

  constructor() {
    super("FamilyTreeDB")
    this.version(1).stores({
      people: "id, givenName, familyName, [givenName+familyName]",
      relationships: "id, from, to, type",
      trees: "id, rootPersonId",
      members: "[treeId+personId], treeId, personId",
      photos: "id",
    })
  }
}

export const db = new FamilyTreeDB()

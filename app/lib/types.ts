export type PartialDate = {
  year?: number
  month?: number
  day?: number
  approximate?: boolean
}

// GEDCOM 5.5.1 only knows M/F/U. "other" is kept as a distinct stored value
// rather than folded into the absent case, because the export mapping is a
// lossy detail of one output format and shouldn't reach back into the model.
// An absent sex means unrecorded — there is deliberately no "unknown" member,
// which would be a second way to say the same thing.
export type Sex = "male" | "female" | "other"

export interface Person {
  id: string
  givenName: string
  familyName?: string
  // The surname a person was born under, where it differs from familyName.
  // Recorded separately rather than replacing familyName because both are
  // real: one is how the family knows them, the other is how the records do.
  maidenName?: string
  nickname?: string
  sex?: Sex
  birth?: PartialDate
  death?: PartialDate
  photoId?: string
  notes?: string
  isPlaceholder?: boolean // D6
  createdAt: number
  updatedAt: number
}

export interface Relationship {
  id: string
  type: "parent-child" | "spouse"
  from: string // parent, or spouse A
  to: string // child, or spouse B
  start?: PartialDate // marriage date
  end?: PartialDate // divorce / separation
}

export interface Tree {
  id: string
  name: string
  rootPersonId: string
  createdAt: number
}

export interface TreeMember {
  treeId: string
  personId: string
  x?: number // manual position override
  y?: number
}

export interface Photo {
  id: string
  blob: Blob
  mime: string
}

export interface AppMetaRow {
  key: string
  value: string
}

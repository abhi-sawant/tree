export type PartialDate = {
  year?: number
  month?: number
  day?: number
  approximate?: boolean
}

export interface Person {
  id: string
  givenName: string
  familyName?: string
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

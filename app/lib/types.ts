import type { BackupDirectoryHandle } from "~/lib/backup/file-system-access"

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

// A user-named fact with no place in the fixed schema — occupation, religion,
// military service. Deliberately unstructured: it is an escape hatch for the
// facts people want to record now, not a substitute for the events/places/
// sources model, which needs its own design pass.
export interface CustomField {
  label: string
  value: string
}

export interface Person {
  id: string
  givenName: string
  familyName?: string
  // The surname a person was born under, where it differs from familyName.
  // Recorded separately rather than replacing familyName because both are
  // real: one is how the family knows them, the other is how the records do.
  maidenName?: string
  nickname?: string
  // A token shared by everyone born in the same multiple birth. A shared token
  // rather than a boolean so triplets work, and so the grouping survives one of
  // the siblings being deleted.
  multipleBirthGroup?: string
  sex?: Sex
  birth?: PartialDate
  death?: PartialDate
  // Every photo of this person, in display order; the first is the cover that
  // single-avatar surfaces draw. Written only through lib/photos.ts, and only
  // ever alongside photoId — see lib/person-photos.ts, which owns the rule.
  photoIds?: string[]
  // The cover photo as the model recorded it before a person could have more
  // than one. Kept because data already in a browser, and backups already in
  // people's hands, carry only this — and because a build older than this one
  // importing a new backup would otherwise show every face as the default
  // avatar. Never read directly: go through personPhotoIds/coverPhotoId.
  photoId?: string
  notes?: string
  customFields?: CustomField[]
  isPlaceholder?: boolean // D6
  createdAt: number
  updatedAt: number
}

// How a parent-child link came about. An absent subtype means biological, so
// no backfill is needed and the common case stays the cheapest to store.
// "step" and "guardian" have no GEDCOM 5.5.1 PEDI value and are not exported.
export type ParentChildSubtype =
  "biological" | "adopted" | "step" | "foster" | "guardian"

export interface Relationship {
  id: string
  type: "parent-child" | "spouse"
  from: string // parent, or spouse A
  to: string // child, or spouse B
  subtype?: ParentChildSubtype // parent-child only
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

// Why a snapshot was taken. Only used for display — retention treats all three
// the same, because a scheme that protected one kind would need a rule for what
// happens when the protected ones fill the quota.
export type SnapshotReason = "auto" | "manual" | "pre-restore"

// A point the data can be rolled back to, held in this browser rather than in a
// file. Deliberately excludes photos: they are almost all of the bytes and
// almost none of the risk, and keeping ten copies of every photo would multiply
// storage use by ten right where §5.1 says the quota is the danger.
export interface Snapshot {
  id: string
  createdAt: number
  reason: SnapshotReason
  // The same .zip envelope the manual backup writes, minus the photos, so a
  // snapshot restores through exactly the code path an imported file does.
  blob: Blob
  size: number
  // Denormalised so the list can be rendered without unzipping ten archives to
  // find out what is in them.
  counts: {
    people: number
    relationships: number
    trees: number
    members: number
  }
}

// The folder on disk the app mirrors a backup into. A single row: mirroring to
// two folders at once would double the write cost for a second copy on the same
// machine, which is not what the risk in §5.1 is about.
export interface BackupTarget {
  id: string
  // Structured-clonable, so the browser can hand the same directory back after
  // a reload. The permission to *use* it does not survive with it — see
  // folder-backup.ts.
  handle: BackupDirectoryHandle
  // Cached from handle.name so the folder can still be named in the UI while
  // permission is lapsed and the handle can't be touched.
  name: string
  chosenAt: number
  lastWriteAt?: number
  lastWriteBytes?: number
  // The last failure, kept so a folder on an unplugged drive says so instead of
  // silently doing nothing.
  lastError?: string
}

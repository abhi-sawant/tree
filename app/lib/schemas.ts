import { z } from "zod"

export const PartialDateSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  approximate: z.boolean().optional(),
})

export const SexSchema = z.enum(["male", "female", "other"])

export const PersonSchema = z.object({
  id: z.string(),
  givenName: z.string().min(1),
  familyName: z.string().optional(),
  maidenName: z.string().optional(),
  nickname: z.string().optional(),
  sex: SexSchema.optional(),
  birth: PartialDateSchema.optional(),
  death: PartialDateSchema.optional(),
  photoId: z.string().optional(),
  notes: z.string().optional(),
  isPlaceholder: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const PersonFormSchema = PersonSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type PersonFormValues = z.infer<typeof PersonFormSchema>

export const ParentChildSubtypeSchema = z.enum([
  "biological",
  "adopted",
  "step",
  "foster",
  "guardian",
])

export const RelationshipSchema = z.object({
  id: z.string(),
  type: z.enum(["parent-child", "spouse"]),
  from: z.string(),
  to: z.string(),
  subtype: ParentChildSubtypeSchema.optional(),
  start: PartialDateSchema.optional(),
  end: PartialDateSchema.optional(),
})

export const RelationshipFormSchema = RelationshipSchema.omit({ id: true })
export type RelationshipFormValues = z.infer<typeof RelationshipFormSchema>

export const TreeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  rootPersonId: z.string(),
  createdAt: z.number(),
})

export const TreeMemberSchema = z.object({
  treeId: z.string(),
  personId: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
})

// A path pointing at an entry inside a .zip backup. We only ever use it as a
// lookup key into fflate's Unzipped record, never as a filesystem path, but
// rejecting traversal here keeps a hostile archive away from any code that
// might one day write these to disk.
const ArchivePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) => {
      const segments = path.split("/")
      return (
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !/^[a-zA-Z]:/.test(path) &&
        !segments.includes("..") &&
        !segments.includes("__proto__")
      )
    },
    { message: "Photo path must be a relative path inside the archive" }
  )

const backupTables = {
  people: z.array(PersonSchema),
  relationships: z.array(RelationshipSchema),
  trees: z.array(TreeSchema),
  members: z.array(TreeMemberSchema),
}

// Schema 1 (legacy): a single .json file with every photo base64-inlined.
// Still accepted on import forever — backups already in users' hands.
export const BackupPhotoV1Schema = z.object({
  id: z.string(),
  mime: z.string(),
  data: z.string(), // base64, no "data:" prefix
})

export const BackupEnvelopeV1Schema = z.object({
  schema: z.literal(1),
  ...backupTables,
  photos: z.array(BackupPhotoV1Schema).default([]),
})

// Schema 2 (current): the manifest inside a .zip. Photo bytes live as sibling
// entries in the archive, so `file` points at one instead of carrying base64.
export const BackupPhotoV2Schema = z.object({
  id: z.string(),
  mime: z.string(),
  file: ArchivePathSchema, // e.g. "photos/<id>.jpg"
})

export const BackupEnvelopeV2Schema = z.object({
  schema: z.literal(2),
  exportedAt: z.iso.datetime().optional(),
  ...backupTables,
  photos: z.array(BackupPhotoV2Schema).default([]),
})

export const AnyBackupEnvelopeSchema = z.discriminatedUnion("schema", [
  BackupEnvelopeV1Schema,
  BackupEnvelopeV2Schema,
])

// Pre-zip names, kept pointing at V1 so existing imports keep working.
export const BackupPhotoSchema = BackupPhotoV1Schema
export const BackupEnvelopeSchema = BackupEnvelopeV1Schema

export type BackupEnvelopeV1 = z.infer<typeof BackupEnvelopeV1Schema>
export type BackupEnvelopeV2 = z.infer<typeof BackupEnvelopeV2Schema>
export type AnyBackupEnvelope = z.infer<typeof AnyBackupEnvelopeSchema>
export type BackupEnvelope = BackupEnvelopeV1

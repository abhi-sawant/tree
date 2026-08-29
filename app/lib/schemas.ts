import { z } from "zod"

export const PartialDateSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  approximate: z.boolean().optional(),
})

export const PersonSchema = z.object({
  id: z.string(),
  givenName: z.string().min(1),
  familyName: z.string().optional(),
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

export const RelationshipSchema = z.object({
  id: z.string(),
  type: z.enum(["parent-child", "spouse"]),
  from: z.string(),
  to: z.string(),
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

// Photos can't carry a raw Blob through JSON — export encodes them as base64;
// import decodes this shape back into a Blob.
export const BackupPhotoSchema = z.object({
  id: z.string(),
  mime: z.string(),
  data: z.string(), // base64, no "data:" prefix
})

export const BackupEnvelopeSchema = z.object({
  schema: z.literal(1),
  people: z.array(PersonSchema),
  relationships: z.array(RelationshipSchema),
  trees: z.array(TreeSchema),
  members: z.array(TreeMemberSchema),
  photos: z.array(BackupPhotoSchema).default([]),
})

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>

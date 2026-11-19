import { z } from 'zod'

// One preset describes what one exam portal accepts. Presets are plain JSON
// files in this folder, one per exam, checked against this schema.
// Every figure must come from the official source named in `source`; see
// docs/portal-rules.md for where each one was read.
//
// Objects are strict, so a misspelt key in a JSON file is an error instead
// of being silently ignored.

const kilobytes = z.number().positive()

export const sizeLimitSchema = z
  .strictObject({
    minKB: kilobytes.optional(),
    maxKB: kilobytes,
  })
  .refine((size) => size.minKB === undefined || size.minKB <= size.maxKB, {
    message: 'minKB must not be larger than maxKB',
  })

const positive = z.number().positive()
const pixelCount = z.number().int().positive()

// The portals state dimensions in three different ways.
export const dimensionsSchema = z.discriminatedUnion('kind', [
  // Exact pixel size. `preferred: true` means the source says "preferred",
  // so the portal may accept other sizes.
  z.strictObject({
    kind: z.literal('pixels'),
    width: pixelCount,
    height: pixelCount,
    preferred: z.boolean(),
  }),
  // Physical size only. When the source names no DPI, the app picks one
  // and must say it is FormReady's choice, not the portal's rule.
  z.strictObject({
    kind: z.literal('centimetres'),
    width: positive,
    height: positive,
    dpi: pixelCount.optional(),
    approximate: z.boolean(),
  }),
  // A pixel range that the source does not tie to a side (UPSC signature).
  z
    .strictObject({
      kind: z.literal('pixelRange'),
      min: pixelCount,
      max: pixelCount,
      appliesTo: z.enum(['width', 'height', 'both', 'unspecified']),
    })
    .refine((range) => range.min <= range.max, {
      message: 'min must not be larger than max',
    }),
])

export const uploadKindSchema = z.enum([
  'photo',
  'signature',
  'thumbImpression',
  'declaration',
  'document',
])

export const uploadSchema = z.strictObject({
  // Stable id, unique within a preset, e.g. "photo" or "class10-certificate".
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  label: z.string().min(1),
  kind: uploadKindSchema,
  format: z.enum(['jpeg', 'pdf']),
  size: sizeLimitSchema,
  dimensions: dimensionsSchema.optional(),
  // Exact file name without extension, only where the portal enforces one.
  fileName: z.string().min(1).optional(),
  // "always", or only for some candidates (e.g. a caste certificate).
  required: z.enum(['always', 'conditional']),
  pageSize: z.literal('A4').optional(),
  // Smallest share of the photo the face must cover, from 0 to 1.
  minFaceCoverage: z.number().gt(0).lte(1).optional(),
  // Plain-language rules shown to the user, as stated by the source.
  rules: z.array(z.string().min(1)),
  // Where the source contradicts itself: what it says, and what this preset uses.
  conflicts: z.array(z.string().min(1)),
})

export const presetSchema = z
  .strictObject({
    // Matches the JSON file name, e.g. "ssc-cgl" for ssc-cgl.json.
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    body: z.string().min(1),
    exam: z.string().min(1),
    source: z.strictObject({
      title: z.string().min(1),
      url: z.url({ protocol: /^https$/ }),
      // Date printed on the source, if it has one.
      publishedOn: z.iso.date().optional(),
      // When the rules were last read from the source ("rules as of").
      checkedOn: z.iso.date(),
    }),
    // The portal also captures a live photo by webcam or phone during the
    // form. FormReady cannot do that step for the user.
    liveCapture: z.boolean(),
    uploads: z.array(uploadSchema).min(1),
    notes: z.array(z.string().min(1)),
  })
  .superRefine((preset, ctx) => {
    const seen = new Set<string>()
    preset.uploads.forEach((upload, index) => {
      if (seen.has(upload.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate upload id "${upload.id}"`,
          path: ['uploads', index, 'id'],
        })
      }
      seen.add(upload.id)

      if (upload.format === 'pdf' && upload.dimensions !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'PDF uploads use pageSize, not dimensions',
          path: ['uploads', index, 'dimensions'],
        })
      }
      if (upload.format === 'jpeg' && upload.pageSize !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'pageSize only applies to PDF uploads',
          path: ['uploads', index, 'pageSize'],
        })
      }
      if (upload.minFaceCoverage !== undefined && upload.kind !== 'photo') {
        ctx.addIssue({
          code: 'custom',
          message: 'minFaceCoverage only applies to photos',
          path: ['uploads', index, 'minFaceCoverage'],
        })
      }
    })
  })

export type SizeLimit = z.infer<typeof sizeLimitSchema>
export type Dimensions = z.infer<typeof dimensionsSchema>
export type UploadKind = z.infer<typeof uploadKindSchema>
export type Upload = z.infer<typeof uploadSchema>
export type Preset = z.infer<typeof presetSchema>

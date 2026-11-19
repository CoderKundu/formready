import { presetSchema, type Preset } from './schema'

export type { Dimensions, Preset, SizeLimit, Upload, UploadKind } from './schema'

// Checks every preset file and returns them sorted by name. Throws with the
// file name and the failing field if a file does not match the schema, so a
// broken preset fails the build and the tests instead of reaching users.
export function loadPresets(files: Record<string, unknown>): Preset[] {
  const presets = Object.entries(files).map(([path, data]) => {
    const result = presetSchema.safeParse(data)
    if (!result.success) {
      const problems = result.error.issues
        .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')
      throw new Error(`Invalid preset ${path}:\n${problems}`)
    }

    const fileId = path.split('/').pop()?.replace(/\.json$/, '')
    if (result.data.id !== fileId) {
      throw new Error(
        `Invalid preset ${path}: id "${result.data.id}" must match the file name "${fileId}"`,
      )
    }
    return result.data
  })

  return presets.sort((a, b) => a.name.localeCompare(b.name))
}

export const presets: readonly Preset[] = loadPresets(
  import.meta.glob('./*.json', { eager: true, import: 'default' }),
)

export function getPreset(id: string): Preset | undefined {
  return presets.find((preset) => preset.id === id)
}

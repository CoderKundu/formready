// Kept apart from ghostscript.ts so the page can show these choices
// without bundling any Ghostscript code.

// How hard to shrink images. Text and vector graphics are kept as they are;
// only images are resampled. Ordered from largest output to smallest.
export const COMPRESSION_LEVELS = [
  { id: 'high', label: 'High quality', dpi: 200 },
  { id: 'balanced', label: 'Balanced', dpi: 150 },
  { id: 'small', label: 'Small', dpi: 100 },
  { id: 'smallest', label: 'Smallest', dpi: 72 },
] as const

export type CompressionLevelId = (typeof COMPRESSION_LEVELS)[number]['id']

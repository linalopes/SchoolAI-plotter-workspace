/**
 * Central limits for external SVG import.
 * Generous for generative plotting; prevents a malformed file from freezing the UI.
 */
export const SVG_IMPORT_LIMITS = {
  /** Maximum file size in bytes (10 MB). */
  maxFileBytes: 10 * 1024 * 1024,
  /** Maximum element nodes walked during import. */
  maxElementCount: 5_000,
  /** Maximum PlotPaths after flattening. */
  maxPathCount: 2_000,
  /** Maximum total points across all paths. */
  maxTotalPoints: 200_000,
  /** Maximum points in a single path. */
  maxPointsPerPath: 10_000,
  /** Soft wall-clock budget for import processing (ms). */
  maxProcessingMs: 8_000,
} as const;

export type SvgImportLimitKey = keyof typeof SVG_IMPORT_LIMITS;

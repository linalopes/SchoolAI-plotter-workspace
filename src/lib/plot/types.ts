/**
 * Internal plotting model.
 *
 * Generate, Prepare, and the machine streamer all speak this format. Future
 * sources (imported SVG, raster-derived paths) can produce the same document
 * without touching G-code generation.
 */

import type { SvgImportMetadata, SvgPathSourceMetadata } from './svgImport/types';

export type {
  SvgImportMetadata,
  SvgImportWarning,
  SvgPathSourceMetadata,
} from './svgImport/types';

export type PlotPoint = {
  x: number;
  y: number;
};

export type PlotPath = {
  id: string;
  points: PlotPoint[];
  closed: boolean;
  layerId?: string;
  /** Optional provenance for future pen/layer grouping. */
  svgSource?: SvgPathSourceMetadata;
};

export type PlotBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PlotSource = 'p5' | 'svg-import' | 'raster' | 'unknown';

/** How Generate converted p5 canvas units into millimetres for this document. */
export type P5SourceMetadata = {
  sketchId: string;
  sourceHash: string;
  canvasWidthUnits: number;
  canvasHeightUnits: number;
  physicalWidthMm: number;
  physicalHeightMm: number;
  millimetersPerUnit: number;
};

export type PlotDocument = {
  id: string;
  name: string;
  /** Source canvas / SVG width in millimetres after normalisation. */
  widthMm: number;
  /** Source canvas / SVG height in millimetres after normalisation. */
  heightMm: number;
  paths: PlotPath[];
  bounds: PlotBounds;
  source: PlotSource;
  createdAt: number;
  updatedAt: number;
  /**
   * Provenance SVG text. For p5 capture this is the plotSvg string.
   * For svg-import this is the **sanitized** source only — never unsanitized.
   */
  rawSvg?: string;
  /** Present when the document was captured from a Generate sketch. */
  p5Source?: P5SourceMetadata;
  /** Present when the document was imported from an external SVG file. */
  svgImport?: SvgImportMetadata;
};

/** Plot documents LocalStorage schema version (additive metadata). */
export const PLOT_DOCUMENT_STORAGE_VERSION = 2 as const;

/** Discrete rotations supported in this milestone. */
export type PlotRotation = 0 | 90 | 180 | 270;

/**
 * Placement of a PlotDocument in machine coordinates.
 *
 * `offsetXMm` / `offsetYMm` are absolute machine-space millimetres (same as
 * GRBL / Manual Control). Fit/Center bake the safe-area origin into these
 * offsets once; later stages must not add media-placement or insets again.
 */
export type PlotPlacement = {
  scale: number;
  /** Absolute machine-space X translation (mm). */
  offsetXMm: number;
  /** Absolute machine-space Y translation (mm). */
  offsetYMm: number;
  rotation: PlotRotation;
  marginMm: number;
  showPenUpTravel: boolean;
};

export const A4_LANDSCAPE = {
  widthMm: 297,
  heightMm: 210,
} as const;

export const DEFAULT_PLACEMENT: PlotPlacement = {
  scale: 1,
  offsetXMm: 0,
  offsetYMm: 0,
  rotation: 0,
  marginMm: 5,
  showPenUpTravel: true,
};

export type PlotMetrics = {
  pathCount: number;
  pointCount: number;
  penDownLengthMm: number;
  penUpLengthMm: number;
  bounds: PlotBounds;
};

export type TransformedPlot = {
  paths: PlotPath[];
  bounds: PlotBounds;
  penUpSegments: Array<{ from: PlotPoint; to: PlotPoint }>;
  metrics: PlotMetrics;
};

export function emptyBounds(): PlotBounds {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export function boundsWidth(bounds: PlotBounds): number {
  return bounds.maxX - bounds.minX;
}

export function boundsHeight(bounds: PlotBounds): number {
  return bounds.maxY - bounds.minY;
}

export function computeBounds(paths: PlotPath[]): PlotBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const path of paths) {
    for (const point of path.points) {
      found = true;
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (!found) return emptyBounds();
  return { minX, minY, maxX, maxY };
}

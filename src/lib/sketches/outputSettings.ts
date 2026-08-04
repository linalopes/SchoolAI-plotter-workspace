import { A4_LANDSCAPE } from '../plot/types';

/**
 * Physical output for a Generate sketch.
 *
 * Distinguishes logical p5 canvas units from intended millimetre size.
 * Prepare then applies a separate uniform scale on top of that.
 */

export type SketchOutputMode = 'preserve-current' | 'custom';

export type SketchOutputSettings = {
  version: 1;
  mode: SketchOutputMode;
  physicalWidthMm?: number;
  physicalHeightMm?: number;
  lockAspectRatio: true;
};

export const SKETCH_OUTPUT_VERSION = 1 as const;

/** Legacy Generate→PlotDocument conversion: fit canvas into A4 landscape. */
export function legacyFitToA4MmPerUnit(
  canvasWidthUnits: number,
  canvasHeightUnits: number,
): number {
  const w = Math.max(1e-6, canvasWidthUnits);
  const h = Math.max(1e-6, canvasHeightUnits);
  return Math.min(A4_LANDSCAPE.widthMm / w, A4_LANDSCAPE.heightMm / h);
}

export function legacyPhysicalSizeMm(
  canvasWidthUnits: number,
  canvasHeightUnits: number,
): { widthMm: number; heightMm: number; mmPerUnit: number } {
  const mmPerUnit = legacyFitToA4MmPerUnit(canvasWidthUnits, canvasHeightUnits);
  return {
    widthMm: canvasWidthUnits * mmPerUnit,
    heightMm: canvasHeightUnits * mmPerUnit,
    mmPerUnit,
  };
}

export function defaultOutputSettings(): SketchOutputSettings {
  return {
    version: SKETCH_OUTPUT_VERSION,
    mode: 'preserve-current',
    lockAspectRatio: true,
  };
}

export function resolveMillimetersPerUnit(
  output: SketchOutputSettings,
  canvasWidthUnits: number,
  canvasHeightUnits: number,
): number {
  if (
    output.mode === 'custom' &&
    typeof output.physicalWidthMm === 'number' &&
    output.physicalWidthMm > 0 &&
    canvasWidthUnits > 0
  ) {
    return output.physicalWidthMm / canvasWidthUnits;
  }
  return legacyFitToA4MmPerUnit(canvasWidthUnits, canvasHeightUnits);
}

export function deriveHeightFromWidth(
  canvasWidthUnits: number,
  canvasHeightUnits: number,
  physicalWidthMm: number,
): number {
  if (canvasWidthUnits <= 0) return physicalWidthMm;
  const aspect = canvasHeightUnits / canvasWidthUnits;
  return physicalWidthMm * aspect;
}

export function deriveWidthFromHeight(
  canvasWidthUnits: number,
  canvasHeightUnits: number,
  physicalHeightMm: number,
): number {
  if (canvasHeightUnits <= 0) return physicalHeightMm;
  const aspect = canvasWidthUnits / canvasHeightUnits;
  return physicalHeightMm * aspect;
}

export function formatMmPerUnit(mmPerUnit: number): string {
  return `${Number.parseFloat(mmPerUnit.toFixed(3))} mm/unit`;
}

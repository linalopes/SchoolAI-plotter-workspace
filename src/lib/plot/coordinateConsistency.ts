import type { GCodeProgram } from './gcode';
import type { PlotBounds, TransformedPlot } from './types';

/**
 * Ensures Prepare preview geometry and generated G-code share one page-space
 * source. Path points are already absolute page millimetres; the generator must
 * emit them without adding non-drawable / safe-area origins again.
 */

export const COORDINATE_TOLERANCE_MM = 0.05;

export type CoordinateConsistencyReport = {
  previewMinX: number;
  previewMaxX: number;
  previewMinY: number;
  previewMaxY: number;
  gcodeMinX: number;
  gcodeMaxX: number;
  gcodeMinY: number;
  gcodeMaxY: number;
  deltaMinX: number;
  deltaMaxX: number;
  deltaMinY: number;
  deltaMaxY: number;
  ok: boolean;
  summary: string;
};

/** Extract XY bounds from path travel/draw moves only (excludes park). */
export function extractGCodePathBounds(program: GCodeProgram): PlotBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const step of program.steps) {
    if (step.kind !== 'command') continue;
    if (step.phase !== 'travel' && step.phase !== 'draw') continue;
    const match = /^G[01]\s+X(-?\d+(?:\.\d+)?)\s+Y(-?\d+(?:\.\d+)?)/i.exec(
      step.line,
    );
    if (!match) continue;
    const x = Number.parseFloat(match[1] as string);
    const y = Number.parseFloat(match[2] as string);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    found = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

export function comparePreviewAndGCodeBounds(
  plot: TransformedPlot,
  program: GCodeProgram,
  toleranceMm = COORDINATE_TOLERANCE_MM,
): CoordinateConsistencyReport {
  const gcodeBounds = extractGCodePathBounds(program);
  const preview = plot.bounds;

  if (!gcodeBounds) {
    return {
      previewMinX: preview.minX,
      previewMaxX: preview.maxX,
      previewMinY: preview.minY,
      previewMaxY: preview.maxY,
      gcodeMinX: NaN,
      gcodeMaxX: NaN,
      gcodeMinY: NaN,
      gcodeMaxY: NaN,
      deltaMinX: NaN,
      deltaMaxX: NaN,
      deltaMinY: NaN,
      deltaMaxY: NaN,
      ok: false,
      summary:
        'Coordinate consistency: G-code contained no path travel/draw XY moves.',
    };
  }

  const deltaMinX = gcodeBounds.minX - preview.minX;
  const deltaMaxX = gcodeBounds.maxX - preview.maxX;
  const deltaMinY = gcodeBounds.minY - preview.minY;
  const deltaMaxY = gcodeBounds.maxY - preview.maxY;
  const ok =
    Math.abs(deltaMinX) <= toleranceMm &&
    Math.abs(deltaMaxX) <= toleranceMm &&
    Math.abs(deltaMinY) <= toleranceMm &&
    Math.abs(deltaMaxY) <= toleranceMm;

  const summary = [
    'Coordinate consistency',
    `Preview minimum X: ${preview.minX.toFixed(3)} mm`,
    `Preview maximum X: ${preview.maxX.toFixed(3)} mm`,
    `G-code minimum X: ${gcodeBounds.minX.toFixed(3)} mm`,
    `G-code maximum X: ${gcodeBounds.maxX.toFixed(3)} mm`,
    `Difference: ${deltaMinX.toFixed(3)} mm`,
  ].join('\n');

  return {
    previewMinX: preview.minX,
    previewMaxX: preview.maxX,
    previewMinY: preview.minY,
    previewMaxY: preview.maxY,
    gcodeMinX: gcodeBounds.minX,
    gcodeMaxX: gcodeBounds.maxX,
    gcodeMinY: gcodeBounds.minY,
    gcodeMaxY: gcodeBounds.maxY,
    deltaMinX,
    deltaMaxX,
    deltaMinY,
    deltaMaxY,
    ok,
    summary,
  };
}

/**
 * Throws when preview page-space bounds and G-code path bounds disagree.
 * Intended as a defensive gate before streaming a plot job.
 */
export function assertCoordinateConsistency(
  plot: TransformedPlot,
  program: GCodeProgram,
  toleranceMm = COORDINATE_TOLERANCE_MM,
): CoordinateConsistencyReport {
  const report = comparePreviewAndGCodeBounds(plot, program, toleranceMm);
  if (import.meta.env.DEV) {
    console.info(report.summary);
  }
  if (!report.ok) {
    throw new Error(
      [
        'Internal coordinate-space error: Prepare preview bounds and generated G-code bounds disagree.',
        report.summary,
        'Prepare and G-code must share the same machine-space path bounds. Plot was blocked.',
      ].join('\n'),
    );
  }
  return report;
}

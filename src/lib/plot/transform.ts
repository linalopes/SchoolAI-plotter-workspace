import type { RectMm } from '../machines/workspaceGeometry';
import { distance, pathLength } from './pathMath';
import { boundsFitSafeRect } from './plotValidation';
import {
  A4_LANDSCAPE,
  computeBounds,
  type PlotBounds,
  type PlotDocument,
  type PlotMetrics,
  type PlotPath,
  type PlotPlacement,
  type PlotPoint,
  type PlotRotation,
  type TransformedPlot,
} from './types';

/**
 * Places a PlotDocument in machine coordinates (millimetres, Y up).
 *
 * Coordinate spaces:
 * - Machine space (source of truth): same as GRBL / Manual Control.
 *   Transformed path points and PlotPlacement.offsetXMm/offsetYMm use this space.
 * - Safe-area-local: temporary layout space with (0,0) at safePlotRect origin.
 *   Conversion is `machine = safeRect.origin + local` and happens exactly once
 *   when Fit/Center store offsetXMm/offsetYMm.
 *
 * Fit and Center size against the safe rectangle in machine coordinates.
 * They must not be re-applied later in preview, G-code, or streaming.
 */

function rotatePoint(point: PlotPoint, rotation: PlotRotation): PlotPoint {
  switch (rotation) {
    case 90:
      return { x: -point.y, y: point.x };
    case 180:
      return { x: -point.x, y: -point.y };
    case 270:
      return { x: point.y, y: -point.x };
    default:
      return point;
  }
}

function rotatedLocalBounds(
  bounds: PlotBounds,
  rotation: PlotRotation,
): PlotBounds {
  const corners: PlotPoint[] = [
    { x: 0, y: 0 },
    { x: bounds.maxX - bounds.minX, y: 0 },
    { x: bounds.maxX - bounds.minX, y: bounds.maxY - bounds.minY },
    { x: 0, y: bounds.maxY - bounds.minY },
  ].map((point) => {
    const scaled = { x: point.x, y: point.y };
    return rotatePoint(scaled, rotation);
  });

  return computeBounds([
    {
      id: 'tmp',
      closed: false,
      points: corners,
    },
  ]);
}

export function transformDocument(
  document: PlotDocument,
  placement: PlotPlacement,
): TransformedPlot {
  const origin = { x: document.bounds.minX, y: document.bounds.minY };
  const width = document.bounds.maxX - document.bounds.minX;
  const height = document.bounds.maxY - document.bounds.minY;

  const localBounds: PlotBounds = {
    minX: 0,
    minY: 0,
    maxX: width * placement.scale,
    maxY: height * placement.scale,
  };

  const scaledOriginPaths: PlotPath[] = document.paths.map((path) => ({
    ...path,
    points: path.points.map((point) => ({
      x: (point.x - origin.x) * placement.scale,
      y: (point.y - origin.y) * placement.scale,
    })),
  }));

  const rotatedBounds = rotatedLocalBounds(localBounds, placement.rotation);

  const paths: PlotPath[] = scaledOriginPaths.map((path) => ({
    ...path,
    points: path.points.map((point) => {
      const rotated = rotatePoint(point, placement.rotation);
      return {
        x: rotated.x - rotatedBounds.minX + placement.offsetXMm,
        y: rotated.y - rotatedBounds.minY + placement.offsetYMm,
      };
    }),
  }));

  const bounds = computeBounds(paths);
  const penUpSegments: TransformedPlot['penUpSegments'] = [];

  for (let i = 1; i < paths.length; i += 1) {
    const prev = paths[i - 1];
    const next = paths[i];
    const from = prev?.points[prev.points.length - 1];
    const to = next?.points[0];
    if (from && to) penUpSegments.push({ from, to });
  }

  let penDownLengthMm = 0;
  for (const path of paths) penDownLengthMm += pathLength(path);

  let penUpLengthMm = 0;
  for (const segment of penUpSegments) {
    penUpLengthMm += distance(segment.from, segment.to);
  }

  const metrics: PlotMetrics = {
    pathCount: paths.length,
    pointCount: paths.reduce((sum, path) => sum + path.points.length, 0),
    penDownLengthMm,
    penUpLengthMm,
    bounds,
  };

  return { paths, bounds, penUpSegments, metrics };
}

/** @deprecated Prefer boundsFitSafeRect / assessPlotGeometry with profile geometry. */
export function fitsInWorkspace(
  bounds: PlotBounds,
  marginMm: number,
  workspace = A4_LANDSCAPE,
): boolean {
  return (
    bounds.minX >= marginMm - 1e-6 &&
    bounds.minY >= marginMm - 1e-6 &&
    bounds.maxX <= workspace.widthMm - marginMm + 1e-6 &&
    bounds.maxY <= workspace.heightMm - marginMm + 1e-6
  );
}

/** Uniform scale that fits the document into the safe plotting rectangle. */
export function fitScaleToRect(
  document: PlotDocument,
  rotation: PlotRotation,
  safeRect: RectMm,
): number {
  const width = Math.max(1e-6, document.bounds.maxX - document.bounds.minX);
  const height = Math.max(1e-6, document.bounds.maxY - document.bounds.minY);
  const local = rotatedLocalBounds(
    { minX: 0, minY: 0, maxX: width, maxY: height },
    rotation,
  );
  const availW = Math.max(1e-6, safeRect.width);
  const availH = Math.max(1e-6, safeRect.height);
  const contentW = Math.max(1e-6, local.maxX - local.minX);
  const contentH = Math.max(1e-6, local.maxY - local.minY);
  return Math.min(availW / contentW, availH / contentH);
}

/** @deprecated Prefer fitScaleToRect with the profile safe rectangle. */
export function fitScale(
  document: PlotDocument,
  rotation: PlotRotation,
  marginMm: number,
  workspace = A4_LANDSCAPE,
): number {
  return fitScaleToRect(document, rotation, {
    x: marginMm,
    y: marginMm,
    width: workspace.widthMm - marginMm * 2,
    height: workspace.heightMm - marginMm * 2,
  });
}

/**
 * Centers the current scale/rotation inside `safeRect` (machine coordinates).
 *
 * Returned `offsetXMm` / `offsetYMm` are absolute machine-space translations.
 * `transformDocument` then does `machine = local + offset` with no further
 * media-placement or inset addition.
 */
export function centerInRect(
  document: PlotDocument,
  placement: PlotPlacement,
  safeRect: RectMm,
): PlotPlacement {
  const fitted = transformDocument(document, {
    ...placement,
    offsetXMm: 0,
    offsetYMm: 0,
  });
  const contentW = fitted.bounds.maxX - fitted.bounds.minX;
  const contentH = fitted.bounds.maxY - fitted.bounds.minY;
  // Subtract local min so path content (not only the document AABB) lands
  // correctly; safeRect.origin is applied exactly once here.
  return {
    ...placement,
    offsetXMm:
      safeRect.x +
      (safeRect.width - contentW) / 2 -
      fitted.bounds.minX,
    offsetYMm:
      safeRect.y +
      (safeRect.height - contentH) / 2 -
      fitted.bounds.minY,
  };
}

/** @deprecated Prefer centerInRect with the profile safe rectangle. */
export function centerPlacement(
  document: PlotDocument,
  placement: PlotPlacement,
  workspace = A4_LANDSCAPE,
): PlotPlacement {
  return centerInRect(document, placement, {
    x: 0,
    y: 0,
    width: workspace.widthMm,
    height: workspace.heightMm,
  });
}

export function fitAndCenterInRect(
  document: PlotDocument,
  placement: PlotPlacement,
  safeRect: RectMm,
): PlotPlacement {
  const scale = fitScaleToRect(document, placement.rotation, safeRect);
  return centerInRect(document, { ...placement, scale }, safeRect);
}

/** @deprecated Prefer fitAndCenterInRect with the profile safe rectangle. */
export function fitAndCenter(
  document: PlotDocument,
  placement: PlotPlacement,
  workspace = A4_LANDSCAPE,
): PlotPlacement {
  return fitAndCenterInRect(document, placement, {
    x: placement.marginMm,
    y: placement.marginMm,
    width: workspace.widthMm - placement.marginMm * 2,
    height: workspace.heightMm - placement.marginMm * 2,
  });
}

export { boundsFitSafeRect };

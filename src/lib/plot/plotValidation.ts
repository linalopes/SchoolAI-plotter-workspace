import type { RectMm } from '../machines/workspaceGeometry';
import { rectContainsPoint } from '../machines/workspaceGeometry';
import type { PlotBounds, TransformedPlot } from './types';

const EPSILON_MM = 1e-6;

export type PlotFitSide = 'left' | 'right' | 'top' | 'bottom';

export type PlotGeometryAssessment = {
  fitsDrawable: boolean;
  fitsSafe: boolean;
  /** True when geometry is valid for plotting (inside safe area). */
  canPlot: boolean;
  outsideDrawablePathCount: number;
  outsideSafePathCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** How far outside the safe rect on each side (0 when inside). */
  safeOverflow: Record<PlotFitSide, number>;
  drawableOverflow: Record<PlotFitSide, number>;
  headline: string | null;
  detail: string | null;
};

function overflowVsRect(bounds: PlotBounds, rect: RectMm): Record<PlotFitSide, number> {
  return {
    left: Math.max(0, rect.x - bounds.minX),
    right: Math.max(0, bounds.maxX - (rect.x + rect.width)),
    bottom: Math.max(0, rect.y - bounds.minY),
    top: Math.max(0, bounds.maxY - (rect.y + rect.height)),
  };
}

function countPathsOutside(
  plot: TransformedPlot,
  rect: RectMm,
): number {
  let count = 0;
  for (const path of plot.paths) {
    const outside = path.points.some(
      (point) => !rectContainsPoint(rect, point.x, point.y, EPSILON_MM),
    );
    if (outside) count += 1;
  }
  return count;
}

/**
 * Validates every transformed point against drawable and safe rectangles.
 * Does not clip or mutate geometry.
 */
export function assessPlotGeometry(
  plot: TransformedPlot,
  drawableRect: RectMm,
  safePlotRect: RectMm,
): PlotGeometryAssessment {
  const outsideDrawablePathCount = countPathsOutside(plot, drawableRect);
  const outsideSafePathCount = countPathsOutside(plot, safePlotRect);
  const fitsDrawable = outsideDrawablePathCount === 0;
  const fitsSafe = outsideSafePathCount === 0;
  const safeOverflow = overflowVsRect(plot.bounds, safePlotRect);
  const drawableOverflow = overflowVsRect(plot.bounds, drawableRect);

  let headline: string | null = null;
  let detail: string | null = null;

  if (!fitsDrawable) {
    headline = 'Drawing enters a non-drawable area';
    const parts: string[] = [];
    if (drawableOverflow.left > EPSILON_MM) {
      parts.push(
        `The drawing extends into the non-drawable area on the left side of the page.`,
      );
      parts.push(`Minimum drawing X: ${plot.bounds.minX.toFixed(1)} mm`);
      parts.push(`Reachable minimum X: ${drawableRect.x.toFixed(1)} mm`);
    }
    if (drawableOverflow.right > EPSILON_MM) {
      parts.push(`Maximum drawing X: ${plot.bounds.maxX.toFixed(1)} mm`);
      parts.push(
        `Required maximum X: ${(drawableRect.x + drawableRect.width).toFixed(1)} mm`,
      );
    }
    if (drawableOverflow.bottom > EPSILON_MM || drawableOverflow.top > EPSILON_MM) {
      parts.push(
        `Drawing Y spans ${plot.bounds.minY.toFixed(1)}–${plot.bounds.maxY.toFixed(1)} mm.`,
      );
    }
    parts.push(
      `${outsideDrawablePathCount} path${outsideDrawablePathCount === 1 ? '' : 's'} contain points outside the drawable area.`,
    );
    detail = parts.join('\n');
  } else if (!fitsSafe) {
    headline = 'Drawing is outside the safe plotting area';
    const parts: string[] = [];
    if (safeOverflow.left > EPSILON_MM) {
      parts.push(`Minimum drawing X: ${plot.bounds.minX.toFixed(1)} mm`);
      parts.push(`Safe machine X minimum: ${safePlotRect.x.toFixed(1)} mm`);
      parts.push(`Outside safe area · Left by ${safeOverflow.left.toFixed(1)} mm`);
    }
    if (safeOverflow.right > EPSILON_MM) {
      parts.push(`Maximum drawing X: ${plot.bounds.maxX.toFixed(1)} mm`);
      parts.push(
        `Safe maximum X: ${(safePlotRect.x + safePlotRect.width).toFixed(1)} mm`,
      );
      parts.push(`Outside safe area · Right by ${safeOverflow.right.toFixed(1)} mm`);
    }
    if (safeOverflow.bottom > EPSILON_MM) {
      parts.push(`Outside safe area · Bottom by ${safeOverflow.bottom.toFixed(1)} mm`);
    }
    if (safeOverflow.top > EPSILON_MM) {
      parts.push(`Outside safe area · Top by ${safeOverflow.top.toFixed(1)} mm`);
    }
    detail = parts.join('\n');
  }

  return {
    fitsDrawable,
    fitsSafe,
    canPlot: fitsSafe,
    outsideDrawablePathCount,
    outsideSafePathCount,
    minX: plot.bounds.minX,
    maxX: plot.bounds.maxX,
    minY: plot.bounds.minY,
    maxY: plot.bounds.maxY,
    safeOverflow,
    drawableOverflow,
    headline,
    detail,
  };
}

/** Bounds-only check used by Fit helpers (still verifies against the safe rect). */
export function boundsFitSafeRect(bounds: PlotBounds, safe: RectMm): boolean {
  return (
    bounds.minX >= safe.x - EPSILON_MM &&
    bounds.minY >= safe.y - EPSILON_MM &&
    bounds.maxX <= safe.x + safe.width + EPSILON_MM &&
    bounds.maxY <= safe.y + safe.height + EPSILON_MM
  );
}

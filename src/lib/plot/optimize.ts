import { dedupePoints, pathLength } from './pathMath';
import { computeBounds, type PlotDocument, type PlotPath } from './types';

/**
 * Light cleanup before Prepare / G-code.
 *
 * Drawing order is preserved. Advanced path sorting is intentionally out of
 * scope for this milestone.
 */

const MIN_PATH_LENGTH_MM = 0.05;

export function optimizePlotDocument(document: PlotDocument): PlotDocument {
  const paths: PlotPath[] = [];

  for (const path of document.paths) {
    const points = dedupePoints(path.points);
    if (points.length < 2) continue;
    const cleaned: PlotPath = { ...path, points };
    if (pathLength(cleaned) < MIN_PATH_LENGTH_MM) continue;
    paths.push(cleaned);
  }

  return {
    ...document,
    paths,
    bounds: computeBounds(paths),
    updatedAt: Date.now(),
  };
}

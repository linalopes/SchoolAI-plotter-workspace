import type { PlotBounds, PlotPath, PlotPoint } from './types';

/** Geometry helpers shared by the SVG normaliser, metrics, and transforms. */

export function distance(a: PlotPoint, b: PlotPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(path: PlotPath): number {
  let total = 0;
  for (let i = 1; i < path.points.length; i += 1) {
    const prev = path.points[i - 1];
    const next = path.points[i];
    if (prev && next) total += distance(prev, next);
  }
  if (path.closed && path.points.length > 1) {
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    if (first && last) total += distance(last, first);
  }
  return total;
}

export function dedupePoints(points: PlotPoint[], epsilon = 1e-6): PlotPoint[] {
  if (points.length === 0) return [];
  const result: PlotPoint[] = [points[0] as PlotPoint];
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i] as PlotPoint;
    const prev = result[result.length - 1] as PlotPoint;
    if (distance(prev, point) > epsilon) result.push(point);
  }
  return result;
}

export function sampleQuadratic(
  p0: PlotPoint,
  p1: PlotPoint,
  p2: PlotPoint,
  steps: number,
): PlotPoint[] {
  const points: PlotPoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return points;
}

export function sampleCubic(
  p0: PlotPoint,
  p1: PlotPoint,
  p2: PlotPoint,
  p3: PlotPoint,
  steps: number,
): PlotPoint[] {
  const points: PlotPoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * p1.y +
        3 * u * t * t * p2.y +
        t * t * t * p3.y,
    });
  }
  return points;
}

/**
 * Samples an SVG elliptical arc into polyline points.
 *
 * Implements the endpoint-to-centre conversion from the SVG spec so arcs from
 * p5.plotSvg become plottable line segments.
 */
export function sampleArc(
  from: PlotPoint,
  rx: number,
  ry: number,
  xAxisRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: PlotPoint,
  steps = 24,
): PlotPoint[] {
  if (rx === 0 || ry === 0) return [to];

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rxAbs *= scale;
    ryAbs *= scale;
  }

  const rxSq = rxAbs * rxAbs;
  const rySq = ryAbs * ryAbs;
  const numerator =
    rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p;
  const denom = rxSq * y1p * y1p + rySq * x1p * x1p;
  let sq = denom === 0 ? 0 : numerator / denom;
  if (sq < 0) sq = 0;
  const sign = largeArc === sweep ? -1 : 1;
  const coef = sign * Math.sqrt(sq);
  const cxp = (coef * (rxAbs * y1p)) / ryAbs;
  const cyp = (coef * (-ryAbs * x1p)) / rxAbs;

  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (n === 0) return 0;
    let cos = (ux * vx + uy * vy) / n;
    cos = Math.min(1, Math.max(-1, cos));
    const a = Math.acos(cos);
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const startVector = {
    x: (x1p - cxp) / rxAbs,
    y: (y1p - cyp) / ryAbs,
  };
  const endVector = {
    x: (-x1p - cxp) / rxAbs,
    y: (-y1p - cyp) / ryAbs,
  };
  let theta1 = angle(1, 0, startVector.x, startVector.y);
  let delta = angle(startVector.x, startVector.y, endVector.x, endVector.y);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;

  const points: PlotPoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = theta1 + (delta * i) / steps;
    const x = cosPhi * rxAbs * Math.cos(t) - sinPhi * ryAbs * Math.sin(t) + cx;
    const y = sinPhi * rxAbs * Math.cos(t) + cosPhi * ryAbs * Math.sin(t) + cy;
    points.push({ x, y });
  }
  return points;
}

export function sampleCircle(
  cx: number,
  cy: number,
  r: number,
  steps = 48,
): PlotPoint[] {
  const points: PlotPoint[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    points.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return points;
}

export function sampleEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  steps = 48,
): PlotPoint[] {
  const points: PlotPoint[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    points.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return points;
}

export function expandBounds(bounds: PlotBounds, point: PlotPoint): PlotBounds {
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

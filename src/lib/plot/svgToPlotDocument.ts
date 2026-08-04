import { createId } from '../utils/misc';
import {
  dedupePoints,
  sampleCircle,
  sampleEllipse,
} from './pathMath';
import { SVG_FLATTEN } from './svgImport/flattenConfig';
import { parsePathD } from './svgPath';
import {
  A4_LANDSCAPE,
  computeBounds,
  type PlotDocument,
  type PlotPath,
  type PlotPoint,
} from './types';

export interface SvgParseResult {
  ok: boolean;
  document?: PlotDocument;
  warnings: string[];
  error?: string;
}

/**
 * Converts p5.plotSvg output into a PlotDocument.
 *
 * Only the element types that plotSvg emits for line work are handled. Pixel /
 * p5-unit coordinates are mapped into millimetres. By default this preserves
 * the legacy fit-into-A4-landscape conversion. Callers may pass an explicit
 * millimetersPerUnit (from sketch physical-output settings) instead.
 */

function parsePointsAttribute(value: string): PlotPoint[] {
  const numbers = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part))
    .filter((n) => Number.isFinite(n));
  const points: PlotPoint[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i] as number, y: numbers[i + 1] as number });
  }
  return dedupePoints(points);
}

function readNumber(el: Element, name: string, fallback = 0): number {
  const value = Number.parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function collectFromElement(
  el: Element,
  paths: PlotPath[],
  warnings: string[],
): void {
  const tag = el.tagName.toLowerCase();

  if (tag === 'g' || tag === 'svg') {
    for (const child of Array.from(el.children)) {
      collectFromElement(child, paths, warnings);
    }
    return;
  }

  if (tag === 'line') {
    const points = dedupePoints([
      { x: readNumber(el, 'x1'), y: readNumber(el, 'y1') },
      { x: readNumber(el, 'x2'), y: readNumber(el, 'y2') },
    ]);
    if (points.length >= 2) {
      paths.push({ id: createId('path'), points, closed: false });
    }
    return;
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const points = parsePointsAttribute(el.getAttribute('points') ?? '');
    if (points.length >= 2) {
      paths.push({
        id: createId('path'),
        points,
        closed: tag === 'polygon',
      });
    }
    return;
  }

  if (tag === 'circle') {
    const cx = readNumber(el, 'cx');
    const cy = readNumber(el, 'cy');
    const r = readNumber(el, 'r');
    if (r > 0) {
      paths.push({
        id: createId('path'),
        points: sampleCircle(cx, cy, r, SVG_FLATTEN.circleSteps),
        closed: true,
      });
    }
    return;
  }

  if (tag === 'ellipse') {
    const cx = readNumber(el, 'cx');
    const cy = readNumber(el, 'cy');
    const rx = readNumber(el, 'rx');
    const ry = readNumber(el, 'ry');
    if (rx > 0 && ry > 0) {
      paths.push({
        id: createId('path'),
        points: sampleEllipse(cx, cy, rx, ry, SVG_FLATTEN.ellipseSteps),
        closed: true,
      });
    }
    return;
  }

  if (tag === 'rect') {
    const x = readNumber(el, 'x');
    const y = readNumber(el, 'y');
    const w = readNumber(el, 'width');
    const h = readNumber(el, 'height');
    if (w > 0 && h > 0) {
      paths.push({
        id: createId('path'),
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        closed: true,
      });
    }
    return;
  }

  if (tag === 'path') {
    const d = el.getAttribute('d') ?? '';
    if (!d.trim()) return;
    try {
      for (const subpath of parsePathD(d)) {
        paths.push({
          id: createId('path'),
          points: subpath.points,
          closed: subpath.closed,
        });
      }
    } catch {
      warnings.push('A path element could not be fully parsed and was skipped.');
    }
    return;
  }

  if (tag === 'text' || tag === 'image' || tag === 'use') {
    warnings.push(
      `Unsupported SVG element <${tag}> was ignored. Plotter output is line-based.`,
    );
  }
}

export type SvgMillimetreOptions = {
  /**
   * Uniform millimetres per SVG/p5 unit. When omitted, uses the legacy
   * fit-into-A4-landscape conversion so existing captures stay the same size.
   */
  millimetersPerUnit?: number;
};

function mapToMillimetres(
  paths: PlotPath[],
  pixelWidth: number,
  pixelHeight: number,
  options: SvgMillimetreOptions = {},
): {
  paths: PlotPath[];
  widthMm: number;
  heightMm: number;
  millimetersPerUnit: number;
} {
  const safeW = pixelWidth > 0 ? pixelWidth : 1;
  const safeH = pixelHeight > 0 ? pixelHeight : 1;

  // Legacy default: fit the source canvas into A4 landscape (not DPI-based).
  const scale =
    typeof options.millimetersPerUnit === 'number' &&
    Number.isFinite(options.millimetersPerUnit) &&
    options.millimetersPerUnit > 0
      ? options.millimetersPerUnit
      : Math.min(A4_LANDSCAPE.widthMm / safeW, A4_LANDSCAPE.heightMm / safeH);
  const widthMm = safeW * scale;
  const heightMm = safeH * scale;

  const mapped = paths.map((path) => ({
    ...path,
    points: path.points.map((point) => ({
      x: point.x * scale,
      // SVG Y grows downward; plot space uses Y upward like the machine.
      y: (safeH - point.y) * scale,
    })),
  }));

  return { paths: mapped, widthMm, heightMm, millimetersPerUnit: scale };
}

function readSvgSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number.parseFloat(part));
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      (parts[2] as number) > 0 &&
      (parts[3] as number) > 0
    ) {
      return { width: parts[2] as number, height: parts[3] as number };
    }
  }

  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  return { width: 400, height: 400 };
}

export function svgToPlotDocument(
  svgText: string,
  name: string,
  options: SvgMillimetreOptions = {},
): SvgParseResult {
  const warnings: string[] = [];

  if (!svgText.trim()) {
    return { ok: false, warnings, error: 'The captured SVG was empty.' };
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch {
    return { ok: false, warnings, error: 'The captured SVG could not be parsed.' };
  }

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return {
      ok: false,
      warnings,
      error: 'The captured SVG contained a parse error.',
    };
  }

  const svg = doc.querySelector('svg');
  if (!svg) {
    return { ok: false, warnings, error: 'No <svg> root was found in the capture.' };
  }

  const rawPaths: PlotPath[] = [];
  collectFromElement(svg, rawPaths, warnings);

  if (rawPaths.length === 0) {
    return {
      ok: false,
      warnings,
      error:
        'No plottable paths were found. Use line-based drawing commands (line, beginShape, circle, rect) without relying on fills.',
    };
  }

  const size = readSvgSize(svg);
  const mapped = mapToMillimetres(rawPaths, size.width, size.height, options);
  const now = Date.now();

  const document: PlotDocument = {
    id: createId('plot'),
    name,
    widthMm: mapped.widthMm,
    heightMm: mapped.heightMm,
    paths: mapped.paths,
    bounds: computeBounds(mapped.paths),
    source: 'p5',
    createdAt: now,
    updatedAt: now,
    rawSvg: svgText,
  };

  return { ok: true, document, warnings };
}

/** Exported for calibration / tests — SVG size from viewBox or width/height. */
export function readCapturedSvgSize(svgText: string): {
  width: number;
  height: number;
} | null {
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    return readSvgSize(svg);
  } catch {
    return null;
  }
}

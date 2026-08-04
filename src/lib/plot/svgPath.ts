import { SVG_FLATTEN } from './svgImport/flattenConfig';
import {
  dedupePoints,
  sampleArc,
  sampleCubic,
  sampleQuadratic,
} from './pathMath';
import type { PlotPoint } from './types';

/**
 * SVG path `d` parser for p5.plotSvg capture and external SVG import.
 *
 * Supports M/L/H/V/C/S/Q/T/A/Z and relative forms. Curves are flattened with
 * fixed sampling from SVG_FLATTEN.
 */

export type ParsePathDResult = {
  subpaths: { points: PlotPoint[]; closed: boolean }[];
  warnings: string[];
};

const COMMAND =
  /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;

function tokenize(d: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  COMMAND.lastIndex = 0;
  while ((match = COMMAND.exec(d)) !== null) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(match[2]);
  }
  return tokens;
}

function readNumber(tokens: string[], index: { i: number }): number {
  const raw = tokens[index.i];
  index.i += 1;
  const value = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(value)) {
    throw new Error('Malformed path number.');
  }
  return value;
}

function reflect(control: PlotPoint | null, pen: PlotPoint): PlotPoint {
  if (!control) return { ...pen };
  return { x: 2 * pen.x - control.x, y: 2 * pen.y - control.y };
}

/**
 * Parse a path `d` attribute into subpaths.
 * Malformed commands produce warnings and skip that command's parameters when possible.
 */
export function parsePathDDetailed(d: string): ParsePathDResult {
  const tokens = tokenize(d);
  const subpaths: { points: PlotPoint[]; closed: boolean }[] = [];
  const warnings: string[] = [];
  let current: PlotPoint[] = [];
  let closed = false;
  let pen: PlotPoint = { x: 0, y: 0 };
  let start: PlotPoint = { x: 0, y: 0 };
  /** Last cubic/quadratic control point for S/T reflection. */
  let lastControl: PlotPoint | null = null;
  /** 'C' | 'Q' | null — which command produced lastControl. */
  let lastControlKind: 'C' | 'Q' | null = null;
  let command = '';
  const index = { i: 0 };

  const flush = () => {
    const points = dedupePoints(current);
    if (points.length >= 2) subpaths.push({ points, closed });
    current = [];
    closed = false;
  };

  const push = (point: PlotPoint) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    current.push(point);
    pen = point;
  };

  while (index.i < tokens.length) {
    const token = tokens[index.i];
    if (!token) break;
    if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(token)) {
      command = token;
      index.i += 1;
    } else if (!command) {
      index.i += 1;
      continue;
    }

    const relative = command === command.toLowerCase();
    const kind = command.toUpperCase();

    try {
      switch (kind) {
        case 'M': {
          if (current.length > 0) flush();
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          const point = {
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          };
          start = point;
          push(point);
          lastControl = null;
          lastControlKind = null;
          command = relative ? 'l' : 'L';
          break;
        }
        case 'L': {
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          push({
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          });
          lastControl = null;
          lastControlKind = null;
          break;
        }
        case 'H': {
          const x = readNumber(tokens, index);
          push({ x: relative ? pen.x + x : x, y: pen.y });
          lastControl = null;
          lastControlKind = null;
          break;
        }
        case 'V': {
          const y = readNumber(tokens, index);
          push({ x: pen.x, y: relative ? pen.y + y : y });
          lastControl = null;
          lastControlKind = null;
          break;
        }
        case 'C': {
          const x1 = readNumber(tokens, index);
          const y1 = readNumber(tokens, index);
          const x2 = readNumber(tokens, index);
          const y2 = readNumber(tokens, index);
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          const c1 = {
            x: relative ? pen.x + x1 : x1,
            y: relative ? pen.y + y1 : y1,
          };
          const c2 = {
            x: relative ? pen.x + x2 : x2,
            y: relative ? pen.y + y2 : y2,
          };
          const end = {
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          };
          for (const point of sampleCubic(
            pen,
            c1,
            c2,
            end,
            SVG_FLATTEN.cubicSteps,
          )) {
            push(point);
          }
          lastControl = c2;
          lastControlKind = 'C';
          break;
        }
        case 'S': {
          const x2 = readNumber(tokens, index);
          const y2 = readNumber(tokens, index);
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          const c1: PlotPoint =
            lastControlKind === 'C' ? reflect(lastControl, pen) : { x: pen.x, y: pen.y };
          const c2: PlotPoint = {
            x: relative ? pen.x + x2 : x2,
            y: relative ? pen.y + y2 : y2,
          };
          const end: PlotPoint = {
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          };
          for (const point of sampleCubic(
            pen,
            c1,
            c2,
            end,
            SVG_FLATTEN.cubicSteps,
          )) {
            push(point);
          }
          lastControl = c2;
          lastControlKind = 'C';
          break;
        }
        case 'Q': {
          const x1 = readNumber(tokens, index);
          const y1 = readNumber(tokens, index);
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          const c1 = {
            x: relative ? pen.x + x1 : x1,
            y: relative ? pen.y + y1 : y1,
          };
          const end = {
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          };
          for (const point of sampleQuadratic(
            pen,
            c1,
            end,
            SVG_FLATTEN.quadraticSteps,
          )) {
            push(point);
          }
          lastControl = c1;
          lastControlKind = 'Q';
          break;
        }
        case 'T': {
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          const c1: PlotPoint =
            lastControlKind === 'Q' ? reflect(lastControl, pen) : { x: pen.x, y: pen.y };
          const end: PlotPoint = {
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          };
          for (const point of sampleQuadratic(
            pen,
            c1,
            end,
            SVG_FLATTEN.quadraticSteps,
          )) {
            push(point);
          }
          lastControl = c1;
          lastControlKind = 'Q';
          break;
        }
        case 'A': {
          const rx = readNumber(tokens, index);
          const ry = readNumber(tokens, index);
          const rot = readNumber(tokens, index);
          const large = readNumber(tokens, index) !== 0;
          const sweep = readNumber(tokens, index) !== 0;
          const x = readNumber(tokens, index);
          const y = readNumber(tokens, index);
          const end = {
            x: relative ? pen.x + x : x,
            y: relative ? pen.y + y : y,
          };
          for (const point of sampleArc(
            pen,
            rx,
            ry,
            rot,
            large,
            sweep,
            end,
            SVG_FLATTEN.arcSteps,
          )) {
            push(point);
          }
          lastControl = null;
          lastControlKind = null;
          break;
        }
        case 'Z': {
          closed = true;
          pen = start;
          lastControl = null;
          lastControlKind = null;
          flush();
          break;
        }
        default:
          warnings.push(`Unknown path command “${command}” was skipped.`);
          index.i += 1;
          lastControl = null;
          lastControlKind = null;
          break;
      }
    } catch {
      warnings.push('A path command was malformed and was skipped.');
      // Skip one token and continue — do not abort the whole path.
      if (index.i < tokens.length) index.i += 1;
      lastControl = null;
      lastControlKind = null;
    }
  }

  if (current.length > 0) flush();
  return { subpaths, warnings };
}

/** Backward-compatible wrapper used by p5 capture normalisation. */
export function parsePathD(d: string): { points: PlotPoint[]; closed: boolean }[] {
  return parsePathDDetailed(d).subpaths;
}

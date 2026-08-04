import type { PlotPoint } from '../types';

/**
 * 2D affine matrix for SVG CTM composition.
 *
 * Column-vector convention: p' = M · p
 * Components: [a c e; b d f; 0 0 1]
 *
 * SVG transform lists multiply left-to-right as written:
 *   transform="translate(10) scale(2)" → M = T · S
 *   (scale applied first to the point, then translate).
 *
 * Parent composition: CTM = Parent · Local
 */
export type Matrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

export function translate(tx: number, ty = 0): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scale(sx: number, sy = sx): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotate(angleDeg: number, cx = 0, cy = 0): Matrix2D {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const r: Matrix2D = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  if (cx === 0 && cy === 0) return r;
  return multiply(translate(cx, cy), multiply(r, translate(-cx, -cy)));
}

export function skewX(angleDeg: number): Matrix2D {
  const t = Math.tan((angleDeg * Math.PI) / 180);
  return { a: 1, b: 0, c: t, d: 1, e: 0, f: 0 };
}

export function skewY(angleDeg: number): Matrix2D {
  const t = Math.tan((angleDeg * Math.PI) / 180);
  return { a: 1, b: t, c: 0, d: 1, e: 0, f: 0 };
}

export function matrix(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): Matrix2D {
  return { a, b, c, d, e, f };
}

export function transformPoint(m: Matrix2D, point: PlotPoint): PlotPoint {
  return {
    x: m.a * point.x + m.c * point.y + m.e,
    y: m.b * point.x + m.d * point.y + m.f,
  };
}

export function transformPoints(m: Matrix2D, points: PlotPoint[]): PlotPoint[] {
  return points.map((point) => transformPoint(m, point));
}

/**
 * Parse an SVG transform attribute into a single matrix.
 * Functions are composed left-to-right as written (SVG spec).
 */
export function parseTransformAttribute(value: string | null | undefined): Matrix2D {
  if (!value || !value.trim()) return IDENTITY;
  let result = IDENTITY;
  const re =
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    const args = (match[2] ?? '')
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((part) => Number.parseFloat(part));
    let next = IDENTITY;
    switch (name) {
      case 'matrix':
        if (args.length >= 6) {
          next = matrix(
            args[0]!,
            args[1]!,
            args[2]!,
            args[3]!,
            args[4]!,
            args[5]!,
          );
        }
        break;
      case 'translate':
        next = translate(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'scale':
        next = scale(args[0] ?? 1, args[1] ?? args[0] ?? 1);
        break;
      case 'rotate':
        next = rotate(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
        break;
      case 'skewx':
        next = skewX(args[0] ?? 0);
        break;
      case 'skewy':
        next = skewY(args[0] ?? 0);
        break;
      default:
        break;
    }
    result = multiply(result, next);
  }
  return result;
}

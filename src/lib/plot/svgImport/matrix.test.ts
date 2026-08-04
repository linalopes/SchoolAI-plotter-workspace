import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  multiply,
  parseTransformAttribute,
  rotate,
  scale,
  skewX,
  skewY,
  transformPoint,
  translate,
} from './matrix';

describe('SVG CTM', () => {
  it('applies translate and scale', () => {
    const p = transformPoint(translate(10, 5), { x: 1, y: 2 });
    expect(p).toEqual({ x: 11, y: 7 });
    const s = transformPoint(scale(2, 3), { x: 4, y: 5 });
    expect(s).toEqual({ x: 8, y: 15 });
  });

  it('rotates around origin and center', () => {
    const aroundOrigin = transformPoint(rotate(90), { x: 1, y: 0 });
    expect(aroundOrigin.x).toBeCloseTo(0, 6);
    expect(aroundOrigin.y).toBeCloseTo(1, 6);

    const aroundCenter = transformPoint(rotate(90, 10, 10), { x: 20, y: 10 });
    expect(aroundCenter.x).toBeCloseTo(10, 6);
    expect(aroundCenter.y).toBeCloseTo(20, 6);
  });

  it('supports matrix, skewX, skewY', () => {
    const m = transformPoint(
      { a: 1, b: 0, c: 0, d: 1, e: 3, f: 4 },
      { x: 1, y: 1 },
    );
    expect(m).toEqual({ x: 4, y: 5 });
    expect(transformPoint(skewX(45), { x: 0, y: 1 }).x).toBeCloseTo(1, 6);
    expect(transformPoint(skewY(45), { x: 1, y: 0 }).y).toBeCloseTo(1, 6);
  });

  it('multiplies Parent × Local (local applied first to the point)', () => {
    // Parent translate(10), local scale(2): point 1 → scale to 2 → translate to 12
    const ctm = multiply(translate(10), scale(2));
    expect(transformPoint(ctm, { x: 1, y: 0 })).toEqual({ x: 12, y: 0 });
    // Reversed order would yield 22
    const reversed = multiply(scale(2), translate(10));
    expect(transformPoint(reversed, { x: 1, y: 0 })).toEqual({ x: 22, y: 0 });
  });

  it('parses transform lists left-to-right as written', () => {
    // translate(10) scale(2) → M = T·S → scale first
    const m = parseTransformAttribute('translate(10) scale(2)');
    expect(transformPoint(m, { x: 1, y: 0 })).toEqual({ x: 12, y: 0 });
  });

  it('composes nested group transforms', () => {
    const parent = parseTransformAttribute('translate(10,10)');
    const child = parseTransformAttribute('scale(2)');
    const ctm = multiply(parent, child);
    expect(transformPoint(ctm, { x: 5, y: 0 })).toEqual({ x: 20, y: 10 });
  });

  it('identity leaves points unchanged', () => {
    expect(transformPoint(IDENTITY, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
});

import { describe, expect, it } from 'vitest';
import { parsePathDDetailed } from '../svgPath';

describe('SVG path S/T commands', () => {
  it('reflects cubic controls for S/s', () => {
    // C to (100,0) with c2 at (50,0); S should reflect c2 over pen
    const { subpaths } = parsePathDDetailed('M0 0 C0 0 50 0 100 0 S150 0 200 0');
    expect(subpaths).toHaveLength(1);
    const pts = subpaths[0]!.points;
    expect(pts[pts.length - 1]!.x).toBeCloseTo(200, 5);
  });

  it('reflects quadratic controls for T/t', () => {
    const { subpaths } = parsePathDDetailed('M0 0 Q50 50 100 0 T200 0');
    expect(subpaths[0]!.points.at(-1)!.x).toBeCloseTo(200, 5);
  });

  it('resets reflected control after unrelated commands', () => {
    const { subpaths } = parsePathDDetailed('M0 0 C0 0 50 0 100 0 L150 0 S200 0 250 0');
    // After L, S should treat missing control as pen (not previous C control)
    expect(subpaths[0]!.points.at(-1)!.x).toBeCloseTo(250, 5);
  });

  it('keeps multiple subpaths and relative commands', () => {
    const { subpaths } = parsePathDDetailed('M10 10 l20 0 m30 0 l10 0 Z');
    expect(subpaths.length).toBeGreaterThanOrEqual(2);
  });

  it('marks closed subpaths', () => {
    const { subpaths } = parsePathDDetailed('M0 0 H10 V10 H0 Z');
    expect(subpaths.some((s) => s.closed)).toBe(true);
  });

  it('warns on malformed numbers without aborting later valid geometry', () => {
    const { subpaths, warnings } = parsePathDDetailed('M0 0 L10 10 L NaN 5 M20 20 L30 30');
    expect(warnings.length).toBeGreaterThan(0);
    expect(subpaths.some((s) => s.points.some((p) => p.x === 30))).toBe(true);
  });
});

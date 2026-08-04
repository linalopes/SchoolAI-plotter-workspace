import { describe, expect, it } from 'vitest';
import {
  lengthToMillimetres,
  MM_PER_CM,
  MM_PER_INCH,
  MM_PER_PC,
  MM_PER_PT,
  MM_PER_PX,
  parseSvgLength,
} from './units';

describe('SVG length units', () => {
  it('converts mm, cm, in, pt, pc, and px', () => {
    expect(lengthToMillimetres(parseSvgLength('10mm')!)).toBeCloseTo(10);
    expect(lengthToMillimetres(parseSvgLength('2cm')!)).toBeCloseTo(2 * MM_PER_CM);
    expect(lengthToMillimetres(parseSvgLength('1in')!)).toBeCloseTo(MM_PER_INCH);
    expect(lengthToMillimetres(parseSvgLength('72pt')!)).toBeCloseTo(MM_PER_INCH);
    expect(lengthToMillimetres(parseSvgLength('1pc')!)).toBeCloseTo(MM_PER_PC);
    expect(lengthToMillimetres(parseSvgLength('96px')!)).toBeCloseTo(MM_PER_INCH);
    expect(MM_PER_PX).toBeCloseTo(25.4 / 96);
    expect(MM_PER_PT).toBeCloseTo(MM_PER_INCH / 72);
  });

  it('treats unitless values as CSS px at 96 DPI', () => {
    const parsed = parseSvgLength('400')!;
    expect(parsed.unit).toBe('unitless');
    expect(lengthToMillimetres(parsed)).toBeCloseTo(400 * MM_PER_PX);
  });

  it('does not silently convert percentages', () => {
    const parsed = parseSvgLength('100%')!;
    expect(parsed.unit).toBe('percentage');
    expect(lengthToMillimetres(parsed)).toBeNull();
  });
});

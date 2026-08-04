import { describe, expect, it } from 'vitest';
import {
  deriveHeightFromWidth,
  deriveWidthFromHeight,
  legacyFitToA4MmPerUnit,
  legacyPhysicalSizeMm,
  resolveMillimetersPerUnit,
} from './outputSettings';

describe('sketch output settings', () => {
  it('preserves legacy fit-to-A4 conversion for 400×400 (0.525 mm/unit)', () => {
    const mmPerUnit = legacyFitToA4MmPerUnit(400, 400);
    expect(mmPerUnit).toBeCloseTo(210 / 400, 10);
    expect(mmPerUnit).toBeCloseTo(0.525, 10);
    const size = legacyPhysicalSizeMm(400, 400);
    expect(size.widthMm).toBeCloseTo(210, 10);
    expect(size.heightMm).toBeCloseTo(210, 10);
  });

  it('editing physical width derives height with locked aspect ratio', () => {
    const height = deriveHeightFromWidth(400, 400, 180);
    expect(height).toBeCloseTo(180, 10);
    const width = deriveWidthFromHeight(400, 200, 100);
    expect(width).toBeCloseTo(200, 10);
  });

  it('keeps source canvas aspect authoritative for custom output', () => {
    const mm = resolveMillimetersPerUnit(
      {
        version: 1,
        mode: 'custom',
        physicalWidthMm: 180,
        physicalHeightMm: 999,
        lockAspectRatio: true,
      },
      400,
      200,
    );
    expect(mm).toBeCloseTo(180 / 400, 10);
  });

  it('preserve-current mode uses legacy conversion', () => {
    const mm = resolveMillimetersPerUnit(
      { version: 1, mode: 'preserve-current', lockAspectRatio: true },
      400,
      400,
    );
    expect(mm).toBeCloseTo(0.525, 10);
  });
});

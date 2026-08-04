import { describe, expect, it } from 'vitest';
import { generateGCode } from '../plot/gcode';
import { createDefaultProfile } from '../machines/profiles/defaults';
import { transformDocument } from '../plot/transform';
import { DEFAULT_PLACEMENT } from '../plot/types';
import { captureSvgToPlotDocument } from './capturePlot';
import { defaultOutputSettings } from './outputSettings';

const CALIBRATION_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <line x1="50" y1="200" x2="150" y2="200" />
</svg>
`;

describe('capture conversion audit', () => {
  it('maps 100 p5 units to 52.5 mm with legacy preserve-current (fit A4)', () => {
    const parsed = captureSvgToPlotDocument({
      svg: CALIBRATION_SVG,
      name: 'Calibration',
      sketchId: 'sketch-cal',
      source: 'function setup(){ createCanvas(400,400); }',
      canvasWidthUnits: 400,
      canvasHeightUnits: 400,
      output: defaultOutputSettings(),
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.millimetersPerUnit).toBeCloseTo(0.525, 10);
    const line = parsed.document!.paths[0]!;
    const dx = Math.abs(line.points[1]!.x - line.points[0]!.x);
    expect(dx).toBeCloseTo(52.5, 10);
    expect(parsed.document!.widthMm).toBeCloseTo(210, 10);
    expect(parsed.p5Source?.physicalWidthMm).toBeCloseTo(210, 10);
  });

  it('converts p5 units to millimetres exactly once for custom output', () => {
    const parsed = captureSvgToPlotDocument({
      svg: CALIBRATION_SVG,
      name: 'Custom',
      sketchId: 'sketch-1',
      source: 'x',
      canvasWidthUnits: 400,
      canvasHeightUnits: 400,
      output: {
        version: 1,
        mode: 'custom',
        physicalWidthMm: 180,
        physicalHeightMm: 180,
        lockAspectRatio: true,
      },
    });
    expect(parsed.ok).toBe(true);
    const dx = Math.abs(
      parsed.document!.paths[0]!.points[1]!.x -
        parsed.document!.paths[0]!.points[0]!.x,
    );
    expect(dx).toBeCloseTo(45, 10);
    expect(parsed.document!.p5Source?.millimetersPerUnit).toBeCloseTo(0.45, 10);
  });

  it('Prepare scale 1 preserves Generate physical output; G-code does not re-scale', () => {
    const parsed = captureSvgToPlotDocument({
      svg: CALIBRATION_SVG,
      name: 'Scale1',
      sketchId: 'sketch-1',
      source: 'x',
      canvasWidthUnits: 400,
      canvasHeightUnits: 400,
      output: {
        version: 1,
        mode: 'custom',
        physicalWidthMm: 180,
        physicalHeightMm: 180,
        lockAspectRatio: true,
      },
    });
    const doc = parsed.document!;
    const transformed = transformDocument(doc, {
      ...DEFAULT_PLACEMENT,
      scale: 1,
      offsetXMm: 0,
      offsetYMm: 0,
    });
    const path = transformed.paths[0]!;
    const dx = Math.abs(path.points[1]!.x - path.points[0]!.x);
    expect(dx).toBeCloseTo(45, 5);

    const program = generateGCode(transformed, createDefaultProfile(), {
      feedRateMmPerMin: 2000,
      dryRun: true,
    });
    expect(program.lines.some((line) => line.startsWith('G1 '))).toBe(true);
    // G-code emits page millimetres directly — no second p5-unit conversion.
    expect(program.lines.join('\n')).not.toMatch(/0\.525|96\s*dpi/i);
  });
});

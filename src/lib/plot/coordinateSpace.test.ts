import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../machines/profiles/defaults';
import {
  calculateWorkspaceGeometry,
  ZERO_INSETS,
  ZERO_MEDIA_PLACEMENT,
} from '../machines/workspaceGeometry';
import { streamPlotSteps } from '../jobs/plotJob';
import {
  assertCoordinateConsistency,
  comparePreviewAndGCodeBounds,
  extractGCodePathBounds,
} from './coordinateConsistency';
import { generateGCode } from './gcode';
import { svgToPlotDocument } from './svgToPlotDocument';
import { assessPlotGeometry } from './plotValidation';
import {
  centerInRect,
  fitAndCenterInRect,
  transformDocument,
} from './transform';
import {
  DEFAULT_PLACEMENT,
  type PlotDocument,
  type PlotPlacement,
} from './types';

const XY_PLACEMENT = {
  machineOriginOnMediaXmm: 30,
  machineOriginOnMediaYmm: 0,
};

function xyGeometry() {
  return calculateWorkspaceGeometry(
    297,
    210,
    ZERO_INSETS,
    5,
    XY_PLACEMENT,
  );
}

function rectDoc(
  width: number,
  height: number,
  extras?: Partial<PlotDocument>,
): PlotDocument {
  return {
    id: 'doc',
    name: 'Test',
    widthMm: width,
    heightMm: height,
    source: 'p5',
    createdAt: 0,
    updatedAt: 0,
    bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    paths: [
      {
        id: 'p1',
        closed: false,
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
      },
    ],
    ...extras,
  };
}

function placement(overrides: Partial<PlotPlacement> = {}): PlotPlacement {
  return { ...DEFAULT_PLACEMENT, ...overrides };
}

describe('machine-space media model', () => {
  it('keeps physical page 297 × 210 with machine origin on media X = 30', () => {
    const geometry = xyGeometry();
    expect(geometry.mediaRect.width).toBe(297);
    expect(geometry.mediaRect.height).toBe(210);
    expect(geometry.mediaRect.x).toBe(-30);
    expect(geometry.mediaRect.x + geometry.mediaRect.width).toBe(267);
  });

  it('safe machine X begins at 5 and ends at 262', () => {
    const geometry = xyGeometry();
    expect(geometry.safePlotRect).toEqual({
      x: 5,
      y: 5,
      width: 257,
      height: 200,
    });
  });

  it('Position X = 5 is valid; X = 0 is outside safe; X = -1 is unreachable', () => {
    const geometry = xyGeometry();
    const at5 = transformDocument(rectDoc(10, 10), placement({ offsetXMm: 5, offsetYMm: 5 }));
    const at0 = transformDocument(rectDoc(10, 10), placement({ offsetXMm: 0, offsetYMm: 5 }));
    const atNeg = transformDocument(
      rectDoc(10, 10),
      placement({ offsetXMm: -1, offsetYMm: 5 }),
    );

    expect(
      assessPlotGeometry(at5, geometry.drawableRect, geometry.safePlotRect).canPlot,
    ).toBe(true);

    const zeroAssessment = assessPlotGeometry(
      at0,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    expect(zeroAssessment.canPlot).toBe(false);
    expect(zeroAssessment.fitsDrawable).toBe(true);

    const negAssessment = assessPlotGeometry(
      atNeg,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    expect(negAssessment.canPlot).toBe(false);
    expect(negAssessment.fitsDrawable).toBe(false);
  });

  it('Fit to safe area uses machine X = 5 for full-width content', () => {
    const geometry = xyGeometry();
    const doc = rectDoc(257, 200);
    const plot = transformDocument(
      doc,
      fitAndCenterInRect(doc, placement(), geometry.safePlotRect),
    );
    expect(plot.bounds.minX).toBeCloseTo(5, 5);
    expect(plot.bounds.minX).not.toBeCloseTo(35, 0);
  });

  it('Center uses machine-space center X = 133.5', () => {
    const geometry = xyGeometry();
    const doc = rectDoc(10, 10);
    const next = centerInRect(doc, placement({ scale: 1 }), geometry.safePlotRect);
    const plot = transformDocument(doc, next);
    const midX = (plot.bounds.minX + plot.bounds.maxX) / 2;
    expect(midX).toBeCloseTo(133.5, 5);
  });

  it('local zero with Position X = 5 emits G0 X5, not X35', () => {
    const profile = createDefaultProfile();
    const plot = transformDocument(
      rectDoc(10, 10),
      placement({ offsetXMm: 5, offsetYMm: 5 }),
    );
    const program = generateGCode(plot, profile, {
      feedRateMmPerMin: 1000,
      dryRun: true,
    });
    expect(program.lines.some((line) => line.startsWith('G0 X5'))).toBe(true);
    expect(program.lines.some((line) => /G[01] X35\b/.test(line))).toBe(false);
  });

  it('G-code park uses safe machine corner X5 Y5', () => {
    const profile = createDefaultProfile();
    const plot = transformDocument(
      rectDoc(10, 10),
      placement({ offsetXMm: 40, offsetYMm: 20 }),
    );
    const program = generateGCode(plot, profile, {
      feedRateMmPerMin: 1000,
      dryRun: true,
    });
    const last = [...program.steps]
      .reverse()
      .find((step) => step.kind === 'command' && !step.line.startsWith('('));
    expect(last && last.kind === 'command' ? last.line : null).toBe('G0 X5 Y5');
  });

  it('preview and G-code machine-space bounds match', () => {
    const geometry = xyGeometry();
    const profile = createDefaultProfile();
    const doc = rectDoc(100, 60);
    const plot = transformDocument(
      doc,
      fitAndCenterInRect(doc, placement(), geometry.safePlotRect),
    );
    const program = generateGCode(plot, profile, {
      feedRateMmPerMin: 1000,
      dryRun: true,
    });
    const report = comparePreviewAndGCodeBounds(plot, program);
    expect(report.ok).toBe(true);
    assertCoordinateConsistency(plot, program);
  });

  it('media preview includes negative machine X; origin is 30 mm inside paper', () => {
    const geometry = xyGeometry();
    expect(geometry.mediaRect.x).toBe(-30);
    expect(geometry.unreachableRects.some((r) => r.x === -30 && r.width === 30)).toBe(
      true,
    );
    // Machine origin is 30 mm from media left edge.
    expect(0 - geometry.mediaRect.x).toBe(30);
  });

  it('repeated Fit / Center do not drift', () => {
    const geometry = xyGeometry();
    const doc = rectDoc(120, 80);
    let next = placement();
    for (let i = 0; i < 5; i += 1) {
      next = fitAndCenterInRect(doc, next, geometry.safePlotRect);
    }
    const afterFit = transformDocument(doc, next);
    for (let i = 0; i < 5; i += 1) {
      next = centerInRect(doc, next, geometry.safePlotRect);
    }
    const afterCenter = transformDocument(doc, next);
    expect(afterCenter.bounds.minX).toBeCloseTo(afterFit.bounds.minX, 5);
  });

  it('zero-offset profiles keep previous aligned behaviour', () => {
    const geometry = calculateWorkspaceGeometry(
      297,
      210,
      ZERO_INSETS,
      5,
      ZERO_MEDIA_PLACEMENT,
    );
    expect(geometry.safePlotRect.x).toBe(5);
    const doc = rectDoc(geometry.safePlotRect.width, geometry.safePlotRect.height);
    const plot = transformDocument(
      doc,
      fitAndCenterInRect(doc, placement(), geometry.safePlotRect),
    );
    expect(plot.bounds.minX).toBeCloseTo(5, 5);
  });

  it('profile switching recalculates safe area without accumulating offsets', () => {
    const xy = xyGeometry();
    const zero = calculateWorkspaceGeometry(
      297,
      210,
      ZERO_INSETS,
      5,
      ZERO_MEDIA_PLACEMENT,
    );
    const doc = rectDoc(100, 100);
    const a = fitAndCenterInRect(doc, placement(), xy.safePlotRect);
    const b = fitAndCenterInRect(doc, a, zero.safePlotRect);
    const c = fitAndCenterInRect(doc, b, xy.safePlotRect);
    expect(c.offsetXMm).toBeCloseTo(a.offsetXMm, 5);
  });

  it('job streamer sends XY lines without modification', async () => {
    const profile = createDefaultProfile();
    const plot = transformDocument(
      rectDoc(10, 10),
      placement({ offsetXMm: 5, offsetYMm: 5 }),
    );
    const program = generateGCode(plot, profile, {
      feedRateMmPerMin: 1000,
      dryRun: true,
    });
    const sent: string[] = [];
    await streamPlotSteps(program.steps, {
      profile,
      isCancelled: () => false,
      onProgress: () => undefined,
      onStatusLabel: () => undefined,
      send: async (line) => {
        sent.push(line);
        return { ok: true, command: line };
      },
      waitIdle: async () => undefined,
      sleep: async () => undefined,
    });
    for (const line of program.lines.filter((entry) => /^G[01]\s/i.test(entry))) {
      expect(sent).toContain(line);
    }
  });

  it('Wave lines Fit: preview min X equals G-code min X in machine space', () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  ${Array.from({ length: 12 }, (_, row) => {
    const margin = 40;
    const y0 = margin + (row * (400 - margin * 2)) / 11;
    const pts: string[] = [];
    for (let x = margin; x <= 400 - margin; x += 4) {
      const t = ((x - margin) / (400 - margin * 2)) * Math.PI * 2 * 3;
      const y = y0 + Math.sin(t + row * 0.4) * 10;
      pts.push(`${x},${y}`);
    }
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="black"/>`;
  }).join('\n')}
</svg>`;
    const parsed = svgToPlotDocument(svg, 'Wave lines');
    expect(parsed.ok).toBe(true);
    const doc = parsed.document!;
    const geometry = xyGeometry();
    const plot = transformDocument(
      doc,
      fitAndCenterInRect(doc, placement(), geometry.safePlotRect),
    );
    const program = generateGCode(plot, createDefaultProfile(), {
      feedRateMmPerMin: 1000,
      dryRun: true,
    });
    const gBounds = extractGCodePathBounds(program)!;
    expect(plot.bounds.minX).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(plot.bounds.minX).toBeLessThan(40);
    expect(gBounds.minX).toBeCloseTo(plot.bounds.minX, 2);
    expect(gBounds.minX).not.toBeCloseTo(plot.bounds.minX + 30, 0);
  });
});

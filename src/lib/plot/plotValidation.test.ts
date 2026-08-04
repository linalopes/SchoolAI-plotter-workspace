import { describe, expect, it } from 'vitest';
import {
  calculateWorkspaceGeometry,
  ZERO_INSETS,
} from '../machines/workspaceGeometry';
import { assessPlotGeometry } from './plotValidation';
import {
  centerInRect,
  fitAndCenterInRect,
  transformDocument,
} from './transform';
import { DEFAULT_PLACEMENT, type PlotDocument } from './types';

const XY_PLACEMENT = {
  machineOriginOnMediaXmm: 30,
  machineOriginOnMediaYmm: 0,
};
const geometry = calculateWorkspaceGeometry(
  297,
  210,
  ZERO_INSETS,
  5,
  XY_PLACEMENT,
);

function docAt(minX: number, minY: number, maxX: number, maxY: number): PlotDocument {
  return {
    id: 'd',
    name: 'Test',
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    source: 'p5',
    createdAt: 0,
    updatedAt: 0,
    bounds: { minX, minY, maxX, maxY },
    paths: [
      {
        id: 'p',
        closed: false,
        points: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
        ],
      },
    ],
  };
}

describe('assessPlotGeometry against XY Plotter safe area (machine space)', () => {
  it('rejects a document at machine X = -1 (unreachable)', () => {
    const plot = transformDocument(docAt(0, 5, 50, 50), {
      ...DEFAULT_PLACEMENT,
      offsetXMm: -1,
      offsetYMm: 5,
      scale: 1,
    });
    const assessment = assessPlotGeometry(
      plot,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    expect(assessment.fitsDrawable).toBe(false);
    expect(assessment.canPlot).toBe(false);
  });

  it('treats machine X = 0 as reachable but outside the 5 mm safe margin', () => {
    const plot = transformDocument(docAt(0, 0, 40, 40), {
      ...DEFAULT_PLACEMENT,
      scale: 1,
      offsetXMm: 0,
      offsetYMm: 5,
    });
    const assessment = assessPlotGeometry(
      plot,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    expect(assessment.fitsDrawable).toBe(true);
    expect(assessment.fitsSafe).toBe(false);
    expect(assessment.headline).toMatch(/safe plotting area/i);
  });

  it('accepts a document beginning at machine X = 5', () => {
    const plot = transformDocument(docAt(0, 0, 40, 40), {
      ...DEFAULT_PLACEMENT,
      scale: 1,
      offsetXMm: 5,
      offsetYMm: 5,
    });
    const assessment = assessPlotGeometry(
      plot,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    expect(assessment.fitsSafe).toBe(true);
    expect(assessment.canPlot).toBe(true);
  });

  it('accepts a point at machine X = 262 and rejects beyond', () => {
    const okPlot = {
      paths: [
        {
          id: 'p',
          closed: false,
          points: [
            { x: 262, y: 100 },
            { x: 262, y: 101 },
          ],
        },
      ],
      bounds: { minX: 262, minY: 100, maxX: 262, maxY: 101 },
      penUpSegments: [],
      metrics: {
        pathCount: 1,
        pointCount: 2,
        penDownLengthMm: 1,
        penUpLengthMm: 0,
        bounds: { minX: 262, minY: 100, maxX: 262, maxY: 101 },
      },
    };
    expect(
      assessPlotGeometry(okPlot, geometry.drawableRect, geometry.safePlotRect)
        .canPlot,
    ).toBe(true);

    const badPlot = {
      ...okPlot,
      paths: [
        {
          id: 'p',
          closed: false,
          points: [
            { x: 262.1, y: 100 },
            { x: 262.1, y: 101 },
          ],
        },
      ],
      bounds: { minX: 262.1, minY: 100, maxX: 262.1, maxY: 101 },
      metrics: {
        ...okPlot.metrics,
        bounds: { minX: 262.1, minY: 100, maxX: 262.1, maxY: 101 },
      },
    };
    expect(
      assessPlotGeometry(badPlot, geometry.drawableRect, geometry.safePlotRect)
        .fitsSafe,
    ).toBe(false);
  });
});

describe('Fit / Center use the machine-space safe rectangle', () => {
  it('centers on the safe-area center (133.5, 105)', () => {
    const document = docAt(0, 0, 100, 50);
    const placement = centerInRect(
      document,
      { ...DEFAULT_PLACEMENT, scale: 1 },
      geometry.safePlotRect,
    );
    const plot = transformDocument(document, placement);
    const midX = (plot.bounds.minX + plot.bounds.maxX) / 2;
    const midY = (plot.bounds.minY + plot.bounds.maxY) / 2;
    expect(midX).toBeCloseTo(133.5, 1);
    expect(midY).toBeCloseTo(105, 1);
  });

  it('fits inside the safe rectangle, not requiring X = 35', () => {
    const document = docAt(0, 0, 400, 300);
    const placement = fitAndCenterInRect(
      document,
      DEFAULT_PLACEMENT,
      geometry.safePlotRect,
    );
    const plot = transformDocument(document, placement);
    const assessment = assessPlotGeometry(
      plot,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    expect(assessment.canPlot).toBe(true);
    expect(plot.bounds.minX).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(plot.bounds.maxX).toBeLessThanOrEqual(262 + 1e-6);
  });

  it('revalidates after rotation', () => {
    const document = docAt(0, 0, 200, 20);
    const upright = fitAndCenterInRect(
      document,
      { ...DEFAULT_PLACEMENT, rotation: 0 },
      geometry.safePlotRect,
    );
    expect(
      assessPlotGeometry(
        transformDocument(document, upright),
        geometry.drawableRect,
        geometry.safePlotRect,
      ).canPlot,
    ).toBe(true);

    const rotated = fitAndCenterInRect(
      document,
      { ...DEFAULT_PLACEMENT, rotation: 90 },
      geometry.safePlotRect,
    );
    const plot = transformDocument(document, rotated);
    expect(
      assessPlotGeometry(plot, geometry.drawableRect, geometry.safePlotRect)
        .canPlot,
    ).toBe(true);
  });
});

describe('machine-space coordinates are used as-is', () => {
  it('keeps Position X = 5 as machine X = 5', () => {
    const plot = transformDocument(docAt(0, 0, 10, 10), {
      ...DEFAULT_PLACEMENT,
      scale: 1,
      offsetXMm: 5,
      offsetYMm: 5,
    });
    expect(plot.paths[0]!.points[0]).toEqual({ x: 5, y: 5 });
    expect(plot.bounds.minX).toBe(5);
  });
});

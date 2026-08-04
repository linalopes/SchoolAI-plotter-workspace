import { describe, expect, it } from 'vitest';
import {
  centerPlacement,
  fitAndCenter,
  fitsInWorkspace,
  transformDocument,
} from './transform';
import {
  A4_LANDSCAPE,
  DEFAULT_PLACEMENT,
  type PlotDocument,
} from './types';

function sampleDocument(): PlotDocument {
  return {
    id: 'doc-1',
    name: 'Sample',
    widthMm: 100,
    heightMm: 50,
    source: 'p5',
    createdAt: 0,
    updatedAt: 0,
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
    paths: [
      {
        id: 'p1',
        closed: false,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
        ],
      },
      {
        id: 'p2',
        closed: false,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      },
    ],
  };
}

describe('transformDocument', () => {
  it('applies scale and offset', () => {
    const plot = transformDocument(sampleDocument(), {
      ...DEFAULT_PLACEMENT,
      scale: 2,
      offsetXMm: 10,
      offsetYMm: 5,
    });
    expect(plot.bounds.minX).toBeCloseTo(10);
    expect(plot.bounds.minY).toBeCloseTo(5);
    expect(plot.bounds.maxX).toBeCloseTo(210);
    expect(plot.bounds.maxY).toBeCloseTo(105);
    expect(plot.metrics.pathCount).toBe(2);
    expect(plot.penUpSegments.length).toBe(1);
  });

  it('legacy fitAndCenter still fits inside A4 with uniform margin', () => {
    const placement = fitAndCenter(sampleDocument(), {
      ...DEFAULT_PLACEMENT,
      marginMm: 10,
      rotation: 0,
    });
    const plot = transformDocument(sampleDocument(), placement);
    expect(fitsInWorkspace(plot.bounds, 10, A4_LANDSCAPE)).toBe(true);

    const centred = centerPlacement(sampleDocument(), placement);
    const centredPlot = transformDocument(sampleDocument(), centred);
    const midX = (centredPlot.bounds.minX + centredPlot.bounds.maxX) / 2;
    const midY = (centredPlot.bounds.minY + centredPlot.bounds.maxY) / 2;
    expect(midX).toBeCloseTo(A4_LANDSCAPE.widthMm / 2, 1);
    expect(midY).toBeCloseTo(A4_LANDSCAPE.heightMm / 2, 1);
  });
});

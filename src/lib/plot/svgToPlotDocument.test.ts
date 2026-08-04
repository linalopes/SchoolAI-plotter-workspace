import { describe, expect, it } from 'vitest';
import { svgToPlotDocument } from './svgToPlotDocument';

describe('svgToPlotDocument', () => {
  it('converts basic line and shape elements into paths', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <line x1="0" y1="0" x2="100" y2="100" />
        <rect x="10" y="10" width="20" height="20" />
        <circle cx="200" cy="200" r="10" />
        <polyline points="0,50 50,50 50,100" />
      </svg>
    `;

    const result = svgToPlotDocument(svg, 'Test drawing');
    expect(result.ok).toBe(true);
    expect(result.document).toBeDefined();
    expect(result.document!.name).toBe('Test drawing');
    expect(result.document!.source).toBe('p5');
    expect(result.document!.paths.length).toBeGreaterThanOrEqual(4);
    expect(result.document!.bounds.maxX).toBeGreaterThan(result.document!.bounds.minX);
  });

  it('maps SVG Y-down into plot Y-up millimetres', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <line x1="0" y1="0" x2="0" y2="100" />
      </svg>
    `;
    const result = svgToPlotDocument(svg, 'Y flip');
    expect(result.ok).toBe(true);
    const points = result.document!.paths[0]!.points;
    // Top of SVG (y=0) should become the top of the page space after flip,
    // which is the larger Y in machine coordinates.
    expect(points[0]!.y).toBeGreaterThan(points[1]!.y);
  });

  it('rejects empty captures', () => {
    const result = svgToPlotDocument('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'Empty');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no plottable paths/i);
  });
});

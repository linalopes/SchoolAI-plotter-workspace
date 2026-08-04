import { describe, expect, it } from 'vitest';
import { SKETCH_EXAMPLES } from './examples';
import {
  auditAllExampleSources,
  auditCapturedDocument,
  formatAuditSummary,
} from './exampleAudit';

/**
 * Synthetic SVG fixtures derived from the same geometry as each example.
 * These stand in for p5.plotSvg output so the PlotDocument audit can run in
 * Node/jsdom without a browser iframe. Regenerate mentally from examples.ts
 * when example geometry changes; noise uses a fixed seeded pattern of short lines.
 */

function svgFromLines(
  lines: Array<[number, number, number, number]>,
  closedPaths: string[] = [],
): string {
  const lineEls = lines
    .map(
      ([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">${lineEls}${closedPaths.join('')}</svg>`;
}

function fixtureFor(id: string): string {
  switch (id) {
    case 'simple-line':
      // Prefer rect + lines as separate paths like plotSvg often emits.
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <rect x="40" y="40" width="320" height="320" fill="none" />
        <line x1="40" y1="40" x2="360" y2="360" />
        <line x1="360" y1="40" x2="40" y2="360" />
      </svg>`;
    case 'grid': {
      const lines: Array<[number, number, number, number]> = [];
      for (let x = 40; x <= 360; x += 32) lines.push([x, 40, x, 360]);
      for (let y = 40; y <= 360; y += 32) lines.push([40, y, 360, y]);
      return svgFromLines(lines);
    }
    case 'circles': {
      const circles = [];
      for (let r = 20; r <= 160; r += 20) {
        circles.push(`<circle cx="200" cy="200" r="${r}" fill="none" />`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">${circles.join('')}</svg>`;
    }
    case 'wave-lines': {
      const paths = [];
      for (let row = 0; row < 12; row++) {
        const y0 = 40 + row * ((400 - 80) / 11);
        const pts: string[] = [];
        for (let x = 40; x <= 360; x += 4) {
          const t = ((x - 40) / 320) * Math.PI * 2 * 3;
          const y = y0 + Math.sin(t + row * 0.4) * 10;
          pts.push(`${x},${y}`);
        }
        paths.push(`<polyline points="${pts.join(' ')}" fill="none" />`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">${paths.join('')}</svg>`;
    }
    case 'noise-field': {
      // Deterministic stand-in: a dense field of short segments (same structure
      // as the example). Real capture uses noiseSeed(42) in the iframe runtime.
      const lines: Array<[number, number, number, number]> = [];
      let i = 0;
      for (let y = 30; y < 370; y += 14) {
        for (let x = 30; x < 370; x += 14) {
          const a = (i++ % 7) * 0.7;
          lines.push([x, y, x + Math.cos(a) * 10, y + Math.sin(a) * 10]);
        }
      }
      return svgFromLines(lines);
    }
    case 'polyline-composition':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <polygon points="60,80 180,60 220,140 120,200" fill="none" />
        <polyline points="220,220 250,200 280,240 310,200 340,220" fill="none" />
        <rect x="60" y="240" width="100" height="100" fill="none" />
        <circle cx="280" cy="100" r="35" fill="none" />
      </svg>`;
    default:
      return svgFromLines([[0, 0, 10, 10]]);
  }
}

describe('built-in example audit', () => {
  it('audits all example sources as deterministic global-mode sketches', () => {
    const results = auditAllExampleSources();
    // eslint-disable-next-line no-console
    console.log(`\n${formatAuditSummary(results)}\n`);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results).toHaveLength(6);
  });

  it('audits capture→PlotDocument geometry for every example', () => {
    const results = SKETCH_EXAMPLES.map((example) =>
      auditCapturedDocument(example, fixtureFor(example.id)),
    );
    // eslint-disable-next-line no-console
    console.log(`\n${formatAuditSummary(results)}\n`);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('keeps noise/random examples seeded', () => {
    const noise = SKETCH_EXAMPLES.find((example) => example.id === 'noise-field');
    expect(noise?.source).toContain('noiseSeed(42)');
    expect(noise?.source).toContain('randomSeed(42)');
  });
});

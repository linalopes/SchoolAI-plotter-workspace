import { svgToPlotDocument } from '../plot/svgToPlotDocument';
import type { PlotDocument, PlotPath } from '../plot/types';
import { SKETCH_EXAMPLES } from './examples';
import type { SketchExample } from './types';

/**
 * Developer-facing audit helpers for built-in examples.
 *
 * Geometry assertions run against PlotDocuments produced by the same
 * SVG → PlotDocument pipeline used after Capture SVG.
 */

export type ExampleAuditResult = {
  id: string;
  name: string;
  ok: boolean;
  notes: string[];
  errors: string[];
};

function finitePoint(path: PlotPath): boolean {
  return path.points.every(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );
}

function hasFiniteBounds(document: PlotDocument): boolean {
  const { bounds } = document;
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite);
}

export function assertValidPlotDocument(document: PlotDocument): string[] {
  const errors: string[] = [];
  if (document.paths.length === 0) errors.push('Document has no paths.');
  if (!hasFiniteBounds(document)) errors.push('Document bounds are not finite.');
  for (const path of document.paths) {
    if (path.points.length < 2) errors.push(`Path ${path.id} has fewer than 2 points.`);
    if (!finitePoint(path)) errors.push(`Path ${path.id} contains NaN or Infinity.`);
  }
  return errors;
}

export function auditExampleSource(example: SketchExample): ExampleAuditResult {
  const errors: string[] = [];
  const notes: string[] = [];

  if (!example.source.includes('function setup()')) {
    errors.push('Missing setup().');
  }
  if (!example.source.includes('function draw()')) {
    errors.push('Missing draw().');
  }
  if (!/\bcreateCanvas\s*\(/.test(example.source)) {
    errors.push('Missing createCanvas().');
  }
  if (/\bp\.createCanvas\s*\(/.test(example.source)) {
    errors.push('Uses instance-mode p.createCanvas.');
  }
  if (/\bwith\s*\(/.test(example.source)) {
    errors.push('Contains a with statement.');
  }
  if (/fill\s*\(/i.test(example.source) && !/noFill\s*\(/i.test(example.source)) {
    notes.push('Calls fill() without noFill(); fills are ignored for plotting.');
  }

  if (example.id === 'noise-field') {
    if (!example.source.includes('noiseSeed(42)')) {
      errors.push('Noise field must set noiseSeed(42) for deterministic output.');
    }
    if (!example.source.includes('randomSeed(42)')) {
      errors.push('Noise field must set randomSeed(42) for deterministic output.');
    }
  }

  notes.push('Source is standard global-mode p5.');
  return {
    id: example.id,
    name: example.name,
    ok: errors.length === 0,
    notes,
    errors,
  };
}

export function auditCapturedDocument(
  example: SketchExample,
  svg: string,
): ExampleAuditResult {
  const base = auditExampleSource(example);
  const parsed = svgToPlotDocument(svg, example.name);
  if (!parsed.ok || !parsed.document) {
    return {
      ...base,
      ok: false,
      errors: [...base.errors, parsed.error ?? 'SVG normalisation failed.'],
    };
  }

  const errors = [...base.errors, ...assertValidPlotDocument(parsed.document)];
  const notes = [...base.notes];
  const doc = parsed.document;

  switch (example.id) {
    case 'simple-line':
      if (doc.paths.length < 3) {
        errors.push('Simple line test should include border + two diagonals (≥ 3 paths).');
      }
      break;
    case 'grid': {
      const vertical = doc.paths.filter((path) => {
        const xs = new Set(path.points.map((p) => p.x.toFixed(3)));
        return xs.size === 1 && path.points.length >= 2;
      });
      const horizontal = doc.paths.filter((path) => {
        const ys = new Set(path.points.map((p) => p.y.toFixed(3)));
        return ys.size === 1 && path.points.length >= 2;
      });
      if (vertical.length < 2) errors.push('Grid should include multiple vertical paths.');
      if (horizontal.length < 2) {
        errors.push('Grid should include multiple horizontal paths.');
      }
      break;
    }
    case 'circles': {
      const closed = doc.paths.filter((path) => path.closed);
      if (closed.length < 4) {
        errors.push('Circles should include multiple closed circular paths.');
      }
      break;
    }
    case 'wave-lines':
      if (doc.paths.length < 6) {
        errors.push('Wave lines should include multiple polyline-like paths.');
      }
      break;
    case 'noise-field':
      if (doc.paths.length < 20) {
        errors.push('Noise field should produce many short line segments.');
      }
      notes.push('Deterministic seeds are present in source.');
      break;
    case 'polyline-composition': {
      const closed = doc.paths.filter((path) => path.closed);
      const open = doc.paths.filter((path) => !path.closed);
      if (closed.length < 1) errors.push('Polyline composition should keep closed paths.');
      if (open.length < 1) errors.push('Polyline composition should keep open paths.');
      break;
    }
    default:
      break;
  }

  notes.push(`Paths: ${doc.paths.length}`);
  return {
    id: example.id,
    name: example.name,
    ok: errors.length === 0,
    notes,
    errors,
  };
}

export function auditAllExampleSources(): ExampleAuditResult[] {
  return SKETCH_EXAMPLES.map((example) => auditExampleSource(example));
}

export function formatAuditSummary(results: ExampleAuditResult[]): string {
  const lines = ['Example audit summary', '---------------------'];
  for (const result of results) {
    lines.push(
      `${result.ok ? 'PASS' : 'FAIL'}  ${result.name} (${result.id})`,
    );
    for (const note of result.notes) lines.push(`  note: ${note}`);
    for (const error of result.errors) lines.push(`  error: ${error}`);
  }
  const failed = results.filter((result) => !result.ok).length;
  lines.push(`Result: ${results.length - failed}/${results.length} passed`);
  return lines.join('\n');
}

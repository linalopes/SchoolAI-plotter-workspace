import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../machines/profiles/defaults';
import {
  __resetPlotDocumentsForTests,
  plotDocuments,
  setActivePlotDocument,
} from '../documents';
import { generateGCode } from '../gcode';
import { transformDocument } from '../transform';
import { DEFAULT_PLACEMENT } from '../types';
import illustratorSmooth from './fixtures/illustrator-smooth.svg?raw';
import inkscapeNested from './fixtures/inkscape-nested.svg?raw';
import malicious from './fixtures/malicious.svg?raw';
import primitives from './fixtures/primitives.svg?raw';
import turtletoySimple from './fixtures/turtletoy-simple.svg?raw';
import viewboxOrigin from './fixtures/viewbox-origin.svg?raw';
import {
  confirmSvgImport,
  documentNameFromSvgFileName,
  prepareSvgImport,
  uniqueDocumentName,
} from './importSvg';
import { sanitizeSvgMarkup } from './sanitize';
import { MM_PER_PX } from './units';

describe('sanitizeSvgMarkup', () => {
  it('removes scripts, handlers, foreignObject, and external URLs', () => {
    const result = sanitizeSvgMarkup(malicious);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sanitizedSvg).not.toMatch(/<script/i);
    expect(result.sanitizedSvg).not.toMatch(/onload=/i);
    expect(result.sanitizedSvg).not.toMatch(/foreignObject/i);
    expect(result.sanitizedSvg).not.toMatch(/https:\/\//i);
    expect(result.sanitizedSvg).not.toMatch(/javascript:/i);
    expect(result.removedCounts['tag:script']).toBeGreaterThan(0);
  });
});

describe('prepareSvgImport', () => {
  it('imports Turtletoy-style SVG into non-empty geometry', () => {
    const draft = prepareSvgImport(turtletoySimple, {
      fileName: 'turtle-study.svg',
    });
    expect(draft.status).not.toBe('cannot-import');
    expect(draft.paths.length).toBeGreaterThan(0);
    expect(draft.widthMm).toBeCloseTo(800 * MM_PER_PX, 2);
  });

  it('applies Inkscape nested transforms into millimeter bounds', () => {
    const draft = prepareSvgImport(inkscapeNested, {
      fileName: 'inkscape.svg',
    });
    expect(draft.status).not.toBe('cannot-import');
    expect(draft.metadata.sizeSource).toBe('physical');
    expect(draft.widthMm).toBeCloseTo(100);
    expect(draft.paths.length).toBeGreaterThan(0);
  });

  it('imports Illustrator-style S/T paths', () => {
    const draft = prepareSvgImport(illustratorSmooth, {
      fileName: 'ai.svg',
    });
    expect(draft.paths.length).toBeGreaterThanOrEqual(2);
    expect(draft.status).not.toBe('cannot-import');
  });

  it('supports primitives and filled-shape outline warning', () => {
    const draft = prepareSvgImport(primitives, {
      fileName: 'primitives.svg',
    });
    expect(draft.paths.length).toBeGreaterThanOrEqual(6);
    expect(draft.metadata.filledShapeCount).toBeGreaterThan(0);
    expect(
      draft.metadata.warnings.some((w) => w.code === 'fill-outline'),
    ).toBe(true);
  });

  it('respects non-zero viewBox origins', () => {
    const draft = prepareSvgImport(viewboxOrigin, {
      fileName: 'vb.svg',
    });
    expect(draft.metadata.viewBox?.minX).toBe(-50);
    expect(draft.paths.length).toBe(2);
    const xs = draft.paths.flatMap((p) => p.points.map((pt) => pt.x));
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(mid).toBeGreaterThan(30);
    expect(mid).toBeLessThan(70);
  });

  it('uses 96 DPI for unitless/viewBox-only size with editable override', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><line x1="0" y1="0" x2="400" y2="0"/></svg>`;
    const draft = prepareSvgImport(svg, { fileName: 'ambiguous.svg' });
    expect(draft.needsPhysicalSize).toBe(true);
    expect(draft.widthMm).toBeCloseTo(400 * MM_PER_PX, 2);
    const overridden = prepareSvgImport(svg, {
      fileName: 'ambiguous.svg',
      physicalWidthMm: 180,
      physicalHeightMm: 180,
    });
    expect(overridden.widthMm).toBeCloseTo(180);
    expect(overridden.metadata.sizeSource).toBe('user-override');
  });

  it('fails when there is no geometry', () => {
    const draft = prepareSvgImport(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>hi</text></svg>`,
      { fileName: 'empty.svg' },
    );
    expect(draft.status).toBe('cannot-import');
    expect(draft.error).toMatch(/no importable geometry/i);
  });

  it('excludes display:none geometry', () => {
    const draft = prepareSvgImport(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <line x1="0" y1="0" x2="10" y2="0" display="none"/>
        <line x1="0" y1="10" x2="10" y2="10"/>
      </svg>`,
      { fileName: 'hidden.svg' },
    );
    expect(draft.paths).toHaveLength(1);
  });

  it('converts Y-down to Y-up once into document millimeters', () => {
    const draft = prepareSvgImport(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <line x1="0" y1="0" x2="0" y2="100"/>
      </svg>`,
      { fileName: 'y.svg' },
    );
    const pts = draft.paths[0]!.points;
    expect(pts[0]!.y).toBeGreaterThan(pts[1]!.y);
  });

  it('persists svg-import metadata through the documents store', () => {
    __resetPlotDocumentsForTests([]);
    const draft = prepareSvgImport(turtletoySimple, {
      fileName: 'turtle-study.svg',
    });
    const doc = confirmSvgImport(draft, 'turtle-study')!;
    setActivePlotDocument(doc);
    const stored = get(plotDocuments)[0]!;
    expect(stored.source).toBe('svg-import');
    expect(stored.svgImport?.originalFileName).toBe('turtle-study.svg');
    expect(stored.rawSvg).not.toMatch(/<script/i);

    __resetPlotDocumentsForTests([stored]);
    const reloaded = get(plotDocuments)[0]!;
    expect(reloaded.source).toBe('svg-import');
    expect(reloaded.svgImport?.sourceHash).toBe(stored.svgImport?.sourceHash);
  });

  it('Prepare scale 1 preserves imported physical size; G-code has no source branch', () => {
    const draft = prepareSvgImport(primitives, {
      fileName: 'primitives.svg',
    });
    const doc = confirmSvgImport(draft, 'primitives')!;
    const transformed = transformDocument(doc, {
      ...DEFAULT_PLACEMENT,
      scale: 1,
    });
    expect(transformed.bounds.maxX - transformed.bounds.minX).toBeLessThanOrEqual(
      doc.widthMm + 1,
    );
    const program = generateGCode(transformed, createDefaultProfile(), {
      feedRateMmPerMin: 2000,
      dryRun: true,
    });
    expect(program.lines.some((l) => l.startsWith('G1 '))).toBe(true);
    expect(program.lines.join('\n')).not.toMatch(/svg-import|p5\.plotSvg/i);
  });
});

describe('naming helpers', () => {
  it('derives unique document names', () => {
    expect(documentNameFromSvgFileName('drawing.svg')).toBe('drawing');
    expect(uniqueDocumentName('drawing', ['drawing'])).toBe('drawing copy');
    expect(uniqueDocumentName('drawing', ['drawing', 'drawing copy'])).toBe(
      'drawing copy 2',
    );
  });
});

describe('Prepare UI structural guarantees', () => {
  it('keeps Import SVG in Documents without a new column', async () => {
    const prepareView = (
      await import('../../../views/PrepareView.svelte?raw')
    ).default as string;
    expect(prepareView).toContain('Import SVG');
    expect(prepareView).not.toContain('inspector');
    expect(prepareView).not.toContain('right-sidebar');
    expect(prepareView).toContain('ImportSvgModal');
    expect(prepareView).not.toMatch(/\{@html\}/);
    expect(prepareView).not.toContain('innerHTML');
  });
});

import { unzipSync, strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOutputSettings } from './outputSettings';
import {
  SKETCH_ARCHIVE_FORMAT,
  SKETCH_ARCHIVE_VERSION,
  buildSketchArchiveZip,
  downloadAllSketchesZip,
  downloadSketchJs,
  sketchJsFilename,
} from './exportSketches';
import type { Sketch } from './types';

function makeSketch(partial: Partial<Sketch> & Pick<Sketch, 'id' | 'name' | 'source'>): Sketch {
  return {
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
    origin: 'blank',
    exampleId: null,
    output: defaultOutputSettings(),
    ...partial,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

function stubDownload() {
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    downloads.push({ filename: '', blob });
    return `blob:test-${downloads.length}`;
  });
  vi.stubGlobal('URL', {
    createObjectURL,
    revokeObjectURL: vi.fn(),
  });

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      const anchor = {
        href: '',
        download: '',
        rel: '',
        click() {
          const last = downloads[downloads.length - 1];
          if (last) last.filename = anchor.download;
        },
        remove() {},
      };
      return anchor as unknown as HTMLAnchorElement;
    }
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  });
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
  return { downloads, createObjectURL };
}

describe('downloadSketchJs', () => {
  it('exports the exact current source with a sanitized .js filename', () => {
    const { downloads } = stubDownload();
    const source = 'function setup() {\n  createCanvas(200, 200);\n}\n';
    const result = downloadSketchJs({ name: 'Noise field', source });

    expect(result.filename).toBe('noise-field.js');
    expect(sketchJsFilename('')).toBe('untitled-sketch.js');
    expect(downloads[0]?.filename).toBe('noise-field.js');
    expect(downloads[0]?.blob.type).toContain('javascript');
  });
});

describe('downloadAllSketchesZip', () => {
  it('produces a .zip with one exact .js per sketch and a versioned manifest', () => {
    const sketches = [
      makeSketch({
        id: 'a',
        name: 'Polyline composition',
        source: 'function setup(){ /* a */ }\n',
        origin: 'imported',
        imported: {
          originalFileName: 'poly.js',
          importedAt: '2026-01-01T00:00:00.000Z',
        },
        output: {
          ...defaultOutputSettings(),
          physicalWidthMm: 180,
          physicalHeightMm: 180,
        },
      }),
      makeSketch({
        id: 'b',
        name: 'Grid',
        source: 'function draw(){ /* b */ }\n',
        origin: 'example',
      }),
      makeSketch({
        id: 'c',
        name: 'Grid',
        source: 'function draw(){ /* c */ }\n',
      }),
      makeSketch({
        id: 'd',
        name: 'Grid',
        source: 'function draw(){ /* d */ }\n',
      }),
    ];

    const archive = buildSketchArchiveZip(sketches);
    expect(archive.filename).toMatch(
      /^plotter-workspace-sketches-\d{4}-\d{2}-\d{2}\.zip$/,
    );
    expect(archive.fileNames).toEqual([
      'Polyline composition.js',
      'Grid.js',
      'Grid copy.js',
      'Grid copy 2.js',
    ]);

    const folder = archive.filename.replace(/\.zip$/, '');
    const unzipped = unzipSync(archive.bytes);
    const paths = Object.keys(unzipped).sort();
    expect(paths).toContain(`${folder}/Polyline composition.js`);
    expect(paths).toContain(`${folder}/Grid.js`);
    expect(paths).toContain(`${folder}/Grid copy.js`);
    expect(paths).toContain(`${folder}/Grid copy 2.js`);
    expect(paths).toContain(`${folder}/manifest.json`);

    expect(strFromU8(unzipped[`${folder}/Polyline composition.js`]!)).toBe(
      'function setup(){ /* a */ }\n',
    );
    expect(strFromU8(unzipped[`${folder}/Grid.js`]!)).toBe(
      'function draw(){ /* b */ }\n',
    );
    expect(strFromU8(unzipped[`${folder}/Grid copy.js`]!)).toBe(
      'function draw(){ /* c */ }\n',
    );

    const manifest = JSON.parse(
      strFromU8(unzipped[`${folder}/manifest.json`]!),
    ) as Record<string, unknown>;
    expect(manifest.format).toBe(SKETCH_ARCHIVE_FORMAT);
    expect(manifest.version).toBe(SKETCH_ARCHIVE_VERSION);
    expect(manifest.application).toMatchObject({ name: 'Plotter Workspace' });
    expect(manifest.author).toMatchObject({ name: 'Lina Lopes' });

    const entries = manifest.sketches as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      id: 'a',
      name: 'Polyline composition',
      fileName: 'Polyline composition.js',
      origin: 'imported',
      originalFileName: 'poly.js',
    });
    expect(entries[0]!.outputSettings).toMatchObject({
      physicalWidthMm: 180,
      physicalHeightMm: 180,
    });
    // Source lives in .js files only.
    expect(JSON.stringify(manifest)).not.toContain('function setup(){ /* a */ }');
    expect(JSON.stringify(manifest)).not.toContain('machine-profiles');
    expect(JSON.stringify(manifest)).not.toContain('plot-documents');
    expect(JSON.stringify(manifest)).not.toContain('baudRate');
  });

  it('does not mutate stored sketches when downloading a ZIP', () => {
    const sketches = [
      makeSketch({ id: 'x', name: 'X', source: 'const n = 1;' }),
    ];
    const snapshot = structuredClone(sketches);
    stubDownload();

    const result = downloadAllSketchesZip(sketches);
    expect(result.ok).toBe(true);
    expect(sketches).toEqual(snapshot);
  });

  it('refuses an empty collection', () => {
    expect(downloadAllSketchesZip([])).toEqual({
      ok: false,
      error: 'There are no sketches to download.',
    });
  });
});

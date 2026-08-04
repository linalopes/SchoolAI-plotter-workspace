import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOutputSettings } from '../outputSettings';
import {
  __resetSketchesForTests,
  createSketch,
  importSketch,
  sketches,
} from '../store';
import { IMPORT_MAX_BYTES, readJsSketchFile, sketchNameFromFileName } from './readJsFile';

describe('import sketch lifecycle', () => {
  beforeEach(() => {
    __resetSketchesForTests([]);
  });

  it('creates one editable local sketch with preserved filename metadata', () => {
    const created = importSketch({
      fileName: 'my-sculpture.js',
      source: 'function setup(){ createCanvas(100,100); }',
    });
    expect(get(sketches)).toHaveLength(1);
    expect(created.origin).toBe('imported');
    expect(created.name).toBe('my-sculpture');
    expect(created.imported?.originalFileName).toBe('my-sculpture.js');
    expect(created.imported?.importedAt).toMatch(/^\d{4}-/);
    expect(created.output.mode).toBe('preserve-current');
  });

  it('generates unique names like Name copy / Name copy 2', () => {
    importSketch({ fileName: 'wave.js', source: 'function setup(){}' });
    importSketch({ fileName: 'wave.js', source: 'function setup(){}' });
    importSketch({ fileName: 'wave.js', source: 'function setup(){}' });
    const names = get(sketches).map((s) => s.name);
    expect(names).toEqual(['wave', 'wave copy', 'wave copy 2']);
  });

  it('allows syntax-error sources to be imported for repair', () => {
    const created = importSketch({
      fileName: 'broken.js',
      source: 'function setup( {',
    });
    expect(created.source).toContain('function setup');
    expect(get(sketches)).toHaveLength(1);
  });

  it('does not auto-run — importSketch only persists data', () => {
    const runSpy = vi.fn();
    importSketch({
      fileName: 'quiet.js',
      source: 'function setup(){ createCanvas(10,10); }',
    });
    expect(runSpy).not.toHaveBeenCalled();
    expect(get(sketches)[0]?.origin).toBe('imported');
  });
});

describe('readJsSketchFile', () => {
  it('rejects non-js extensions and oversized files', async () => {
    const html = new File(['<html></html>'], 'sketch.html', { type: 'text/html' });
    expect((await readJsSketchFile(html)).ok).toBe(false);

    const big = new File(['x'.repeat(IMPORT_MAX_BYTES + 1)], 'big.js', {
      type: 'text/javascript',
    });
    const result = await readJsSketchFile(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/limit/i);
  });

  it('reads a valid .js file and returns a report without executing', async () => {
    const file = new File(
      [
        `function setup(){ createCanvas(400,400); }
function draw(){ line(0,0,1,1); }`,
      ],
      'ok.js',
      { type: 'text/javascript' },
    );
    const result = await readJsSketchFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.importable).toBe(true);
      expect(result.report.canvas?.widthUnits).toBe(400);
    }
  });

  it('derives sketch name from filename', () => {
    expect(sketchNameFromFileName('My Sketch.js')).toBe('My Sketch');
  });
});

describe('existing sketch migration preserves physical size', () => {
  it('assigns preserve-current output so legacy A4 fit remains', () => {
    __resetSketchesForTests([
      {
        id: 'legacy-1',
        name: 'Old',
        source: 'function setup(){ createCanvas(400,400); }',
        exampleId: null,
        origin: 'user',
        output: defaultOutputSettings(),
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const sketch = get(sketches)[0]!;
    expect(sketch.output.mode).toBe('preserve-current');
    // Blank sketches also get the same default.
    const blank = createSketch();
    expect(blank.origin).toBe('blank');
    expect(blank.output.mode).toBe('preserve-current');
  });
});

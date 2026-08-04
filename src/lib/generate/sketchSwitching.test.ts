import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import codeEditor from './components/CodeEditor.svelte?raw';
import exampleGallery from './components/ExampleGallery.svelte?raw';
import exampleThumbnail from './components/ExampleThumbnail.svelte?raw';
import generateView from '../../views/GenerateView.svelte?raw';
import runnerSource from '../p5/runner.ts?raw';
import { SKETCH_EXAMPLES } from '../sketches/examples';
import { hashSource } from '../sketches/sourceHash';
import {
  __resetSketchesForTests,
  findMismatchedExampleCopies,
  selectSketch,
  sketches,
  updateSketchSource,
  useExample,
} from '../sketches/store';
import {
  createRunSnapshot,
  ownershipMatches,
  type PreviewOwnership,
} from './runSnapshot';

/**
 * Regression coverage for sketch switching, editor sync, run settlement,
 * example-copy integrity, and equal static example cards.
 */

describe('source hash + preview ownership', () => {
  it('hashes sources stably and distinguishes Grid from Circles', () => {
    const grid = SKETCH_EXAMPLES.find((entry) => entry.id === 'grid')!;
    const circles = SKETCH_EXAMPLES.find((entry) => entry.id === 'circles')!;
    expect(hashSource(grid.source)).toBe(hashSource(grid.source));
    expect(hashSource(grid.source)).not.toBe(hashSource(circles.source));
    expect(grid.source).toContain('const step = 32');
    expect(circles.source).toContain('circle(');
  });

  it('never treats another sketch’s preview as owned by the current sketch', () => {
    const grid = SKETCH_EXAMPLES.find((entry) => entry.id === 'grid')!;
    const circles = SKETCH_EXAMPLES.find((entry) => entry.id === 'circles')!;
    const ownership: PreviewOwnership = {
      sketchId: 'sketch-grid',
      sourceHash: hashSource(grid.source),
      renderedAt: 1,
    };
    expect(ownershipMatches(ownership, 'sketch-grid', grid.source)).toBe(true);
    expect(ownershipMatches(ownership, 'sketch-circles', circles.source)).toBe(
      false,
    );
    expect(ownershipMatches(ownership, 'sketch-grid', circles.source)).toBe(
      false,
    );
  });
});

describe('run snapshots', () => {
  it('snapshots source at creation time and keeps identifiers', () => {
    const source = 'function setup(){ createCanvas(10,10); noLoop(); }';
    const snapshot = createRunSnapshot({
      sketchId: 'sketch-1',
      source,
      runtimeId: 'runtime-1',
    });
    expect(snapshot.sketchId).toBe('sketch-1');
    expect(snapshot.runtimeId).toBe('runtime-1');
    expect(snapshot.source).toBe(source);
    expect(snapshot.sourceHash).toBe(hashSource(source));
    expect(snapshot.runId.startsWith('run')).toBe(true);
  });

  it('host runner waits for render completion, timeout, and cancel settlement', () => {
    expect(runnerSource).toContain('runAndWait');
    expect(runnerSource).toContain('DEFAULT_PREVIEW_TIMEOUT_MS');
    expect(runnerSource).toContain('RunTimeoutError');
    expect(runnerSource).toContain('RunCancelledError');
    expect(runnerSource).toContain('SKETCH_RENDERED');
    expect(runnerSource).toMatch(/async run\(\s*snapshot/);
    // Must not resolve merely because RUN_SKETCH was posted.
    expect(runnerSource).toContain('Every call settles exactly once');
  });
});

describe('CodeMirror + Generate selection transaction', () => {
  it('replaces the CodeMirror document when syncKey changes', () => {
    expect(codeEditor).toContain('syncKey');
    expect(codeEditor).toContain('replaceDocument');
    expect(codeEditor).toContain('applyingExternal');
    expect(codeEditor).toContain('from: 0');
    expect(codeEditor).toContain('to: view.state.doc.length');
    expect(codeEditor).not.toContain('skipNextExternal');
  });

  it('implements a controlled selection transaction and run snapshot path', () => {
    expect(generateView).toContain('applySketchSelection');
    expect(generateView).toContain('flushPendingSave');
    expect(generateView).toContain('cancelActiveRun');
    expect(generateView).toContain('createRunSnapshot');
    expect(generateView).toContain('pendingSave');
    expect(generateView).toContain('syncKey={editorSyncKey}');
    expect(generateView).toContain('[generate:select]');
    expect(generateView).toContain('[generate:run]');
    // Selecting an ordinary sketch never auto-executes.
    expect(generateView).toContain(
      'Selecting an ordinary sketch never auto-executes',
    );
  });

  it('clears Running on sketch switch and supports timeout recovery UI', () => {
    expect(generateView).toContain("cancelActiveRun('Switched sketches.')");
    expect(generateView).toContain("previewStatus = 'timeout'");
    expect(generateView).toContain('Run timed out');
    expect(generateView).toContain('Not run');
  });
});

describe('debounced save must not cross sketch boundaries', () => {
  beforeEach(() => {
    __resetSketchesForTests([]);
  });

  it('saving with a captured sketch id cannot corrupt a later selection', () => {
    const grid = useExample('grid')!;
    const circles = useExample('circles')!;
    expect(grid.source).toContain('const step = 32');
    expect(circles.source).toContain('circle(');

    // Simulate the old bug: timer fires after selection changed, but the
    // closure must still target the sketch that owned the edit.
    const pending = { sketchId: grid.id, source: grid.source + '\n// edit\n' };
    selectSketch(circles.id);
    updateSketchSource(pending.sketchId, pending.source);

    const list = get(sketches);
    const gridAfter = list.find((entry) => entry.id === grid.id)!;
    const circlesAfter = list.find((entry) => entry.id === circles.id)!;
    expect(gridAfter.source).toContain('// edit');
    expect(circlesAfter.source).toContain('circle(');
    expect(circlesAfter.source).not.toContain('const step = 32');
    expect(circlesAfter.source).not.toContain('// edit');
  });

  it('Use example snapshots title and source from the same template', () => {
    const created = useExample('circles')!;
    const template = SKETCH_EXAMPLES.find((entry) => entry.id === 'circles')!;
    expect(created.name.startsWith(template.name)).toBe(true);
    expect(created.source).toBe(template.source);
    expect(created.exampleId).toBe(template.id);
  });

  it('reports mismatched example copies without overwriting them', () => {
    const created = useExample('circles')!;
    updateSketchSource(created.id, SKETCH_EXAMPLES.find((e) => e.id === 'grid')!.source);
    const mismatches = findMismatchedExampleCopies();
    expect(mismatches.some((entry) => entry.sketchId === created.id)).toBe(true);
    const still = get(sketches).find((entry) => entry.id === created.id)!;
    expect(still.source).toContain('const step = 32');
    expect(still.name.startsWith('Circles')).toBe(true);
  });
});

describe('equal example cards + static thumbnails', () => {
  it('uses equal card layout classes and keeps thumbnails static', () => {
    expect(exampleGallery).toContain('examples-grid');
    expect(exampleGallery).toContain('example-card');
    expect(exampleGallery).toContain('min-height: 370px');
    expect(exampleGallery).toContain('example-card__description');
    expect(exampleGallery).toContain('example-card__tags');
    expect(exampleGallery).toContain('example-card__action');
    expect(exampleGallery).toContain('margin-top: auto');
    expect(exampleGallery).toContain('aspect-ratio: 297 / 210');
    expect(exampleThumbnail).toContain('<img');
    expect(exampleThumbnail).not.toContain('SketchRunner');
    expect(exampleGallery).not.toContain('runner.run');
  });
});

describe('Grid → Circles switching sequence (source integrity)', () => {
  beforeEach(() => {
    __resetSketchesForTests([]);
  });

  it('keeps Grid and Circles sources distinct across select + save + reselect', () => {
    const grid = useExample('grid')!;
    const circles = useExample('circles')!;
    const wave = useExample('wave-lines')!;
    const noise = useExample('noise-field')!;
    const simple = useExample('simple-line')!;

    const sequence = [grid, circles, wave, noise, simple, grid, circles];
    for (const sketch of sequence) {
      selectSketch(sketch.id);
      const active = get(sketches).find((entry) => entry.id === sketch.id)!;
      expect(active.source).toBe(sketch.source);
      expect(hashSource(active.source)).toBe(hashSource(sketch.source));
    }

    expect(hashSource(grid.source)).not.toBe(hashSource(circles.source));
    expect(circles.source).not.toContain('const step = 32');
    expect(grid.source).toContain('const step = 32');
  });
});

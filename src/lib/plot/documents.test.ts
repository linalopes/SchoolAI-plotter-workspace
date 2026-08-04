import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __setPlotJobStateForTests,
  isDocumentLockedByPlotJob,
  jobBlocksDocumentDeletion,
} from '../jobs/plotJob';
import { defaultOutputSettings } from '../sketches/outputSettings';
import { __resetSketchesForTests, sketches } from '../sketches/store';
import type { Sketch } from '../sketches/types';
import { STORAGE_KEYS, readStoredRaw } from '../utils/storage';
import { createDefaultProfile } from '../machines/profiles/defaults';
import { profiles as profilesStore } from '../machines/stores/profiles';
import {
  MAX_PLOT_DOCUMENTS,
  __resetPlotDocumentsForTests,
  activePlotDocument,
  activePlotDocumentId,
  clearAllPlotDocuments,
  deletePlotDocument,
  estimatePlotDocumentsStorageBytes,
  plotDocuments,
  plotPlacement,
  renamePlotDocument,
  selectPlotDocument,
  setActivePlotDocument,
  updatePlacement,
} from './documents';
import { DEFAULT_PLACEMENT, type PlotDocument } from './types';

function makeDoc(
  id: string,
  name: string,
  extras: Partial<PlotDocument> = {},
): PlotDocument {
  return {
    id,
    name,
    widthMm: 100,
    heightMm: 100,
    paths: [
      {
        id: `${id}-path`,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        closed: false,
      },
    ],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 0 },
    source: 'unknown',
    createdAt: 1,
    updatedAt: 1,
    ...extras,
  };
}

function makeSketch(id: string, name: string): Sketch {
  return {
    id,
    name,
    source: '// sketch',
    createdAt: 1,
    updatedAt: 1,
    origin: 'blank',
    exampleId: null,
    output: defaultOutputSettings(),
  };
}

beforeEach(() => {
  __resetPlotDocumentsForTests([]);
  __resetSketchesForTests([]);
  __setPlotJobStateForTests({ phase: 'idle', summary: null });
  localStorage.removeItem(`plotter-workspace:${STORAGE_KEYS.plotDocuments}`);
  localStorage.removeItem(
    `plotter-workspace:${STORAGE_KEYS.activePlotDocumentId}`,
  );
});

describe('PlotDocument deletion and rename', () => {
  it('deleting a p5 capture does not delete its Generate sketch', () => {
    const sketch = makeSketch('sketch-1', 'My sketch');
    __resetSketchesForTests([sketch]);
    setActivePlotDocument(
      makeDoc('doc-1', 'Capture', {
        source: 'p5',
        p5Source: {
          sketchId: sketch.id,
          sourceHash: 'abc',
          canvasWidthUnits: 400,
          canvasHeightUnits: 400,
          physicalWidthMm: 210,
          physicalHeightMm: 210,
          millimetersPerUnit: 0.525,
        },
        rawSvg: '<svg/>',
      }),
    );

    expect(deletePlotDocument('doc-1')).toBe(true);
    expect(get(plotDocuments)).toHaveLength(0);
    expect(get(sketches)).toHaveLength(1);
    expect(get(sketches)[0]!.id).toBe('sketch-1');
    expect(get(sketches)[0]!.source).toBe('// sketch');
  });

  it('deleting an SVG import does not alter other documents’ source metadata', () => {
    const a = makeDoc('a', 'Alpha', {
      source: 'svg-import',
      rawSvg: '<svg id="a"/>',
      svgImport: {
        version: 1,
        originalFileName: 'alpha.svg',
        importedAt: '2026-01-01T00:00:00.000Z',
        sourceHash: 'hash-a',
        detectedUnits: 'mm',
        sizeSource: 'physical',
        physicalWidthMm: 100,
        physicalHeightMm: 100,
        millimetersPerUserUnitX: 1,
        millimetersPerUserUnitY: 1,
        preserveAspectRatio: 'xMidYMid meet',
        preserveAspectRatioSupport: 'default',
        acceptedGeometryCount: 1,
        closedPathCount: 0,
        filledShapeCount: 0,
        degenerateRemovedCount: 0,
        ignoredCounts: {},
        unsupportedCounts: {},
        removedForSecurity: {},
        warnings: [],
      },
    });
    const b = makeDoc('b', 'Beta', {
      source: 'svg-import',
      rawSvg: '<svg id="b"/>',
      svgImport: {
        version: 1,
        originalFileName: 'beta.svg',
        importedAt: '2026-01-01T00:00:00.000Z',
        sourceHash: 'hash-b',
        detectedUnits: 'mm',
        sizeSource: 'physical',
        physicalWidthMm: 50,
        physicalHeightMm: 50,
        millimetersPerUserUnitX: 1,
        millimetersPerUserUnitY: 1,
        preserveAspectRatio: 'xMidYMid meet',
        preserveAspectRatioSupport: 'default',
        acceptedGeometryCount: 1,
        closedPathCount: 0,
        filledShapeCount: 0,
        degenerateRemovedCount: 0,
        ignoredCounts: {},
        unsupportedCounts: {},
        removedForSecurity: {},
        warnings: [],
      },
    });
    __resetPlotDocumentsForTests([a, b]);
    selectPlotDocument('a');

    deletePlotDocument('a');
    const remaining = get(plotDocuments);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('b');
    expect(remaining[0]!.svgImport?.originalFileName).toBe('beta.svg');
    expect(remaining[0]!.svgImport?.sourceHash).toBe('hash-b');
    expect(remaining[0]!.rawSvg).toBe('<svg id="b"/>');
  });

  it('deletion removes persisted geometry and metadata', () => {
    setActivePlotDocument(
      makeDoc('gone', 'Gone', {
        source: 'svg-import',
        rawSvg: '<svg><path d="M0 0 L1 1"/></svg>',
        svgImport: {
          version: 1,
          originalFileName: 'gone.svg',
          importedAt: '2026-01-01T00:00:00.000Z',
          sourceHash: 'hash-gone',
          detectedUnits: 'mm',
          sizeSource: 'physical',
          physicalWidthMm: 10,
          physicalHeightMm: 10,
          millimetersPerUserUnitX: 1,
          millimetersPerUserUnitY: 1,
          preserveAspectRatio: 'xMidYMid meet',
          preserveAspectRatioSupport: 'default',
          acceptedGeometryCount: 1,
          closedPathCount: 0,
          filledShapeCount: 0,
          degenerateRemovedCount: 0,
          ignoredCounts: {},
          unsupportedCounts: {},
          removedForSecurity: {},
          warnings: [],
        },
      }),
    );

    deletePlotDocument('gone');
    const stored = readStoredRaw(STORAGE_KEYS.plotDocuments) as {
      documents: PlotDocument[];
    };
    expect(stored.documents).toEqual([]);
    expect(get(activePlotDocumentId)).toBeNull();
  });

  it('a deleted document does not return after reload from storage', () => {
    setActivePlotDocument(makeDoc('keep', 'Keep'));
    setActivePlotDocument(makeDoc('drop', 'Drop'));
    deletePlotDocument('drop');

    const persisted = readStoredRaw(STORAGE_KEYS.plotDocuments) as {
      documents: PlotDocument[];
    };
    __resetPlotDocumentsForTests(persisted.documents);
    expect(get(plotDocuments).map((d) => d.id)).toEqual(['keep']);
  });

  it('deleting the active document selects the next neighbor, else previous', () => {
    __resetPlotDocumentsForTests([
      makeDoc('a', 'A'),
      makeDoc('b', 'B'),
      makeDoc('c', 'C'),
    ]);
    selectPlotDocument('b');
    deletePlotDocument('b');
    expect(get(activePlotDocumentId)).toBe('c');

    selectPlotDocument('c');
    deletePlotDocument('c');
    expect(get(activePlotDocumentId)).toBe('a');
  });

  it('deleting the final document clears the active id and resets placement', () => {
    setActivePlotDocument(makeDoc('only', 'Only'));
    updatePlacement({ scale: 2, offsetXMm: 12 });
    deletePlotDocument('only');
    expect(get(activePlotDocumentId)).toBeNull();
    expect(get(activePlotDocument)).toBeNull();
    expect(get(plotPlacement)).toEqual(DEFAULT_PLACEMENT);
  });

  it('cancelled deletion changes nothing when delete is not called', () => {
    setActivePlotDocument(makeDoc('stay', 'Stay'));
    const before = get(plotDocuments);
    // UI cancel path never calls deletePlotDocument — assert store untouched.
    expect(get(plotDocuments)).toEqual(before);
    expect(get(activePlotDocumentId)).toBe('stay');
  });

  it('clear all removes documents and preserves sketches and machine profiles', () => {
    const sketch = makeSketch('s1', 'Sketch');
    __resetSketchesForTests([sketch]);
    const profilesBefore = get(profilesStore).map((p) => p.id);
    expect(profilesBefore.length).toBeGreaterThan(0);

    setActivePlotDocument(makeDoc('d1', 'One'));
    setActivePlotDocument(makeDoc('d2', 'Two'));
    updatePlacement({ scale: 1.5 });
    clearAllPlotDocuments();

    expect(get(plotDocuments)).toEqual([]);
    expect(get(activePlotDocumentId)).toBeNull();
    expect(get(plotPlacement)).toEqual(DEFAULT_PLACEMENT);
    expect(get(sketches)).toHaveLength(1);
    expect(get(profilesStore).map((p) => p.id)).toEqual(profilesBefore);
    // Default profile factory still available / unchanged shape.
    expect(createDefaultProfile().id).toBeTruthy();
  });

  it('rename persists without altering source provenance', () => {
    setActivePlotDocument(
      makeDoc('r1', 'Old name', {
        source: 'svg-import',
        rawSvg: '<svg/>',
        svgImport: {
          version: 1,
          originalFileName: 'original.svg',
          importedAt: '2026-01-01T00:00:00.000Z',
          sourceHash: 'hash-r',
          detectedUnits: 'mm',
          sizeSource: 'physical',
          physicalWidthMm: 20,
          physicalHeightMm: 20,
          millimetersPerUserUnitX: 1,
          millimetersPerUserUnitY: 1,
          preserveAspectRatio: 'xMidYMid meet',
          preserveAspectRatioSupport: 'default',
          acceptedGeometryCount: 1,
          closedPathCount: 0,
          filledShapeCount: 0,
          degenerateRemovedCount: 0,
          ignoredCounts: {},
          unsupportedCounts: {},
          removedForSecurity: {},
          warnings: [],
        },
      }),
    );

    renamePlotDocument('r1', '  New label  ');
    const renamed = get(plotDocuments)[0]!;
    expect(renamed.name).toBe('New label');
    expect(renamed.svgImport?.originalFileName).toBe('original.svg');
    expect(renamed.svgImport?.sourceHash).toBe('hash-r');

    const persisted = readStoredRaw(STORAGE_KEYS.plotDocuments) as {
      documents: PlotDocument[];
    };
    __resetPlotDocumentsForTests(persisted.documents);
    expect(get(plotDocuments)[0]!.name).toBe('New label');
    expect(get(plotDocuments)[0]!.svgImport?.originalFileName).toBe(
      'original.svg',
    );
  });

  it('rename falls back when the name is empty or whitespace', () => {
    setActivePlotDocument(makeDoc('r2', 'Named'));
    renamePlotDocument('r2', '   ');
    expect(get(plotDocuments)[0]!.name).toBe('Untitled document');
  });

  it('recent-document limit still evicts the oldest entry', () => {
    for (let i = 0; i < MAX_PLOT_DOCUMENTS; i += 1) {
      setActivePlotDocument(makeDoc(`d${i}`, `Doc ${i}`));
    }
    expect(get(plotDocuments)).toHaveLength(MAX_PLOT_DOCUMENTS);
    const oldestId = get(plotDocuments)[MAX_PLOT_DOCUMENTS - 1]!.id;
    setActivePlotDocument(makeDoc('newest', 'Newest'));
    const ids = get(plotDocuments).map((d) => d.id);
    expect(ids).toHaveLength(MAX_PLOT_DOCUMENTS);
    expect(ids[0]).toBe('newest');
    expect(ids).not.toContain(oldestId);
  });

  it('storage estimate is based on serialized document data', () => {
    setActivePlotDocument(
      makeDoc('big', 'Big', { rawSvg: `<svg>${'x'.repeat(2000)}</svg>` }),
    );
    expect(estimatePlotDocumentsStorageBytes()).toBeGreaterThan(2000);
  });
});

describe('Plot job document deletion locks', () => {
  it('locks the document being plotted, including while paused', () => {
    __setPlotJobStateForTests({
      phase: 'paused',
      summary: {
        documentName: 'Locked',
        documentId: 'locked-doc',
        pathCount: 1,
        penDownLengthMm: 1,
        penUpLengthMm: 0,
        boundsLabel: '0,0 → 1,1 mm',
        profileName: 'XY',
        penConfigured: true,
        dryRun: false,
        commandCount: 3,
      },
    });
    expect(jobBlocksDocumentDeletion('paused')).toBe(true);
    expect(isDocumentLockedByPlotJob('locked-doc')).toBe(true);
    expect(isDocumentLockedByPlotJob('other-doc')).toBe(false);
  });

  it('blocks clear-all style checks while any blocking job phase is active', () => {
    expect(jobBlocksDocumentDeletion('idle')).toBe(false);
    expect(jobBlocksDocumentDeletion('running')).toBe(true);
    expect(jobBlocksDocumentDeletion('confirming')).toBe(true);
    expect(jobBlocksDocumentDeletion('cancelling')).toBe(true);
  });
});

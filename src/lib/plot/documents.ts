import { derived, get, writable } from 'svelte/store';
import { isRecord } from '../utils/misc';
import {
  STORAGE_KEYS,
  readStored,
  readStoredRaw,
  writeStored,
} from '../utils/storage';
import { optimizePlotDocument } from './optimize';
import type { SvgImportMetadata, SvgImportWarning } from './svgImport/types';
import {
  DEFAULT_PLACEMENT,
  PLOT_DOCUMENT_STORAGE_VERSION,
  type PlotDocument,
  type PlotPlacement,
  type PlotRotation,
  type PlotSource,
} from './types';

/**
 * Active PlotDocument and Prepare placement.
 *
 * Documents are persisted so a capture or SVG import survives a reload.
 * An in-flight plot job is never persisted.
 *
 * Maximum 20 documents; newest first. Eviction drops the oldest entries.
 */

/** Recent-document cap. New docs are prepended; overflow evicts the oldest. */
export const MAX_PLOT_DOCUMENTS = 20;

const MAX_DOCUMENTS = MAX_PLOT_DOCUMENTS;
const FALLBACK_DOCUMENT_NAME = 'Untitled document';

function isPlacement(value: unknown): value is PlotPlacement {
  if (!isRecord(value)) return false;
  return (
    typeof value.scale === 'number' &&
    typeof value.offsetXMm === 'number' &&
    typeof value.offsetYMm === 'number' &&
    typeof value.marginMm === 'number' &&
    typeof value.showPenUpTravel === 'boolean' &&
    [0, 90, 180, 270].includes(value.rotation as number)
  );
}

function sanitizeWarnings(input: unknown): SvgImportWarning[] {
  if (!Array.isArray(input)) return [];
  const out: SvgImportWarning[] = [];
  for (const entry of input) {
    if (!isRecord(entry) || typeof entry.text !== 'string' || !entry.text) {
      continue;
    }
    const level: SvgImportWarning['level'] =
      entry.level === 'info' ||
      entry.level === 'warning' ||
      entry.level === 'unsupported' ||
      entry.level === 'security'
        ? entry.level
        : 'warning';
    out.push({
      level,
      code: typeof entry.code === 'string' ? entry.code : 'unknown',
      text: entry.text,
    });
  }
  return out;
}

function sanitizeCountMap(input: unknown): Record<string, number> {
  if (!isRecord(input)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function sanitizeSvgImport(input: unknown): SvgImportMetadata | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.originalFileName !== 'string') return undefined;
  if (typeof input.sourceHash !== 'string') return undefined;
  const physicalWidthMm =
    typeof input.physicalWidthMm === 'number' ? input.physicalWidthMm : 0;
  const physicalHeightMm =
    typeof input.physicalHeightMm === 'number' ? input.physicalHeightMm : 0;

  let viewBox: SvgImportMetadata['viewBox'];
  if (isRecord(input.viewBox)) {
    const minX = Number(input.viewBox.minX);
    const minY = Number(input.viewBox.minY);
    const width = Number(input.viewBox.width);
    const height = Number(input.viewBox.height);
    if (
      [minX, minY, width, height].every((n) => Number.isFinite(n)) &&
      width > 0 &&
      height > 0
    ) {
      viewBox = { minX, minY, width, height };
    }
  }

  return {
    version: 1,
    originalFileName: input.originalFileName,
    importedAt:
      typeof input.importedAt === 'string'
        ? input.importedAt
        : new Date().toISOString(),
    sourceHash: input.sourceHash,
    sourceWidth:
      typeof input.sourceWidth === 'string' ? input.sourceWidth : undefined,
    sourceHeight:
      typeof input.sourceHeight === 'string' ? input.sourceHeight : undefined,
    viewBox,
    detectedUnits:
      typeof input.detectedUnits === 'string'
        ? (input.detectedUnits as SvgImportMetadata['detectedUnits'])
        : 'unknown',
    sizeSource:
      typeof input.sizeSource === 'string'
        ? (input.sizeSource as SvgImportMetadata['sizeSource'])
        : 'viewbox-96dpi',
    physicalWidthMm,
    physicalHeightMm,
    millimetersPerUserUnitX:
      typeof input.millimetersPerUserUnitX === 'number'
        ? input.millimetersPerUserUnitX
        : physicalWidthMm || 1,
    millimetersPerUserUnitY:
      typeof input.millimetersPerUserUnitY === 'number'
        ? input.millimetersPerUserUnitY
        : physicalHeightMm || 1,
    preserveAspectRatio:
      typeof input.preserveAspectRatio === 'string'
        ? input.preserveAspectRatio
        : 'xMidYMid meet',
    preserveAspectRatioSupport:
      input.preserveAspectRatioSupport === 'full' ||
      input.preserveAspectRatioSupport === 'partial' ||
      input.preserveAspectRatioSupport === 'default'
        ? input.preserveAspectRatioSupport
        : 'default',
    acceptedGeometryCount:
      typeof input.acceptedGeometryCount === 'number'
        ? input.acceptedGeometryCount
        : 0,
    closedPathCount:
      typeof input.closedPathCount === 'number' ? input.closedPathCount : 0,
    filledShapeCount:
      typeof input.filledShapeCount === 'number' ? input.filledShapeCount : 0,
    degenerateRemovedCount:
      typeof input.degenerateRemovedCount === 'number'
        ? input.degenerateRemovedCount
        : 0,
    ignoredCounts: sanitizeCountMap(input.ignoredCounts),
    unsupportedCounts: sanitizeCountMap(input.unsupportedCounts),
    removedForSecurity: sanitizeCountMap(input.removedForSecurity),
    warnings: sanitizeWarnings(input.warnings),
  };
}

function sanitizeP5Source(
  input: unknown,
): PlotDocument['p5Source'] | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.sketchId !== 'string') return undefined;
  if (typeof input.sourceHash !== 'string') return undefined;
  const nums = [
    input.canvasWidthUnits,
    input.canvasHeightUnits,
    input.physicalWidthMm,
    input.physicalHeightMm,
    input.millimetersPerUnit,
  ];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return undefined;
  }
  return {
    sketchId: input.sketchId,
    sourceHash: input.sourceHash,
    canvasWidthUnits: input.canvasWidthUnits as number,
    canvasHeightUnits: input.canvasHeightUnits as number,
    physicalWidthMm: input.physicalWidthMm as number,
    physicalHeightMm: input.physicalHeightMm as number,
    millimetersPerUnit: input.millimetersPerUnit as number,
  };
}

function sanitizeSource(input: unknown): PlotSource {
  if (input === 'p5' || input === 'svg-import' || input === 'raster') {
    return input;
  }
  return 'unknown';
}

function sanitizeDocument(input: unknown): PlotDocument | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || typeof input.name !== 'string') return null;
  if (!Array.isArray(input.paths)) return null;
  if (!isRecord(input.bounds)) return null;

  const paths = input.paths
    .map((path) => {
      if (!isRecord(path) || !Array.isArray(path.points)) return null;
      const points = path.points
        .map((point) => {
          if (!isRecord(point)) return null;
          if (typeof point.x !== 'number' || typeof point.y !== 'number') {
            return null;
          }
          return { x: point.x, y: point.y };
        })
        .filter((point): point is { x: number; y: number } => point !== null);
      if (points.length < 2) return null;

      let svgSource: PlotDocument['paths'][number]['svgSource'];
      if (isRecord(path.svgSource)) {
        svgSource = {
          sourceElementId:
            typeof path.svgSource.sourceElementId === 'string'
              ? path.svgSource.sourceElementId
              : undefined,
          sourceElementType:
            typeof path.svgSource.sourceElementType === 'string'
              ? path.svgSource.sourceElementType
              : undefined,
          strokeColor:
            typeof path.svgSource.strokeColor === 'string'
              ? path.svgSource.strokeColor
              : undefined,
          fillColor:
            typeof path.svgSource.fillColor === 'string'
              ? path.svgSource.fillColor
              : undefined,
        };
      }

      return {
        id: typeof path.id === 'string' ? path.id : `path-${Math.random()}`,
        points,
        closed: path.closed === true,
        ...(typeof path.layerId === 'string' ? { layerId: path.layerId } : {}),
        ...(svgSource ? { svgSource } : {}),
      };
    })
    .filter((path): path is NonNullable<typeof path> => path !== null);

  if (paths.length === 0) return null;

  const source = sanitizeSource(input.source);
  const svgImport =
    source === 'svg-import' ? sanitizeSvgImport(input.svgImport) : undefined;
  const p5Source = source === 'p5' ? sanitizeP5Source(input.p5Source) : undefined;

  return {
    id: input.id,
    name: input.name,
    widthMm: typeof input.widthMm === 'number' ? input.widthMm : 297,
    heightMm: typeof input.heightMm === 'number' ? input.heightMm : 210,
    paths,
    bounds: {
      minX: Number(input.bounds.minX) || 0,
      minY: Number(input.bounds.minY) || 0,
      maxX: Number(input.bounds.maxX) || 0,
      maxY: Number(input.bounds.maxY) || 0,
    },
    source,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
    ...(typeof input.rawSvg === 'string' ? { rawSvg: input.rawSvg } : {}),
    ...(p5Source ? { p5Source } : {}),
    ...(svgImport ? { svgImport } : {}),
  };
}

function loadDocuments(): PlotDocument[] {
  const raw = readStoredRaw(STORAGE_KEYS.plotDocuments);
  if (!isRecord(raw) || !Array.isArray(raw.documents)) return [];
  return raw.documents
    .map((entry) => sanitizeDocument(entry))
    .filter((entry): entry is PlotDocument => entry !== null);
}

const documentsStore = writable<PlotDocument[]>(loadDocuments());
const activeIdStore = writable<string | null>(
  readStored<string | null>(
    STORAGE_KEYS.activePlotDocumentId,
    (v): v is string | null => typeof v === 'string' || v === null,
    null,
  ),
);
const placementStore = writable<PlotPlacement>(
  readStored(STORAGE_KEYS.plotPlacement, isPlacement, DEFAULT_PLACEMENT),
);

function persistDocuments(documents: PlotDocument[]): void {
  writeStored(STORAGE_KEYS.plotDocuments, {
    version: PLOT_DOCUMENT_STORAGE_VERSION,
    documents,
  });
}

export const plotDocuments = { subscribe: documentsStore.subscribe };
export const activePlotDocumentId = { subscribe: activeIdStore.subscribe };
export const plotPlacement = { subscribe: placementStore.subscribe };

export const activePlotDocument = derived(
  [documentsStore, activeIdStore],
  ([$documents, $id]) => $documents.find((doc) => doc.id === $id) ?? null,
);

export function setActivePlotDocument(document: PlotDocument): void {
  const optimized = optimizePlotDocument(document);
  const list = get(documentsStore);
  const next = [
    optimized,
    ...list.filter((entry) => entry.id !== optimized.id),
  ].slice(0, MAX_DOCUMENTS);
  documentsStore.set(next);
  persistDocuments(next);
  activeIdStore.set(optimized.id);
  writeStored(STORAGE_KEYS.activePlotDocumentId, optimized.id);
}

export function selectPlotDocument(id: string): void {
  if (!get(documentsStore).some((doc) => doc.id === id)) return;
  activeIdStore.set(id);
  writeStored(STORAGE_KEYS.activePlotDocumentId, id);
}

/**
 * Renames a prepared document's display name only.
 * Does not alter source provenance (p5 sketch id, SVG filename, hashes).
 */
export function renamePlotDocument(id: string, name: string): boolean {
  const list = get(documentsStore);
  const index = list.findIndex((doc) => doc.id === id);
  if (index < 0) return false;
  const safe = name.trim() || FALLBACK_DOCUMENT_NAME;
  const current = list[index]!;
  if (current.name === safe) return true;
  const next = [...list];
  next[index] = {
    ...current,
    name: safe,
    updatedAt: Date.now(),
  };
  documentsStore.set(next);
  persistDocuments(next);
  return true;
}

/**
 * Deletes one prepared document and its persisted geometry/metadata.
 * When the active document is removed, selects the next visible neighbor,
 * otherwise the previous; clears active id and resets placement when empty.
 */
export function deletePlotDocument(id: string): boolean {
  const list = get(documentsStore);
  const index = list.findIndex((doc) => doc.id === id);
  if (index < 0) return false;
  const next = list.filter((doc) => doc.id !== id);
  documentsStore.set(next);
  persistDocuments(next);
  if (get(activeIdStore) === id) {
    const fallback = next[index]?.id ?? next[index - 1]?.id ?? null;
    activeIdStore.set(fallback);
    writeStored(STORAGE_KEYS.activePlotDocumentId, fallback);
    if (fallback === null) {
      resetPlacement();
    }
  }
  return true;
}

/**
 * Removes every prepared document and document-specific placement.
 * Does not touch Generate sketches or machine profiles.
 */
export function clearAllPlotDocuments(): void {
  documentsStore.set([]);
  persistDocuments([]);
  activeIdStore.set(null);
  writeStored(STORAGE_KEYS.activePlotDocumentId, null);
  resetPlacement();
}

/** Serialized size of the documents envelope currently in memory (UTF-8 bytes). */
export function estimatePlotDocumentsStorageBytes(): number {
  const payload = JSON.stringify({
    version: PLOT_DOCUMENT_STORAGE_VERSION,
    documents: get(documentsStore),
  });
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload).length;
  }
  return payload.length;
}

export function formatPlotDocumentsStorageEstimate(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function updatePlacement(patch: Partial<PlotPlacement>): void {
  const next: PlotPlacement = {
    ...get(placementStore),
    ...patch,
    rotation: (patch.rotation ?? get(placementStore).rotation) as PlotRotation,
  };
  placementStore.set(next);
  writeStored(STORAGE_KEYS.plotPlacement, next);
}

export function resetPlacement(): void {
  placementStore.set({ ...DEFAULT_PLACEMENT });
  writeStored(STORAGE_KEYS.plotPlacement, DEFAULT_PLACEMENT);
}

/** Test helper. */
export function __resetPlotDocumentsForTests(next: PlotDocument[] = []): void {
  documentsStore.set(next);
  persistDocuments(next);
  const id = next[0]?.id ?? null;
  activeIdStore.set(id);
  writeStored(STORAGE_KEYS.activePlotDocumentId, id);
  if (next.length === 0) {
    resetPlacement();
  }
}

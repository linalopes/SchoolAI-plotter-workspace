import { derived, get, writable } from 'svelte/store';
import { createId, isRecord, toTrimmedString } from '../utils/misc';
import {
  STORAGE_KEYS,
  readStored,
  readStoredRaw,
  writeStored,
} from '../utils/storage';
import {
  BLANK_SKETCH_SOURCE,
  LEGACY_UNTITLED_FALLBACK_SOURCE,
} from './blank';
import { getExampleById, SKETCH_EXAMPLES } from './examples';
import {
  defaultOutputSettings,
  type SketchOutputSettings,
} from './outputSettings';
import type { ImportedSketchMetadata, Sketch, SketchOrigin } from './types';
import { SKETCH_STORAGE_VERSION } from './types';

/**
 * Sketch collection for the Generate tab.
 *
 * Built-in examples are never stored here. Only explicit New sketch / Use example
 * / Import / Duplicate create user documents. Selecting a sketch never runs it.
 */

const MAX_NAME = 64;
const MAX_SOURCE = 200_000;

const ORIGINS: readonly SketchOrigin[] = [
  'blank',
  'example',
  'imported',
  'app-placeholder',
  'example-copy',
  'user',
];

function isOrigin(value: unknown): value is SketchOrigin {
  return typeof value === 'string' && (ORIGINS as readonly string[]).includes(value);
}

function normalizeOrigin(value: unknown, exampleId: string | null): SketchOrigin {
  if (isOrigin(value)) {
    if (value === 'example-copy') return 'example';
    if (value === 'user') return 'blank';
    return value;
  }
  if (exampleId) return 'example';
  return 'blank';
}

function sanitizeOutput(input: unknown): SketchOutputSettings {
  if (!isRecord(input)) return defaultOutputSettings();
  const mode =
    input.mode === 'custom' || input.mode === 'preserve-current'
      ? input.mode
      : 'preserve-current';
  const physicalWidthMm =
    typeof input.physicalWidthMm === 'number' &&
    Number.isFinite(input.physicalWidthMm) &&
    input.physicalWidthMm > 0
      ? input.physicalWidthMm
      : undefined;
  const physicalHeightMm =
    typeof input.physicalHeightMm === 'number' &&
    Number.isFinite(input.physicalHeightMm) &&
    input.physicalHeightMm > 0
      ? input.physicalHeightMm
      : undefined;
  return {
    version: 1,
    mode,
    physicalWidthMm,
    physicalHeightMm,
    lockAspectRatio: true,
  };
}

function sanitizeImported(input: unknown): ImportedSketchMetadata | undefined {
  if (!isRecord(input)) return undefined;
  const originalFileName = toTrimmedString(input.originalFileName);
  const importedAt = toTrimmedString(input.importedAt);
  if (!originalFileName || !importedAt) return undefined;
  return { originalFileName, importedAt };
}

function knownPlaceholderSources(): string[] {
  const sources = [BLANK_SKETCH_SOURCE, LEGACY_UNTITLED_FALLBACK_SOURCE];
  const simple = SKETCH_EXAMPLES.find((entry) => entry.id === 'simple-line');
  if (simple) sources.push(simple.source);
  return sources;
}

/**
 * Conservative pristine-placeholder detector.
 *
 * Never uses the title alone. Requires an exact known default source (or an
 * explicit app-placeholder origin).
 */
export function isPristinePlaceholder(sketch: Sketch): boolean {
  if (sketch.origin === 'app-placeholder') {
    return knownPlaceholderSources().includes(sketch.source);
  }
  if (sketch.origin === 'example' || sketch.origin === 'example-copy') return false;
  if (sketch.origin === 'imported') return false;
  if (sketch.exampleId) return false;
  if (!/^Untitled sketch(?: \d+)?$/.test(sketch.name)) return false;
  return knownPlaceholderSources().includes(sketch.source);
}

function sanitizeSketch(input: unknown, preserveId = true): Sketch | null {
  if (!isRecord(input)) return null;
  const name = toTrimmedString(input.name).slice(0, MAX_NAME);
  const source = typeof input.source === 'string' ? input.source.slice(0, MAX_SOURCE) : '';
  if (name.length === 0 || source.length === 0) return null;

  const id =
    preserveId && typeof input.id === 'string' && input.id.length > 0
      ? input.id.slice(0, 64)
      : createId('sketch');

  const now = Date.now();
  const createdAt =
    typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
      ? input.createdAt
      : now;
  const updatedAt =
    typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
      ? input.updatedAt
      : createdAt;

  const exampleId = typeof input.exampleId === 'string' ? input.exampleId : null;
  const origin = normalizeOrigin(input.origin, exampleId);
  const imported = sanitizeImported(input.imported);

  return {
    id,
    name,
    source,
    exampleId,
    origin,
    output: sanitizeOutput(input.output),
    ...(imported ? { imported } : {}),
    createdAt,
    updatedAt,
  };
}

function migratePlaceholders(sketches: Sketch[]): Sketch[] {
  return sketches.filter((sketch) => !isPristinePlaceholder(sketch));
}

function loadSketches(): Sketch[] {
  const raw = readStoredRaw(STORAGE_KEYS.sketches);
  if (!isRecord(raw) || !Array.isArray(raw.sketches)) return [];
  const loaded = raw.sketches
    .map((entry) => sanitizeSketch(entry))
    .filter((entry): entry is Sketch => entry !== null);
  return migratePlaceholders(loaded);
}

function loadActiveId(sketches: Sketch[]): string | null {
  const stored = readStored<string | null>(
    STORAGE_KEYS.activeSketchId,
    (v): v is string | null => typeof v === 'string' || v === null,
    null,
  );
  if (stored && sketches.some((sketch) => sketch.id === stored)) return stored;
  return sketches[0]?.id ?? null;
}

function wasBootstrapped(): boolean {
  return readStored(
    STORAGE_KEYS.generateBootstrapped,
    (v): v is boolean => typeof v === 'boolean',
    false,
  );
}

function markBootstrapped(): void {
  writeStored(STORAGE_KEYS.generateBootstrapped, true);
}

function uniqueName(base: string, list: Sketch[]): string {
  const taken = new Set(list.map((sketch) => sketch.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** Prefer "Name", then "Name copy", then "Name copy 2". */
export function uniqueExampleCopyName(base: string, list: Sketch[]): string {
  const taken = new Set(list.map((sketch) => sketch.name));
  if (!taken.has(base)) return base;
  const copyBase = `${base} copy`;
  if (!taken.has(copyBase)) return copyBase;
  let n = 2;
  while (taken.has(`${copyBase} ${n}`)) n += 1;
  return `${copyBase} ${n}`;
}

let initialSketches = loadSketches();

// First-ever visit with no content: create one blank placeholder so the editor
// has somewhere to land. Later visits with an empty list stay empty.
if (initialSketches.length === 0 && !wasBootstrapped()) {
  const now = Date.now();
  initialSketches = [
    {
      id: createId('sketch'),
      name: 'Untitled sketch',
      source: BLANK_SKETCH_SOURCE,
      exampleId: null,
      origin: 'app-placeholder',
      output: defaultOutputSettings(),
      createdAt: now,
      updatedAt: now,
    },
  ];
  markBootstrapped();
} else if (initialSketches.length > 0) {
  markBootstrapped();
}

const sketchesStore = writable<Sketch[]>(initialSketches);
const activeSketchIdStore = writable<string | null>(loadActiveId(initialSketches));

// Persist migration / first-visit bootstrap immediately.
writeStored(STORAGE_KEYS.sketches, {
  version: SKETCH_STORAGE_VERSION,
  sketches: initialSketches,
});
writeStored(STORAGE_KEYS.activeSketchId, get(activeSketchIdStore));

function persist(sketches: Sketch[]): void {
  writeStored(STORAGE_KEYS.sketches, {
    version: SKETCH_STORAGE_VERSION,
    sketches,
  });
}

function commit(sketches: Sketch[]): void {
  sketchesStore.set(sketches);
  persist(sketches);
  markBootstrapped();
}

export const sketches = { subscribe: sketchesStore.subscribe };
export const activeSketchId = { subscribe: activeSketchIdStore.subscribe };

export const activeSketch = derived(
  [sketchesStore, activeSketchIdStore],
  ([$sketches, $id]) => $sketches.find((sketch) => sketch.id === $id) ?? null,
);

export function selectSketch(id: string): void {
  if (!get(sketchesStore).some((sketch) => sketch.id === id)) return;
  activeSketchIdStore.set(id);
  writeStored(STORAGE_KEYS.activeSketchId, id);
}

export function createSketch(
  name = 'Untitled sketch',
  source: string = BLANK_SKETCH_SOURCE,
  options: {
    origin?: SketchOrigin;
    exampleId?: string | null;
    imported?: ImportedSketchMetadata;
    output?: SketchOutputSettings;
    focusTitle?: boolean;
  } = {},
): Sketch {
  const list = get(sketchesStore);
  const now = Date.now();
  const sketch: Sketch = {
    id: createId('sketch'),
    name: uniqueName(name, list),
    source: source.slice(0, MAX_SOURCE),
    exampleId: options.exampleId ?? null,
    origin: options.origin ?? 'blank',
    output: options.output ?? defaultOutputSettings(),
    ...(options.imported ? { imported: options.imported } : {}),
    createdAt: now,
    updatedAt: now,
  };
  commit([...list, sketch]);
  selectSketch(sketch.id);
  return sketch;
}

/**
 * Import a single-file p5 sketch. Never runs the source.
 */
export function importSketch(input: {
  fileName: string;
  source: string;
}): Sketch {
  const baseName =
    input.fileName.replace(/\.js$/i, '').trim() || 'Imported sketch';
  const list = get(sketchesStore);
  const name = uniqueExampleCopyName(baseName, list);
  return createSketch(name, input.source, {
    origin: 'imported',
    imported: {
      originalFileName: input.fileName,
      importedAt: new Date().toISOString(),
    },
    output: defaultOutputSettings(),
  });
}

/**
 * Explicit Use example action — the only way a built-in template becomes a
 * user sketch. Does not run merely because the gallery was opened.
 */
export function useExample(exampleId: string): Sketch | null {
  const example = getExampleById(exampleId);
  if (!example) return null;
  const exampleSnapshot = {
    exampleId: example.id,
    title: example.name,
    source: example.source,
  };
  const list = get(sketchesStore);
  const now = Date.now();
  const sketch: Sketch = {
    id: createId('sketch'),
    name: uniqueExampleCopyName(exampleSnapshot.title, list),
    source: exampleSnapshot.source,
    exampleId: exampleSnapshot.exampleId,
    origin: 'example',
    output: defaultOutputSettings(),
    createdAt: now,
    updatedAt: now,
  };
  commit([...list, sketch]);
  selectSketch(sketch.id);
  return sketch;
}

/**
 * Reports user sketches that claim an example origin but no longer match the
 * immutable template source. Never overwrites them — UI may offer Restore.
 */
export function findMismatchedExampleCopies(): Array<{
  sketchId: string;
  sketchName: string;
  exampleId: string;
  exampleName: string;
}> {
  const list = get(sketchesStore);
  const mismatches: Array<{
    sketchId: string;
    sketchName: string;
    exampleId: string;
    exampleName: string;
  }> = [];
  for (const sketch of list) {
    if (!sketch.exampleId) continue;
    const example = getExampleById(sketch.exampleId);
    if (!example) continue;
    if (sketch.source !== example.source) {
      mismatches.push({
        sketchId: sketch.id,
        sketchName: sketch.name,
        exampleId: example.id,
        exampleName: example.name,
      });
    }
  }
  return mismatches;
}

/** @deprecated Use useExample — kept as an alias for older call sites/tests. */
export function createFromExample(exampleId: string): Sketch | null {
  return useExample(exampleId);
}

export function duplicateSketch(id: string): Sketch | null {
  const list = get(sketchesStore);
  const source = list.find((sketch) => sketch.id === id);
  if (!source) return null;
  const taken = new Set(list.map((sketch) => sketch.name));
  const copyBase = `${source.name} copy`;
  let name = copyBase;
  if (taken.has(name)) {
    let n = 2;
    while (taken.has(`${copyBase} ${n}`)) n += 1;
    name = `${copyBase} ${n}`;
  }
  const copy: Sketch = {
    ...source,
    id: createId('sketch'),
    name,
    origin: source.origin === 'app-placeholder' ? 'blank' : source.origin,
    output: { ...source.output, lockAspectRatio: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  commit([...list, copy]);
  selectSketch(copy.id);
  return copy;
}

/**
 * Deletes a sketch after the UI has confirmed.
 * Refuses only when the id is unknown. Empty libraries are valid.
 */
export function deleteSketch(id: string): boolean {
  const list = get(sketchesStore);
  const remaining = list.filter((sketch) => sketch.id !== id);
  if (remaining.length === list.length) return false;
  commit(remaining);
  if (get(activeSketchIdStore) === id) {
    const next = remaining[0];
    if (next) selectSketch(next.id);
    else {
      activeSketchIdStore.set(null);
      writeStored(STORAGE_KEYS.activeSketchId, null);
    }
  }
  return true;
}

export function renameSketch(id: string, name: string): void {
  const trimmed = name.trim() || 'Untitled sketch';
  const sketch = get(sketchesStore).find((entry) => entry.id === id);
  updateSketch(id, {
    name: trimmed,
    ...(sketch?.origin === 'app-placeholder' ? { origin: 'blank' as const } : {}),
  });
}

export function updateSketchSource(id: string, source: string): void {
  const sketch = get(sketchesStore).find((entry) => entry.id === id);
  const promote =
    sketch?.origin === 'app-placeholder' && source !== BLANK_SKETCH_SOURCE;
  updateSketch(id, {
    source,
    ...(promote ? { origin: 'blank' as const } : {}),
  });
}

export function updateSketchOutput(id: string, output: SketchOutputSettings): void {
  updateSketch(id, { output: { ...output, lockAspectRatio: true, version: 1 } });
}

export function updateSketch(
  id: string,
  patch: Partial<
    Pick<Sketch, 'name' | 'source' | 'exampleId' | 'origin' | 'output' | 'imported'>
  >,
): void {
  const list = get(sketchesStore);
  commit(
    list.map((sketch) => {
      if (sketch.id !== id) return sketch;
      return {
        ...sketch,
        ...patch,
        name: (patch.name ?? sketch.name).slice(0, MAX_NAME),
        source: (patch.source ?? sketch.source).slice(0, MAX_SOURCE),
        output: patch.output
          ? sanitizeOutput(patch.output)
          : sketch.output ?? defaultOutputSettings(),
        updatedAt: Date.now(),
      };
    }),
  );
}

/** Restore the immutable built-in source into an example-copy sketch. */
export function restoreOriginalExample(id: string): boolean {
  const sketch = get(sketchesStore).find((entry) => entry.id === id);
  if (!sketch?.exampleId) return false;
  const example = getExampleById(sketch.exampleId);
  if (!example) return false;
  updateSketch(id, { source: example.source, origin: 'example' });
  return true;
}

/** Test-only helper to replace in-memory sketch state. */
export function __resetSketchesForTests(next: Sketch[] = []): void {
  const normalized = next.map((entry) => ({
    ...entry,
    output: entry.output ?? defaultOutputSettings(),
  }));
  sketchesStore.set(normalized);
  persist(normalized);
  const id = normalized[0]?.id ?? null;
  activeSketchIdStore.set(id);
  writeStored(STORAGE_KEYS.activeSketchId, id);
}

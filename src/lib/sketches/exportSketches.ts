import { strToU8, zipSync } from 'fflate';
import { APP_CONFIG } from '../config';
import {
  allocateUniqueJsFilenames,
  downloadBlob,
  downloadTextFile,
  sanitizeDownloadBasename,
} from '../utils/download';
import type { Sketch, SketchOrigin } from './types';

/**
 * Portable Generate sketch downloads.
 *
 * Primary bulk export: ZIP of ordinary `.js` files + manifest.json.
 * Does not include machine profiles, prepared documents, or serial state.
 * Does not execute, Run, or Capture sketches.
 */

export const SKETCH_ARCHIVE_FORMAT = 'plotter-workspace-sketch-archive' as const;
export const SKETCH_ARCHIVE_VERSION = 1 as const;

/** Soft guard against unusually large in-browser ZIP builds. */
const MAX_ARCHIVE_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_ARCHIVE_SKETCHES = 500;

export type SketchArchiveOrigin = 'blank' | 'example' | 'imported';

export type SketchArchiveManifestEntry = {
  id: string;
  name: string;
  fileName: string;
  origin: SketchArchiveOrigin;
  createdAt?: string;
  updatedAt?: string;
  originalFileName?: string;
  outputSettings?: unknown;
};

export type SketchArchiveManifest = {
  format: typeof SKETCH_ARCHIVE_FORMAT;
  version: typeof SKETCH_ARCHIVE_VERSION;
  exportedAt: string;
  application: {
    name: string;
    version?: string;
  };
  author?: {
    name: string;
  };
  sketches: SketchArchiveManifestEntry[];
};

export type SketchZipExportResult =
  | { ok: true; filename: string; count: number; bytes: number }
  | { ok: false; error: string };

function archiveOrigin(origin: SketchOrigin): SketchArchiveOrigin {
  if (origin === 'imported') return 'imported';
  if (origin === 'example' || origin === 'example-copy') return 'example';
  return 'blank';
}

function toIso(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

/** Filename for a single sketch .js download (kebab-case, unchanged policy). */
export function sketchJsFilename(name: string): string {
  return `${sanitizeDownloadBasename(name, 'untitled-sketch')}.js`;
}

/**
 * Download the exact editable source of one sketch as UTF-8 `.js`.
 * Does not run, capture, or upload the sketch.
 */
export function downloadSketchJs(sketch: Pick<Sketch, 'name' | 'source'>): {
  filename: string;
} {
  if (typeof sketch.source !== 'string') {
    throw new Error('Sketch source must be a string.');
  }
  const filename = sketchJsFilename(sketch.name);
  downloadTextFile(sketch.source, filename, 'text/javascript');
  return { filename };
}

export function buildSketchArchiveManifest(
  sketches: readonly Sketch[],
  fileNames: readonly string[],
  exportedAt: string,
): SketchArchiveManifest {
  if (fileNames.length !== sketches.length) {
    throw new Error('Archive filename count does not match sketch count.');
  }
  return {
    format: SKETCH_ARCHIVE_FORMAT,
    version: SKETCH_ARCHIVE_VERSION,
    exportedAt,
    application: {
      name: APP_CONFIG.productName,
    },
    author: {
      name: APP_CONFIG.author.name,
    },
    sketches: sketches.map((sketch, index) => {
      const entry: SketchArchiveManifestEntry = {
        id: sketch.id,
        name: sketch.name,
        fileName: fileNames[index]!,
        origin: archiveOrigin(sketch.origin),
      };
      const createdAt = toIso(sketch.createdAt);
      const updatedAt = toIso(sketch.updatedAt);
      if (createdAt) entry.createdAt = createdAt;
      if (updatedAt) entry.updatedAt = updatedAt;
      if (sketch.imported?.originalFileName) {
        entry.originalFileName = sketch.imported.originalFileName;
      }
      if (sketch.output) {
        entry.outputSettings = sketch.output;
      }
      return entry;
    }),
  };
}

/**
 * Build ZIP bytes for all sketches (`.js` + `manifest.json` in a dated folder).
 * Pure aside from using the current clock for the export timestamp / folder name.
 */
export function buildSketchArchiveZip(sketches: readonly Sketch[]): {
  filename: string;
  bytes: Uint8Array;
  manifest: SketchArchiveManifest;
  fileNames: string[];
} {
  if (sketches.length === 0) {
    throw new Error('There are no sketches to download.');
  }
  if (sketches.length > MAX_ARCHIVE_SKETCHES) {
    throw new Error(
      `Too many sketches to download at once (maximum ${MAX_ARCHIVE_SKETCHES}).`,
    );
  }

  let totalSourceBytes = 0;
  for (const sketch of sketches) {
    if (typeof sketch.source !== 'string') {
      throw new Error(`Sketch "${sketch.name}" has a non-string source.`);
    }
    totalSourceBytes += utf8ByteLength(sketch.source);
    if (totalSourceBytes > MAX_ARCHIVE_SOURCE_BYTES) {
      throw new Error(
        'Sketch collection is too large to package as a ZIP in the browser.',
      );
    }
  }

  const exportedAt = new Date().toISOString();
  const day = exportedAt.slice(0, 10);
  const folder = `plotter-workspace-sketches-${day}`;
  const fileNames = allocateUniqueJsFilenames(sketches.map((s) => s.name));
  const manifest = buildSketchArchiveManifest(sketches, fileNames, exportedAt);

  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < sketches.length; i += 1) {
    files[`${folder}/${fileNames[i]!}`] = strToU8(sketches[i]!.source);
  }
  files[`${folder}/manifest.json`] = strToU8(
    JSON.stringify(manifest, null, 2),
  );

  const bytes = zipSync(files, { level: 6 });
  return {
    filename: `${folder}.zip`,
    bytes,
    manifest,
    fileNames,
  };
}

/** Download all sketches as a ZIP of ordinary `.js` files plus manifest.json. */
export function downloadAllSketchesZip(
  sketches: readonly Sketch[],
): SketchZipExportResult {
  if (sketches.length === 0) {
    return { ok: false, error: 'There are no sketches to download.' };
  }
  try {
    const archive = buildSketchArchiveZip(sketches);
    // Copy into a fresh ArrayBuffer-backed Uint8Array for Blob compatibility.
    const copy = new Uint8Array(archive.bytes.byteLength);
    copy.set(archive.bytes);
    downloadBlob(new Blob([copy], { type: 'application/zip' }), archive.filename);
    return {
      ok: true,
      filename: archive.filename,
      count: sketches.length,
      bytes: archive.bytes.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not create the sketch ZIP archive.',
    };
  }
}

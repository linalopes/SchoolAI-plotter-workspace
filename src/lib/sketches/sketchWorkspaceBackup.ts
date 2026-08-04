import { APP_CONFIG } from '../config';
import type { Sketch, SketchOrigin } from './types';

/**
 * Future complete workspace / sketch backup serialization.
 *
 * Kept for a paired Export / Import workspace backup milestone.
 * Not exposed in the Generate UI — a backup format without restore must not
 * be the primary portable export.
 */

export const SKETCH_WORKSPACE_BACKUP_FORMAT = 'plotter-workspace-sketches' as const;
export const SKETCH_WORKSPACE_BACKUP_VERSION = 1 as const;

export type SketchBackupOrigin = 'blank' | 'example' | 'imported';

export type SketchWorkspaceBackupEntry = {
  id: string;
  name: string;
  source: string;
  origin: SketchBackupOrigin;
  createdAt?: string;
  updatedAt?: string;
  originalFileName?: string;
  outputSettings?: unknown;
};

export type SketchWorkspaceBackupFile = {
  format: typeof SKETCH_WORKSPACE_BACKUP_FORMAT;
  version: typeof SKETCH_WORKSPACE_BACKUP_VERSION;
  exportedAt: string;
  application: {
    name: string;
    version?: string;
  };
  author?: {
    name: string;
  };
  sketches: SketchWorkspaceBackupEntry[];
};

function backupOrigin(origin: SketchOrigin): SketchBackupOrigin {
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

/** Build an in-memory JSON backup payload (not downloaded by the UI). */
export function buildSketchWorkspaceBackupFile(
  sketches: readonly Sketch[],
): SketchWorkspaceBackupFile {
  return {
    format: SKETCH_WORKSPACE_BACKUP_FORMAT,
    version: SKETCH_WORKSPACE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    application: {
      name: APP_CONFIG.productName,
    },
    author: {
      name: APP_CONFIG.author.name,
    },
    sketches: sketches.map((sketch) => {
      if (typeof sketch.source !== 'string') {
        throw new Error(`Sketch "${sketch.name}" has a non-string source.`);
      }
      const entry: SketchWorkspaceBackupEntry = {
        id: sketch.id,
        name: sketch.name,
        source: sketch.source,
        origin: backupOrigin(sketch.origin),
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

export function serializeSketchWorkspaceBackup(
  sketches: readonly Sketch[],
):
  | { ok: true; json: string; count: number }
  | { ok: false; error: string } {
  if (sketches.length === 0) {
    return { ok: false, error: 'There are no sketches to export.' };
  }
  try {
    const payload = buildSketchWorkspaceBackupFile(sketches);
    const json = JSON.stringify(payload, null, 2);
    return { ok: true, json, count: sketches.length };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not serialize the workspace backup.',
    };
  }
}

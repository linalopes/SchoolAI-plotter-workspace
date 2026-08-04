/** User-editable p5 sketch persisted in LocalStorage. */

import type { SketchOutputSettings } from './outputSettings';

/**
 * Where a sketch came from.
 *
 * Current values: blank | example | imported.
 * Legacy values are still accepted during migration.
 */
export type SketchOrigin =
  | 'blank'
  | 'example'
  | 'imported'
  | 'app-placeholder'
  | 'example-copy'
  | 'user';

export type ImportedSketchMetadata = {
  originalFileName: string;
  importedAt: string;
};

export interface Sketch {
  id: string;
  name: string;
  source: string;
  /** Built-in example id when this sketch was created from an example. */
  exampleId: string | null;
  origin: SketchOrigin;
  output: SketchOutputSettings;
  imported?: ImportedSketchMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface SketchExample {
  id: string;
  name: string;
  description: string;
  source: string;
  /** Short tags shown on gallery cards. */
  tags: readonly string[];
  /**
   * Static SVG preview under /example-previews/.
   * Never derived from unvalidated user input.
   */
  previewUrl: string;
}

/** Persisted sketch collection schema version. */
export const SKETCH_STORAGE_VERSION = 2;

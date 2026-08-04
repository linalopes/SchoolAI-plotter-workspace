import { analyzeSketchSource } from './analyzeSketch';
import type { SketchCompatibilityReport } from './types';

export const IMPORT_MAX_BYTES = 1_048_576;

export type JsFileReadResult =
  | {
      ok: true;
      fileName: string;
      source: string;
      report: SketchCompatibilityReport;
    }
  | { ok: false; error: string };

/**
 * Validates and reads a local .js file in the browser. Never executes it.
 */
export async function readJsSketchFile(file: File): Promise<JsFileReadResult> {
  const name = file.name || 'sketch.js';
  if (!/\.js$/i.test(name)) {
    return { ok: false, error: 'Only single-file .js sketches can be imported.' };
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return {
      ok: false,
      error: `File exceeds the ${Math.round(IMPORT_MAX_BYTES / 1024)} KB import limit.`,
    };
  }

  let source: string;
  try {
    source = await file.text();
  } catch {
    return { ok: false, error: 'The file could not be read as text.' };
  }

  if (!source.trim()) {
    return { ok: false, error: 'The selected file is empty.' };
  }

  // Reject obvious non-JS wrappers without executing.
  if (/^\s*</.test(source) && /<\/(html|script|body)>/i.test(source)) {
    return {
      ok: false,
      error: 'HTML files are not supported. Export a single .js sketch file instead.',
    };
  }

  const report = analyzeSketchSource(source);
  return {
    ok: true,
    fileName: name,
    source,
    report,
  };
}

export function sketchNameFromFileName(fileName: string): string {
  return fileName.replace(/\.js$/i, '').trim() || 'Imported sketch';
}

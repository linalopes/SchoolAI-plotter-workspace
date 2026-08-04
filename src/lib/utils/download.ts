/**
 * Browser file download helpers.
 *
 * Reused for sketch .js downloads, ZIP archives, and similar exports.
 * Never executes content and never uploads.
 */

/** Sanitize a display name into a portable kebab-case basename (no extension). */
export function sanitizeDownloadBasename(
  name: string,
  fallback = 'untitled',
): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

/**
 * Sanitize a sketch display name for use inside a ZIP archive.
 * Preserves spaces and letter case; strips path / reserved characters.
 */
export function sanitizeArchiveJsBasename(
  name: string,
  fallback = 'untitled-sketch',
): string {
  let base = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (base.length > 100) {
    base = base.slice(0, 100).replace(/[. ]+$/g, '').trim();
  }
  return base || fallback;
}

/**
 * Allocate unique `.js` filenames for an archive.
 * Duplicates become `Name copy.js`, then `Name copy 2.js`, …
 */
export function allocateUniqueJsFilenames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = sanitizeArchiveJsBasename(name);
    const tryName = (candidate: string): string | null => {
      const key = candidate.toLowerCase();
      if (used.has(key)) return null;
      used.add(key);
      return candidate;
    };
    return (
      tryName(`${base}.js`) ??
      tryName(`${base} copy.js`) ??
      (() => {
        let n = 2;
        while (true) {
          const candidate = `${base} copy ${n}.js`;
          const accepted = tryName(candidate);
          if (accepted) return accepted;
          n += 1;
        }
      })()
    );
  });
}

export function downloadTextFile(
  contents: string,
  filename: string,
  mimeType: string,
): void {
  downloadBlob(
    new Blob([contents], { type: `${mimeType};charset=utf-8` }),
    filename,
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

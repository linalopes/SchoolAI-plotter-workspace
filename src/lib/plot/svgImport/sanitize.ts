/**
 * Sanitize untrusted SVG markup before parse / persistence.
 *
 * Removes scripts, event handlers, foreign content, and external resources.
 * Does not execute anything. Returns sanitized XML text only.
 */

export type SanitizeResult =
  | {
      ok: true;
      sanitizedSvg: string;
      removedCounts: Record<string, number>;
    }
  | { ok: false; error: string; removedCounts: Record<string, number> };

const DENIED_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'audio',
  'video',
  'handler', // SVG tiny
]);

const EVENT_ATTR_RE = /^on/i;

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isUnsafeUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^javascript:/i.test(v)) return true;
  if (/^vbscript:/i.test(v)) return true;
  if (/^data:/i.test(v)) {
    // Allow only plain SVG/XML data URLs that are not HTML/JS.
    if (/^data:image\/svg\+xml/i.test(v) || /^data:text\/plain/i.test(v)) {
      return /<script/i.test(v);
    }
    return true;
  }
  if (/^https?:\/\//i.test(v)) return true;
  if (/^\/\//.test(v)) return true;
  return false;
}

function stripEventAndUnsafeAttrs(el: Element, counts: Record<string, number>): void {
  const toRemove: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const value = attr.value;
    if (EVENT_ATTR_RE.test(name)) {
      toRemove.push(name);
      bump(counts, `attr:${name.toLowerCase()}`);
      continue;
    }
    if (
      name === 'href' ||
      name === 'xlink:href' ||
      name.endsWith(':href') ||
      name === 'src' ||
      name === 'xlink:src'
    ) {
      if (isUnsafeUrl(value) || (value.startsWith('http') || value.includes('://'))) {
        // External or unsafe — remove. Internal "#id" references are kept.
        if (!value.trim().startsWith('#')) {
          toRemove.push(name);
          bump(counts, 'external-url');
        }
      }
    }
    if (name === 'style' && /expression\s*\(|javascript:/i.test(value)) {
      toRemove.push(name);
      bump(counts, 'attr:style-unsafe');
    }
  }
  for (const name of toRemove) el.removeAttribute(name);
}

function walkRemove(node: Node, counts: Record<string, number>): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase().replace(/^.*:/, '');

  if (DENIED_TAGS.has(tag)) {
    bump(counts, `tag:${tag}`);
    el.remove();
    return;
  }

  // External stylesheets
  if (tag === 'link' || (tag === 'style' && el.getAttribute('src'))) {
    bump(counts, `tag:${tag}`);
    el.remove();
    return;
  }

  stripEventAndUnsafeAttrs(el, counts);

  // Walk a static copy — removals mutate children.
  for (const child of Array.from(el.childNodes)) {
    walkRemove(child, counts);
  }
}

export function sanitizeSvgMarkup(svgText: string): SanitizeResult {
  const removedCounts: Record<string, number> = {};
  if (!svgText.trim()) {
    return { ok: false, error: 'The SVG file is empty.', removedCounts };
  }

  // Strip XML processing instructions / DOCTYPE that can enable XXE-like tricks
  // in some parsers (browser DOMParser is generally safe; still strip).
  let text = svgText
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '');

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch {
    return { ok: false, error: 'The SVG could not be parsed.', removedCounts };
  }

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return {
      ok: false,
      error: 'The SVG contained a parse error.',
      removedCounts,
    };
  }

  const svg = doc.querySelector('svg');
  if (!svg) {
    return { ok: false, error: 'No <svg> root was found.', removedCounts };
  }

  walkRemove(svg, removedCounts);

  // Re-serialize from the sanitized root only.
  const serialized = new XMLSerializer().serializeToString(svg);
  if (!serialized.includes('<svg')) {
    return { ok: false, error: 'Sanitization failed.', removedCounts };
  }

  return { ok: true, sanitizedSvg: serialized, removedCounts };
}

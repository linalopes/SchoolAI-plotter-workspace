import { createId } from '../../utils/misc';
import { hashSource } from '../../sketches/sourceHash';
import {
  dedupePoints,
  sampleCircle,
  sampleEllipse,
} from '../pathMath';
import { parsePathDDetailed } from '../svgPath';
import {
  computeBounds,
  type PlotDocument,
  type PlotPath,
  type PlotPoint,
} from '../types';
import { SVG_FLATTEN } from './flattenConfig';
import { SVG_IMPORT_LIMITS } from './limits';
import {
  IDENTITY,
  multiply,
  parseTransformAttribute,
  transformPoints,
  type Matrix2D,
  translate,
  scale as scaleMatrix,
} from './matrix';
import { sanitizeSvgMarkup } from './sanitize';
import type {
  SvgImportDraft,
  SvgImportMetadata,
  SvgImportStatus,
  SvgImportWarning,
} from './types';
import {
  combineDetectedUnits,
  isPhysicalUnit,
  lengthToMillimetres,
  MM_PER_PX,
  parseSvgLength,
} from './units';

export type ImportSvgOptions = {
  fileName: string;
  /** Override physical size (mm). Aspect lock applied by caller. */
  physicalWidthMm?: number;
  physicalHeightMm?: number;
};

type Visibility = {
  displayNone: boolean;
  hidden: boolean;
  opacityZero: boolean;
};

type CollectContext = {
  paths: PlotPath[];
  warnings: SvgImportWarning[];
  ignoredCounts: Record<string, number>;
  unsupportedCounts: Record<string, number>;
  filledShapeCount: number;
  degenerateRemoved: number;
  elementCount: number;
  startedAt: number;
  limitHit?: string;
  hasStyleBlock: boolean;
  inClipOrMask: boolean;
};

function bump(map: Record<string, number>, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

function warn(
  ctx: CollectContext,
  level: SvgImportWarning['level'],
  code: string,
  text: string,
): void {
  if (ctx.warnings.some((w) => w.code === code && w.text === text)) return;
  ctx.warnings.push({ level, code, text });
}

function parseViewBox(
  raw: string | null,
): { minX: number; minY: number; width: number; height: number } | null {
  if (!raw?.trim()) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number.parseFloat(p));
  if (
    parts.length !== 4 ||
    !parts.every((n) => Number.isFinite(n)) ||
    (parts[2] as number) <= 0 ||
    (parts[3] as number) <= 0
  ) {
    return null;
  }
  return {
    minX: parts[0] as number,
    minY: parts[1] as number,
    width: parts[2] as number,
    height: parts[3] as number,
  };
}

function readPresentation(el: Element, inherited: Visibility): Visibility {
  const style = el.getAttribute('style') ?? '';
  const display =
    el.getAttribute('display') ??
    /(?:^|;)\s*display\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const visibility =
    el.getAttribute('visibility') ??
    /(?:^|;)\s*visibility\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const opacityRaw =
    el.getAttribute('opacity') ??
    /(?:^|;)\s*opacity\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const opacity = opacityRaw != null ? Number.parseFloat(opacityRaw) : NaN;

  return {
    displayNone: inherited.displayNone || display === 'none',
    hidden:
      inherited.hidden ||
      visibility === 'hidden' ||
      visibility === 'collapse',
    opacityZero:
      inherited.opacityZero ||
      (Number.isFinite(opacity) && opacity <= 0),
  };
}

function isHidden(v: Visibility): boolean {
  return v.displayNone || v.hidden || v.opacityZero;
}

function hasFill(el: Element): boolean {
  const fill = el.getAttribute('fill');
  const style = el.getAttribute('style') ?? '';
  const styleFill = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const value = (fill ?? styleFill ?? '').trim().toLowerCase();
  if (!value || value === 'none' || value === 'transparent') return false;
  return true;
}

function strokeColor(el: Element): string | undefined {
  const stroke = el.getAttribute('stroke');
  if (stroke && stroke !== 'none') return stroke;
  const style = el.getAttribute('style') ?? '';
  const m = /(?:^|;)\s*stroke\s*:\s*([^;]+)/i.exec(style);
  const v = m?.[1]?.trim();
  return v && v !== 'none' ? v : undefined;
}

function fillColor(el: Element): string | undefined {
  if (!hasFill(el)) return undefined;
  return el.getAttribute('fill') ?? undefined;
}

function checkLimits(ctx: CollectContext): boolean {
  if (ctx.limitHit) return false;
  if (Date.now() - ctx.startedAt > SVG_IMPORT_LIMITS.maxProcessingMs) {
    ctx.limitHit = 'maxProcessingMs';
    return false;
  }
  if (ctx.elementCount > SVG_IMPORT_LIMITS.maxElementCount) {
    ctx.limitHit = 'maxElementCount';
    return false;
  }
  if (ctx.paths.length > SVG_IMPORT_LIMITS.maxPathCount) {
    ctx.limitHit = 'maxPathCount';
    return false;
  }
  let points = 0;
  for (const path of ctx.paths) points += path.points.length;
  if (points > SVG_IMPORT_LIMITS.maxTotalPoints) {
    ctx.limitHit = 'maxTotalPoints';
    return false;
  }
  return true;
}

function pushPath(
  ctx: CollectContext,
  points: PlotPoint[],
  closed: boolean,
  el: Element,
  matrix: Matrix2D,
): void {
  if (!checkLimits(ctx)) return;
  let pts = dedupePoints(
    transformPoints(matrix, points).filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  );
  if (pts.length > SVG_IMPORT_LIMITS.maxPointsPerPath) {
    warn(
      ctx,
      'warning',
      'path-too-long',
      `A path exceeded ${SVG_IMPORT_LIMITS.maxPointsPerPath} points and was truncated.`,
    );
    pts = pts.slice(0, SVG_IMPORT_LIMITS.maxPointsPerPath);
  }
  if (pts.length < 2) {
    ctx.degenerateRemoved += 1;
    return;
  }
  ctx.paths.push({
    id: createId('path'),
    points: pts,
    closed,
    svgSource: {
      sourceElementId: el.getAttribute('id') ?? undefined,
      sourceElementType: el.tagName.toLowerCase().replace(/^.*:/, ''),
      strokeColor: strokeColor(el),
      fillColor: fillColor(el),
    },
  });
  if (hasFill(el) && closed) ctx.filledShapeCount += 1;
}

function localName(el: Element): string {
  return el.tagName.toLowerCase().replace(/^.*:/, '');
}

function collect(
  el: Element,
  parentMatrix: Matrix2D,
  visibility: Visibility,
  ctx: CollectContext,
): void {
  if (!checkLimits(ctx)) return;
  ctx.elementCount += 1;
  const tag = localName(el);
  const vis = readPresentation(el, visibility);
  const local = parseTransformAttribute(el.getAttribute('transform'));
  const matrix = multiply(parentMatrix, local);

  if (tag === 'style') {
    ctx.hasStyleBlock = true;
    bump(ctx.ignoredCounts, 'style');
    warn(
      ctx,
      'warning',
      'style-block',
      'Class-based CSS in <style> blocks is not fully interpreted. Inline visibility attributes are respected.',
    );
    return;
  }

  if (tag === 'defs') {
    // Walk defs only to count unsupported content; do not emit geometry.
    for (const child of Array.from(el.children)) {
      const childTag = localName(child);
      if (
        childTag === 'clippath' ||
        childTag === 'mask' ||
        childTag === 'lineargradient' ||
        childTag === 'radialgradient' ||
        childTag === 'pattern' ||
        childTag === 'marker' ||
        childTag === 'symbol' ||
        childTag === 'filter'
      ) {
        bump(ctx.unsupportedCounts, childTag);
      }
    }
    return;
  }

  if (tag === 'clippath' || tag === 'mask') {
    bump(ctx.unsupportedCounts, tag);
    warn(
      ctx,
      'warning',
      'clip-mask',
      'Clipping masks may change the imported result. Underlying geometry may be imported without clipping.',
    );
    return;
  }

  if (
    tag === 'lineargradient' ||
    tag === 'radialgradient' ||
    tag === 'pattern' ||
    tag === 'marker' ||
    tag === 'filter'
  ) {
    bump(ctx.unsupportedCounts, tag);
    return;
  }

  if (tag === 'text' || tag === 'tspan' || tag === 'textpath') {
    bump(ctx.unsupportedCounts, 'text');
    warn(
      ctx,
      'unsupported',
      'text',
      'Text is not supported. Convert text to paths in the source application before importing.',
    );
    return;
  }

  if (tag === 'image') {
    bump(ctx.unsupportedCounts, 'image');
    warn(
      ctx,
      'unsupported',
      'image',
      'Raster images are not supported in this milestone.',
    );
    return;
  }

  if (tag === 'use' || tag === 'symbol') {
    bump(ctx.unsupportedCounts, tag);
    warn(
      ctx,
      'unsupported',
      'use-symbol',
      `<${tag}> references are not resolved in this milestone.`,
    );
    return;
  }

  if (tag === 'g' || tag === 'svg' || tag === 'a') {
    if (isHidden(vis)) {
      bump(ctx.ignoredCounts, 'hidden-group');
      return;
    }
    for (const child of Array.from(el.children)) {
      collect(child, matrix, vis, ctx);
      if (ctx.limitHit) return;
    }
    return;
  }

  if (isHidden(vis)) {
    bump(ctx.ignoredCounts, 'hidden');
    return;
  }

  const readNum = (name: string, fallback = 0) => {
    const v = Number.parseFloat(el.getAttribute(name) ?? '');
    return Number.isFinite(v) ? v : fallback;
  };

  if (tag === 'line') {
    pushPath(
      ctx,
      [
        { x: readNum('x1'), y: readNum('y1') },
        { x: readNum('x2'), y: readNum('y2') },
      ],
      false,
      el,
      matrix,
    );
    return;
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const numbers = (el.getAttribute('points') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map((p) => Number.parseFloat(p))
      .filter((n) => Number.isFinite(n));
    const pts: PlotPoint[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      pts.push({ x: numbers[i]!, y: numbers[i + 1]! });
    }
    pushPath(ctx, pts, tag === 'polygon', el, matrix);
    return;
  }

  if (tag === 'circle') {
    const r = readNum('r');
    if (r > 0) {
      pushPath(
        ctx,
        sampleCircle(readNum('cx'), readNum('cy'), r, SVG_FLATTEN.circleSteps),
        true,
        el,
        matrix,
      );
    }
    return;
  }

  if (tag === 'ellipse') {
    const rx = readNum('rx');
    const ry = readNum('ry');
    if (rx > 0 && ry > 0) {
      pushPath(
        ctx,
        sampleEllipse(
          readNum('cx'),
          readNum('cy'),
          rx,
          ry,
          SVG_FLATTEN.ellipseSteps,
        ),
        true,
        el,
        matrix,
      );
    }
    return;
  }

  if (tag === 'rect') {
    const x = readNum('x');
    const y = readNum('y');
    const w = readNum('width');
    const h = readNum('height');
    const rx = readNum('rx');
    const ry = readNum('ry', rx);
    if (w > 0 && h > 0) {
      if (rx > 0 || ry > 0) {
        warn(
          ctx,
          'warning',
          'rounded-rect',
          'Rounded rectangle corners were approximated as a sharp rectangle.',
        );
        bump(ctx.ignoredCounts, 'rounded-rect-approx');
      }
      pushPath(
        ctx,
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        true,
        el,
        matrix,
      );
    }
    return;
  }

  if (tag === 'path') {
    const d = el.getAttribute('d') ?? '';
    if (!d.trim()) return;
    const parsed = parsePathDDetailed(d);
    for (const msg of parsed.warnings) {
      warn(ctx, 'warning', 'path-command', msg);
    }
    for (const sub of parsed.subpaths) {
      pushPath(ctx, sub.points, sub.closed, el, matrix);
    }
    return;
  }

  bump(ctx.ignoredCounts, tag);
}

function buildViewportMatrix(
  viewBox: { minX: number; minY: number; width: number; height: number } | null,
  viewportWidthUu: number,
  viewportHeightUu: number,
  par: string,
): { matrix: Matrix2D; support: 'full' | 'partial' | 'default' } {
  // Work in user units of the viewport (before mm scale).
  if (!viewBox) {
    return { matrix: IDENTITY, support: 'default' };
  }

  const normalized = par.trim() || 'xMidYMid meet';
  const lower = normalized.toLowerCase();

  if (lower === 'none') {
    const sx = viewportWidthUu / viewBox.width;
    const sy = viewportHeightUu / viewBox.height;
    return {
      matrix: multiply(
        scaleMatrix(sx, sy),
        translate(-viewBox.minX, -viewBox.minY),
      ),
      support: 'full',
    };
  }

  // Default and common meet/slice with alignment.
  const parts = lower.split(/\s+/);
  const align = parts[0] ?? 'xmidymid';
  const meetOrSlice = parts[1] ?? 'meet';

  const knownAlign = [
    'xmidymid',
    'xminymin',
    'xminymid',
    'xminymax',
    'xmidymin',
    'xmidymax',
    'xmaxymin',
    'xmaxymid',
    'xmaxymax',
  ];
  const support: 'full' | 'partial' | 'default' =
    (align === 'xmidymid' && meetOrSlice === 'meet') || lower === 'xmidymid meet'
      ? 'default'
      : knownAlign.includes(align) &&
          (meetOrSlice === 'meet' || meetOrSlice === 'slice')
        ? 'full'
        : 'partial';

  const sx = viewportWidthUu / viewBox.width;
  const sy = viewportHeightUu / viewBox.height;
  let scaleUniform =
    meetOrSlice === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  if (!Number.isFinite(scaleUniform) || scaleUniform <= 0) scaleUniform = 1;

  let tx = -viewBox.minX * scaleUniform;
  let ty = -viewBox.minY * scaleUniform;
  const mappedW = viewBox.width * scaleUniform;
  const mappedH = viewBox.height * scaleUniform;

  const alignX = align.startsWith('xmin')
    ? 'min'
    : align.startsWith('xmax')
      ? 'max'
      : 'mid';
  const alignY = align.endsWith('ymin')
    ? 'min'
    : align.endsWith('ymax')
      ? 'max'
      : 'mid';

  if (alignX === 'mid') tx += (viewportWidthUu - mappedW) / 2;
  else if (alignX === 'max') tx += viewportWidthUu - mappedW;
  if (alignY === 'mid') ty += (viewportHeightUu - mappedH) / 2;
  else if (alignY === 'max') ty += viewportHeightUu - mappedH;

  return {
    matrix: multiply(translate(tx, ty), scaleMatrix(scaleUniform, scaleUniform)),
    support,
  };
}

function resolvePhysicalSize(
  svg: Element,
  options: ImportSvgOptions,
): {
  widthMm: number;
  heightMm: number;
  mmPerUuX: number;
  mmPerUuY: number;
  viewportUuW: number;
  viewportUuH: number;
  detectedUnits: ReturnType<typeof combineDetectedUnits>;
  sizeSource: SvgImportMetadata['sizeSource'];
  needsPhysicalSize: boolean;
  sourceWidth?: string;
  sourceHeight?: string;
  viewBox: ReturnType<typeof parseViewBox>;
  warnings: SvgImportWarning[];
} {
  const warnings: SvgImportWarning[] = [];
  const widthAttr = svg.getAttribute('width');
  const heightAttr = svg.getAttribute('height');
  const wLen = parseSvgLength(widthAttr);
  const hLen = parseSvgLength(heightAttr);
  const viewBox = parseViewBox(svg.getAttribute('viewBox'));

  if (options.physicalWidthMm && options.physicalHeightMm) {
    const widthMm = options.physicalWidthMm;
    const heightMm = options.physicalHeightMm;
    const viewportUuW = viewBox?.width ?? wLen?.value ?? 1;
    const viewportUuH = viewBox?.height ?? hLen?.value ?? 1;
    return {
      widthMm,
      heightMm,
      mmPerUuX: widthMm / viewportUuW,
      mmPerUuY: heightMm / viewportUuH,
      viewportUuW,
      viewportUuH,
      detectedUnits: combineDetectedUnits(wLen?.unit, hLen?.unit),
      sizeSource: 'user-override',
      needsPhysicalSize: false,
      sourceWidth: widthAttr ?? undefined,
      sourceHeight: heightAttr ?? undefined,
      viewBox,
      warnings,
    };
  }

  const wMm = wLen ? lengthToMillimetres(wLen) : null;
  const hMm = hLen ? lengthToMillimetres(hLen) : null;
  const wUnit = wLen?.unit;
  const hUnit = hLen?.unit;

  if (
    wLen?.unit === 'percentage' ||
    hLen?.unit === 'percentage'
  ) {
    warnings.push({
      level: 'warning',
      code: 'percentage-size',
      text: 'Percentage root dimensions cannot be resolved. Set a physical output size.',
    });
    const fallbackUuW = viewBox?.width ?? 400;
    const fallbackUuH = viewBox?.height ?? 400;
    return {
      widthMm: fallbackUuW * MM_PER_PX,
      heightMm: fallbackUuH * MM_PER_PX,
      mmPerUuX: MM_PER_PX,
      mmPerUuY: MM_PER_PX,
      viewportUuW: fallbackUuW,
      viewportUuH: fallbackUuH,
      detectedUnits: 'percentage',
      sizeSource: 'percentage-override',
      needsPhysicalSize: true,
      sourceWidth: widthAttr ?? undefined,
      sourceHeight: heightAttr ?? undefined,
      viewBox,
      warnings,
    };
  }

  if (
    wMm != null &&
    hMm != null &&
    wMm > 0 &&
    hMm > 0 &&
    wUnit &&
    hUnit &&
    isPhysicalUnit(wUnit) &&
    isPhysicalUnit(hUnit)
  ) {
    const viewportUuW = viewBox?.width ?? wLen!.value;
    const viewportUuH = viewBox?.height ?? hLen!.value;
    return {
      widthMm: wMm,
      heightMm: hMm,
      mmPerUuX: wMm / viewportUuW,
      mmPerUuY: hMm / viewportUuH,
      viewportUuW,
      viewportUuH,
      detectedUnits: combineDetectedUnits(wUnit, hUnit),
      sizeSource: 'physical',
      needsPhysicalSize: false,
      sourceWidth: widthAttr ?? undefined,
      sourceHeight: heightAttr ?? undefined,
      viewBox,
      warnings,
    };
  }

  if (wMm != null && hMm != null && wMm > 0 && hMm > 0) {
    // px or unitless at 96 DPI
    const viewportUuW = viewBox?.width ?? wLen!.value;
    const viewportUuH = viewBox?.height ?? hLen!.value;
    const unitless =
      wUnit === 'unitless' || hUnit === 'unitless';
    if (unitless) {
      warnings.push({
        level: 'warning',
        code: 'unitless-96dpi',
        text: 'Unitless width/height are interpreted as SVG/CSS user units at 96 DPI.',
      });
    }
    return {
      widthMm: wMm,
      heightMm: hMm,
      mmPerUuX: wMm / viewportUuW,
      mmPerUuY: hMm / viewportUuH,
      viewportUuW,
      viewportUuH,
      detectedUnits: combineDetectedUnits(wUnit, hUnit),
      sizeSource: unitless ? 'unitless-96dpi' : 'px-96dpi',
      needsPhysicalSize: false,
      sourceWidth: widthAttr ?? undefined,
      sourceHeight: heightAttr ?? undefined,
      viewBox,
      warnings,
    };
  }

  // viewBox only / missing dimensions
  const viewportUuW = viewBox?.width ?? 400;
  const viewportUuH = viewBox?.height ?? 400;
  warnings.push({
    level: 'warning',
    code: 'ambiguous-size',
    text: 'No physical size was declared. Default interpretation uses SVG units at 96 DPI. You can edit the physical size before importing.',
  });
  return {
    widthMm: viewportUuW * MM_PER_PX,
    heightMm: viewportUuH * MM_PER_PX,
    mmPerUuX: MM_PER_PX,
    mmPerUuY: MM_PER_PX,
    viewportUuW,
    viewportUuH,
    detectedUnits: viewBox ? 'unitless' : 'unknown',
    sizeSource: 'viewbox-96dpi',
    needsPhysicalSize: true,
    sourceWidth: widthAttr ?? undefined,
    sourceHeight: heightAttr ?? undefined,
    viewBox,
    warnings,
  };
}

/**
 * Inspect, sanitize, and parse an external SVG into an import draft.
 * Does not create a PlotDocument until the user confirms.
 */
export function prepareSvgImport(
  svgText: string,
  options: ImportSvgOptions,
): SvgImportDraft {
  const fileName = options.fileName || 'drawing.svg';

  if (svgText.length > SVG_IMPORT_LIMITS.maxFileBytes) {
    return {
      status: 'cannot-import',
      fileName,
      sanitizedSvg: '',
      sourceHash: '',
      metadata: emptyMeta(fileName),
      paths: [],
      widthMm: 0,
      heightMm: 0,
      needsPhysicalSize: false,
      error: `File exceeds the ${Math.round(SVG_IMPORT_LIMITS.maxFileBytes / (1024 * 1024))} MB import limit.`,
    };
  }

  const sanitized = sanitizeSvgMarkup(svgText);
  if (!sanitized.ok) {
    return {
      status: 'cannot-import',
      fileName,
      sanitizedSvg: '',
      sourceHash: '',
      metadata: emptyMeta(fileName),
      paths: [],
      widthMm: 0,
      heightMm: 0,
      needsPhysicalSize: false,
      error: sanitized.error,
    };
  }

  const sourceHash = hashSource(sanitized.sanitizedSvg);
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(
      sanitized.sanitizedSvg,
      'image/svg+xml',
    );
  } catch {
    return fail(fileName, 'The sanitized SVG could not be parsed.');
  }
  const svg = doc.querySelector('svg');
  if (!svg) return fail(fileName, 'No <svg> root was found.');

  const size = resolvePhysicalSize(svg, options);
  const par = svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
  const viewport = buildViewportMatrix(
    size.viewBox,
    size.viewportUuW,
    size.viewportUuH,
    par,
  );

  // Root user-space → viewport user units → millimetres → Y-up.
  // mm scale + Y flip applied once after geometry collection in viewport space.
  const ctx: CollectContext = {
    paths: [],
    warnings: [...size.warnings],
    ignoredCounts: {},
    unsupportedCounts: {},
    filledShapeCount: 0,
    degenerateRemoved: 0,
    elementCount: 0,
    startedAt: Date.now(),
    hasStyleBlock: false,
    inClipOrMask: false,
  };

  if (Object.keys(sanitized.removedCounts).length > 0) {
    warn(
      ctx,
      'security',
      'sanitized',
      'Unsafe markup was removed before import (scripts, handlers, or external resources).',
    );
  }

  if (viewport.support === 'partial') {
    warn(
      ctx,
      'warning',
      'preserve-aspect-ratio',
      `preserveAspectRatio="${par}" is only partially supported.`,
    );
  }

  // Collect children with viewport matrix (includes viewBox origin).
  // Root svg transform attribute is included via collect on svg itself —
  // but collect on svg recurses children; apply root transform separately.
  const rootTransform = parseTransformAttribute(svg.getAttribute('transform'));
  const rootMatrix = multiply(viewport.matrix, rootTransform);
  const rootVis: Visibility = { displayNone: false, hidden: false, opacityZero: false };

  for (const child of Array.from(svg.children)) {
    collect(child, rootMatrix, rootVis, ctx);
    if (ctx.limitHit) break;
  }

  if (ctx.limitHit) {
    return {
      status: 'cannot-import',
      fileName,
      sanitizedSvg: sanitized.sanitizedSvg,
      sourceHash,
      metadata: emptyMeta(fileName),
      paths: [],
      widthMm: 0,
      heightMm: 0,
      needsPhysicalSize: false,
      error: `Import stopped: ${ctx.limitHit} limit exceeded.`,
    };
  }

  if (ctx.paths.length === 0) {
    return {
      status: 'cannot-import',
      fileName,
      sanitizedSvg: sanitized.sanitizedSvg,
      sourceHash,
      metadata: {
        ...emptyMeta(fileName),
        warnings: ctx.warnings,
        ignoredCounts: ctx.ignoredCounts,
        unsupportedCounts: ctx.unsupportedCounts,
        removedForSecurity: sanitized.removedCounts,
      },
      paths: [],
      widthMm: 0,
      heightMm: 0,
      needsPhysicalSize: size.needsPhysicalSize,
      error: 'No importable geometry was found.',
    };
  }

  // Convert viewport user units → document mm, Y-up (exactly once).
  const mmX = size.mmPerUuX;
  const mmY = size.mmPerUuY;
  const heightMm = size.heightMm;
  const mapped: PlotPath[] = ctx.paths.map((path) => ({
    ...path,
    points: path.points.map((p) => ({
      x: p.x * mmX,
      y: heightMm - p.y * mmY,
    })),
  }));

  warn(
    ctx,
    'info',
    'stroke-centerline',
    'Stroke width is ignored; the pen follows the path centerline.',
  );
  if (ctx.filledShapeCount > 0) {
    warn(
      ctx,
      'warning',
      'fill-outline',
      'Filled shapes will be plotted as outlines. Fills are not reproduced.',
    );
  }

  const closedPathCount = mapped.filter((p) => p.closed).length;
  const hasWarnings = ctx.warnings.some(
    (w) => w.level === 'warning' || w.level === 'unsupported' || w.level === 'security',
  );
  const status: SvgImportStatus = hasWarnings
    ? 'ready-with-warnings'
    : 'ready';

  const metadata: SvgImportMetadata = {
    version: 1,
    originalFileName: fileName,
    importedAt: new Date().toISOString(),
    sourceHash,
    sourceWidth: size.sourceWidth,
    sourceHeight: size.sourceHeight,
    viewBox: size.viewBox ?? undefined,
    detectedUnits: size.detectedUnits,
    sizeSource: size.sizeSource,
    physicalWidthMm: size.widthMm,
    physicalHeightMm: size.heightMm,
    millimetersPerUserUnitX: mmX,
    millimetersPerUserUnitY: mmY,
    preserveAspectRatio: par,
    preserveAspectRatioSupport: viewport.support,
    acceptedGeometryCount: mapped.length,
    closedPathCount,
    filledShapeCount: ctx.filledShapeCount,
    degenerateRemovedCount: ctx.degenerateRemoved,
    ignoredCounts: ctx.ignoredCounts,
    unsupportedCounts: ctx.unsupportedCounts,
    removedForSecurity: sanitized.removedCounts,
    warnings: ctx.warnings,
  };

  return {
    status,
    fileName,
    sanitizedSvg: sanitized.sanitizedSvg,
    sourceHash,
    metadata,
    paths: mapped,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    needsPhysicalSize: size.needsPhysicalSize,
  };
}

function emptyMeta(fileName: string): SvgImportMetadata {
  return {
    version: 1,
    originalFileName: fileName,
    importedAt: new Date().toISOString(),
    sourceHash: '',
    detectedUnits: 'unknown',
    sizeSource: 'viewbox-96dpi',
    physicalWidthMm: 0,
    physicalHeightMm: 0,
    millimetersPerUserUnitX: MM_PER_PX,
    millimetersPerUserUnitY: MM_PER_PX,
    preserveAspectRatio: 'xMidYMid meet',
    preserveAspectRatioSupport: 'default',
    acceptedGeometryCount: 0,
    closedPathCount: 0,
    filledShapeCount: 0,
    degenerateRemovedCount: 0,
    ignoredCounts: {},
    unsupportedCounts: {},
    removedForSecurity: {},
    warnings: [],
  };
}

function fail(fileName: string, error: string): SvgImportDraft {
  return {
    status: 'cannot-import',
    fileName,
    sanitizedSvg: '',
    sourceHash: '',
    metadata: emptyMeta(fileName),
    paths: [],
    widthMm: 0,
    heightMm: 0,
    needsPhysicalSize: false,
    error,
  };
}

/** Confirm a draft into a PlotDocument (caller adds to Documents store). */
export function confirmSvgImport(
  draft: SvgImportDraft,
  name: string,
): PlotDocument | null {
  if (draft.status === 'cannot-import' || draft.paths.length === 0) return null;
  const now = Date.now();
  return {
    id: createId('plot'),
    name,
    widthMm: draft.widthMm,
    heightMm: draft.heightMm,
    paths: draft.paths,
    bounds: computeBounds(draft.paths),
    source: 'svg-import',
    createdAt: now,
    updatedAt: now,
    rawSvg: draft.sanitizedSvg,
    svgImport: draft.metadata,
  };
}

export function documentNameFromSvgFileName(fileName: string): string {
  return fileName.replace(/\.svg$/i, '').trim() || 'drawing';
}

export function uniqueDocumentName(
  base: string,
  existing: string[],
): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  const copy = `${base} copy`;
  if (!taken.has(copy)) return copy;
  let n = 2;
  while (taken.has(`${copy} ${n}`)) n += 1;
  return `${copy} ${n}`;
}

export async function readSvgFile(file: File): Promise<
  | { ok: true; fileName: string; text: string }
  | { ok: false; error: string }
> {
  const name = file.name || 'drawing.svg';
  if (!/\.svg$/i.test(name) && file.type !== 'image/svg+xml') {
    return { ok: false, error: 'Only .svg files can be imported.' };
  }
  if (file.size > SVG_IMPORT_LIMITS.maxFileBytes) {
    return {
      ok: false,
      error: `File exceeds the ${Math.round(SVG_IMPORT_LIMITS.maxFileBytes / (1024 * 1024))} MB import limit.`,
    };
  }
  try {
    const text = await file.text();
    if (!text.trim()) return { ok: false, error: 'The selected file is empty.' };
    return { ok: true, fileName: name, text };
  } catch {
    return { ok: false, error: 'The file could not be read as text.' };
  }
}

/**
 * CSS/SVG length conversion to millimetres.
 *
 * 1 in = 25.4 mm
 * 1 px = 1/96 in  →  25.4/96 mm
 */

export const MM_PER_INCH = 25.4;
export const CSS_DPI = 96;
export const MM_PER_PX = MM_PER_INCH / CSS_DPI; // 0.264583…
export const MM_PER_PT = MM_PER_INCH / 72;
export const MM_PER_PC = MM_PER_PT * 12;
export const MM_PER_CM = 10;

export type SvgLengthUnit =
  | 'mm'
  | 'cm'
  | 'in'
  | 'pt'
  | 'pc'
  | 'px'
  | 'unitless'
  | 'percentage'
  | 'unknown';

export type ParsedLength = {
  value: number;
  unit: SvgLengthUnit;
  raw: string;
};

const LENGTH_RE =
  /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|pt|pc|px|%)?\s*$/i;

export function parseSvgLength(raw: string | null | undefined): ParsedLength | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;
  const match = LENGTH_RE.exec(text);
  if (!match) return { value: NaN, unit: 'unknown', raw: text };
  const value = Number.parseFloat(match[1] ?? '');
  if (!Number.isFinite(value)) return { value: NaN, unit: 'unknown', raw: text };
  const unitRaw = (match[2] ?? '').toLowerCase();
  let unit: SvgLengthUnit = 'unitless';
  if (unitRaw === 'mm') unit = 'mm';
  else if (unitRaw === 'cm') unit = 'cm';
  else if (unitRaw === 'in') unit = 'in';
  else if (unitRaw === 'pt') unit = 'pt';
  else if (unitRaw === 'pc') unit = 'pc';
  else if (unitRaw === 'px') unit = 'px';
  else if (unitRaw === '%') unit = 'percentage';
  return { value, unit, raw: text };
}

/** Convert a concrete (non-percentage) length to millimetres. */
export function lengthToMillimetres(parsed: ParsedLength): number | null {
  if (!Number.isFinite(parsed.value)) return null;
  switch (parsed.unit) {
    case 'mm':
      return parsed.value;
    case 'cm':
      return parsed.value * MM_PER_CM;
    case 'in':
      return parsed.value * MM_PER_INCH;
    case 'pt':
      return parsed.value * MM_PER_PT;
    case 'pc':
      return parsed.value * MM_PER_PC;
    case 'px':
    case 'unitless':
      return parsed.value * MM_PER_PX;
    case 'percentage':
    case 'unknown':
      return null;
    default:
      return null;
  }
}

export function isPhysicalUnit(unit: SvgLengthUnit): boolean {
  return unit === 'mm' || unit === 'cm' || unit === 'in' || unit === 'pt' || unit === 'pc';
}

export function combineDetectedUnits(
  widthUnit: SvgLengthUnit | undefined,
  heightUnit: SvgLengthUnit | undefined,
):
  | 'mm'
  | 'cm'
  | 'in'
  | 'pt'
  | 'pc'
  | 'px'
  | 'unitless'
  | 'percentage'
  | 'mixed'
  | 'unknown' {
  if (!widthUnit && !heightUnit) return 'unknown';
  const a = widthUnit ?? heightUnit!;
  const b = heightUnit ?? widthUnit!;
  if (a === 'percentage' || b === 'percentage') {
    return a === b ? 'percentage' : 'mixed';
  }
  if (a === b) {
    if (
      a === 'mm' ||
      a === 'cm' ||
      a === 'in' ||
      a === 'pt' ||
      a === 'pc' ||
      a === 'px' ||
      a === 'unitless'
    ) {
      return a;
    }
    return 'unknown';
  }
  // px and unitless are both 96 DPI interpretations.
  if (
    (a === 'px' && b === 'unitless') ||
    (a === 'unitless' && b === 'px')
  ) {
    return 'px';
  }
  return 'mixed';
}

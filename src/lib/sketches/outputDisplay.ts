import {
  formatMmPerUnit,
  legacyPhysicalSizeMm,
  resolveMillimetersPerUnit,
  type SketchOutputSettings,
} from './outputSettings';

export type CanvasSizeUnits = {
  widthUnits: number;
  heightUnits: number;
  source: 'runtime' | 'static' | 'unknown';
};

export function formatAspectRatio(width: number, height: number): string {
  const g = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width) / g}:${Math.round(height) / g}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function resolveDisplayPhysical(
  output: SketchOutputSettings,
  canvas: CanvasSizeUnits | null,
): {
  widthMm: number;
  heightMm: number;
  mmPerUnit: number;
  modeLabel: string;
} | null {
  if (!canvas || canvas.widthUnits <= 0 || canvas.heightUnits <= 0) return null;
  const mmPerUnit = resolveMillimetersPerUnit(
    output,
    canvas.widthUnits,
    canvas.heightUnits,
  );
  if (output.mode === 'preserve-current') {
    const legacy = legacyPhysicalSizeMm(canvas.widthUnits, canvas.heightUnits);
    return {
      widthMm: legacy.widthMm,
      heightMm: legacy.heightMm,
      mmPerUnit: legacy.mmPerUnit,
      modeLabel: 'Preserve current size',
    };
  }
  return {
    widthMm: canvas.widthUnits * mmPerUnit,
    heightMm: canvas.heightUnits * mmPerUnit,
    mmPerUnit,
    modeLabel: 'Custom',
  };
}

export function formatOutputMetaRow(
  canvas: CanvasSizeUnits | null,
  output: SketchOutputSettings,
): string {
  if (!canvas) {
    return 'Canvas unknown · Run to detect';
  }
  const physical = resolveDisplayPhysical(output, canvas);
  if (!physical) return 'Canvas unknown · Run to detect';
  const canvasPart = `Canvas ${canvas.widthUnits} × ${canvas.heightUnits} units`;
  const outPart = `Output ${Number.parseFloat(physical.widthMm.toFixed(1))} × ${Number.parseFloat(physical.heightMm.toFixed(1))} mm`;
  const scalePart = formatMmPerUnit(physical.mmPerUnit);
  return `${canvasPart} · ${outPart} · ${scalePart}`;
}

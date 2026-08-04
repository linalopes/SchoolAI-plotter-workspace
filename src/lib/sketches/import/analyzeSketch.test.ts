import { describe, expect, it, vi } from 'vitest';
import { analyzeSketchSource, sourceParses } from './analyzeSketch';

const STANDARD_2D = `
function setup() {
  createCanvas(400, 400);
  noLoop();
}
function draw() {
  noFill();
  line(20, 20, 380, 380);
}
`;

const WEBGL = `
function setup() {
  createCanvas(400, 400, WEBGL);
}
function draw() {
  box(40);
}
`;

const DYNAMIC_CANVAS = `
function setup() {
  createCanvas(windowWidth, windowHeight);
}
function draw() {
  line(0, 0, 10, 10);
}
`;

const WITH_ASSETS = `
function preload() {
  img = loadImage('photo.png');
}
function setup() {
  createCanvas(400, 400);
}
function draw() {
  image(img, 0, 0);
  line(20, 20, 380, 380);
}
`;

describe('analyzeSketchSource', () => {
  it('reports standard global-mode 2D sketches as likely compatible', () => {
    const report = analyzeSketchSource(STANDARD_2D);
    expect(report.syntax).toBe('compatible');
    expect(report.importable).toBe(true);
    expect(report.preview).toBe('compatible');
    expect(report.plotCapture).toBe('compatible');
    expect(report.hasSetup).toBe(true);
    expect(report.hasDraw).toBe(true);
    expect(report.canvas?.widthUnits).toBe(400);
    expect(report.canvas?.heightUnits).toBe(400);
    expect(report.canvas?.renderer).toBe('2d');
    expect(report.canvas?.detection).toBe('static');
  });

  it('detects WEBGL when statically visible', () => {
    const report = analyzeSketchSource(WEBGL);
    expect(report.importable).toBe(true);
    expect(report.canvas?.renderer).toBe('webgl');
    expect(report.plotCapture).toBe('unsupported');
    expect(report.preview).toBe('warning');
  });

  it('marks dynamic canvas dimensions unknown until runtime', () => {
    const report = analyzeSketchSource(DYNAMIC_CANVAS);
    expect(report.canvas?.detection).toBe('runtime');
    expect(report.canvas?.widthUnits).toBeUndefined();
    expect(report.warnings.some((w) => /runtime/i.test(w.text))).toBe(true);
  });

  it('warns about external assets', () => {
    const report = analyzeSketchSource(WITH_ASSETS);
    expect(report.externalAssets).toContain('loadImage');
    expect(report.plotCapture).toBe('warning');
    expect(
      report.warnings.some((w) => /assets that were not included/i.test(w.text)),
    ).toBe(true);
  });

  it('allows syntax errors to be imported for repair', () => {
    const report = analyzeSketchSource('function setup( {');
    expect(report.importable).toBe(true);
    expect(report.syntax).toBe('unsupported');
    expect(report.syntaxError?.line).toBeTypeOf('number');
  });

  it('never executes imported code during static analysis', () => {
    const spy = vi.spyOn(globalThis, 'Function');
    const report = analyzeSketchSource(
      'throw new Error("executed"); function setup(){ createCanvas(10,10); }',
    );
    expect(report.importable).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('sourceParses', () => {
  it('accepts valid source and rejects invalid', () => {
    expect(sourceParses(STANDARD_2D).ok).toBe(true);
    expect(sourceParses('function setup( {').ok).toBe(false);
  });
});

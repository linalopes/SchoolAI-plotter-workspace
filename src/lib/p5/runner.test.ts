import { describe, expect, it } from 'vitest';
import { SKETCH_EXAMPLES } from '../sketches/examples';
import {
  bootstrapContainsWithStatement,
  buildRuntimeSrcdoc,
  IFRAME_BOOTSTRAP_SOURCE,
} from './iframeBootstrap';
import { hostRunnerSourceMentionsWith, SKETCH_RUNTIME_ASSETS } from './runner';
import runnerSource from './runner.ts?raw';

const SIMPLE_LINE = `function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
  rect(40, 40, 320, 320);
  line(40, 40, 360, 360);
  line(360, 40, 40, 360);
}
`;

describe('isolated sketch runtime', () => {
  it('does not use a with statement in the iframe bootstrap', () => {
    expect(bootstrapContainsWithStatement()).toBe(false);
    expect(/\bwith\s*\(/.test(IFRAME_BOOTSTRAP_SOURCE)).toBe(false);
  });

  it('does not reintroduce a with-based host evaluator', () => {
    expect(hostRunnerSourceMentionsWith()).toBe(false);
    expect(/\bwith\s*\(/.test(runnerSource)).toBe(false);
    expect(/new Function\s*\(/.test(runnerSource)).toBe(false);
    expect(/"use strict"[\s\S]*with\s*\(/.test(runnerSource)).toBe(false);
    expect(runnerSource).toContain('sandbox');
    expect(runnerSource).toContain('allow-scripts');
    // Sandbox must mention allow-same-origin only in the intentional omit comment.
    expect(runnerSource).toContain('Intentionally omit allow-same-origin');
    expect(runnerSource).toMatch(/setAttribute\(\s*['"]sandbox['"]\s*,\s*['"]allow-scripts['"]\s*\)/);
    expect(runnerSource).toContain('postMessage');
  });

  it('builds a classic-script runtime document with local asset URLs', () => {
    const html = buildRuntimeSrcdoc(
      'https://example.test/p5.min.js',
      'https://example.test/p5.plotSvg.js',
      'preview',
    );
    expect(html).toContain('https://example.test/p5.min.js');
    expect(html).toContain('https://example.test/p5.plotSvg.js');
    expect(html).toContain('__SKETCH_RUNTIME_MODE__');
    expect(html).toContain(IFRAME_BOOTSTRAP_SOURCE.trim().slice(0, 40));
    expect(/\bwith\s*\(/.test(html)).toBe(false);
    expect(html).not.toContain('cdn.jsdelivr');
    expect(html).not.toContain('unpkg.com');
    expect(SKETCH_RUNTIME_ASSETS.p5).toBe('/vendor/p5.min.js');
    expect(SKETCH_RUNTIME_ASSETS.plotSvg).toBe('/vendor/p5.plotSvg.js');
  });

  it('keeps the Simple line test as standard global-mode p5', () => {
    expect(SIMPLE_LINE).toContain('function setup()');
    expect(SIMPLE_LINE).toContain('function draw()');
    expect(SIMPLE_LINE).toContain('createCanvas(400, 400)');
    expect(SIMPLE_LINE).toContain('line(40, 40, 360, 360)');
    expect(SIMPLE_LINE).not.toContain('p.createCanvas');
    expect(SIMPLE_LINE).not.toContain('p.setup');
    expect(SIMPLE_LINE).not.toMatch(/\bwith\s*\(/);
  });

  it('keeps all built-in examples as editable global-mode sketches', () => {
    const required = [
      'simple-line',
      'grid',
      'circles',
      'wave-lines',
      'noise-field',
      'polyline-composition',
    ];

    for (const id of required) {
      const example = SKETCH_EXAMPLES.find((entry) => entry.id === id);
      expect(example, id).toBeTruthy();
      expect(example!.source).toContain('function setup()');
      expect(example!.source).toContain('function draw()');
      expect(example!.source).toMatch(/\bcreateCanvas\s*\(/);
      expect(example!.source).not.toContain('p.createCanvas');
      expect(example!.source).not.toContain('new p5(');
      expect(example!.source).not.toMatch(/\bwith\s*\(/);
      expect(example!.tags.length).toBeGreaterThan(0);
      expect(example!.previewUrl).toMatch(/^\/example-previews\/.+\.svg$/);
    }
  });

  it('discovers setup/draw through classic script injection, not host globals', () => {
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('userScriptEl.textContent = source');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('typeof window.setup === "function"');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('typeof window.draw === "function"');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('new p5(undefined, preview)');
    expect(IFRAME_BOOTSTRAP_SOURCE).not.toContain('eval(');
  });

  it('separates preview execution from SVG capture', () => {
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('runtimeMode === "capture"');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('CAPTURE_SVG');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('beginRecordSvg(null)');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('SVG_CAPTURED');
    const previewDoc = buildRuntimeSrcdoc('/p5.js', '/plot.svg.js', 'preview');
    expect(previewDoc).toContain('__SKETCH_RUNTIME_MODE__ = "preview"');
    const captureDoc = buildRuntimeSrcdoc('/p5.js', '/plot.svg.js', 'capture');
    expect(captureDoc).toContain('__SKETCH_RUNTIME_MODE__ = "capture"');
  });

  it('stops previous sketches before starting a new run', () => {
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('function stopSketch()');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('p5Instance.remove()');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('preview.innerHTML = ""');
    expect(IFRAME_BOOTSTRAP_SOURCE).toContain('querySelectorAll("canvas")');
  });

  it('does not couple Generate capture to machine commands', () => {
    expect(runnerSource).not.toContain('sendCommand');
    expect(runnerSource).not.toContain('grblClient');
    expect(runnerSource).not.toContain('prepareJob');
    expect(runnerSource).not.toContain('startPreparedJob');
  });
});

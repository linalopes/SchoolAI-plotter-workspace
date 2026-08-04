import { describe, expect, it } from 'vitest';
import { SKETCH_EXAMPLES } from '../sketches/examples';
import exampleThumbnail from './components/ExampleThumbnail.svelte?raw';
import generateView from '../../views/GenerateView.svelte?raw';
import exampleGallery from './components/ExampleGallery.svelte?raw';

const EXPECTED_PREVIEWS = [
  '/example-previews/simple-line-test.svg',
  '/example-previews/grid.svg',
  '/example-previews/circles.svg',
  '/example-previews/wave-lines.svg',
  '/example-previews/noise-field.svg',
  '/example-previews/polyline-composition.svg',
] as const;

describe('static example previews', () => {
  it('gives every example a static preview URL under /example-previews/', () => {
    expect(SKETCH_EXAMPLES).toHaveLength(6);
    const urls = SKETCH_EXAMPLES.map((example) => example.previewUrl);
    expect([...urls].sort()).toEqual([...EXPECTED_PREVIEWS].sort());
    for (const example of SKETCH_EXAMPLES) {
      expect(example.previewUrl.startsWith('/example-previews/')).toBe(true);
      expect(example.previewUrl.endsWith('.svg')).toBe(true);
    }
  });

  it('does not create thumbnail-generation iframes or run p5 in the gallery', () => {
    expect(exampleThumbnail).toContain('<img');
    expect(exampleThumbnail).toContain('example.previewUrl');
    expect(exampleThumbnail).not.toContain('SketchRunner');
    expect(exampleThumbnail).not.toContain('iframe');
    expect(exampleThumbnail).not.toContain('postMessage');
    expect(exampleThumbnail).not.toContain('Generating preview');
    expect(exampleThumbnail).toContain('Preview unavailable');
    expect(exampleGallery).not.toContain('thumbnails');
    expect(generateView).not.toContain('getCachedThumbnail');
  });

  it('keeps browsing examples free of sketch execution hooks', () => {
    expect(exampleGallery).toContain('Use example');
    expect(exampleGallery).toContain('onUseExample(example.id)');
    expect(exampleGallery).not.toContain('runner.run');
    expect(exampleGallery).not.toContain('capture(');
  });
});

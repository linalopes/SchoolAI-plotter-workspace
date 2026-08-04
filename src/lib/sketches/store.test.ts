import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { BLANK_SKETCH_SOURCE } from './blank';
import { SKETCH_EXAMPLES } from './examples';
import {
  __resetSketchesForTests,
  createSketch,
  isPristinePlaceholder,
  sketches,
  uniqueExampleCopyName,
  useExample,
} from './store';
import { defaultOutputSettings } from './outputSettings';
import type { Sketch } from './types';

function sketch(partial: Partial<Sketch> & Pick<Sketch, 'id' | 'name' | 'source'>): Sketch {
  const now = Date.now();
  return {
    exampleId: null,
    origin: 'blank',
    output: defaultOutputSettings(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('sketch store UX rules', () => {
  beforeEach(() => {
    __resetSketchesForTests([]);
  });

  it('does not treat Browse examples as sketch creation', () => {
    expect(get(sketches)).toHaveLength(0);
    // Opening the gallery is a navigation concern; only useExample mutates.
    expect(SKETCH_EXAMPLES.length).toBe(6);
    expect(get(sketches)).toHaveLength(0);
  });

  it('Use example creates exactly one editable copy and leaves templates immutable', () => {
    const before = SKETCH_EXAMPLES.map((example) => example.source);
    const created = useExample('noise-field');
    expect(created).not.toBeNull();
    expect(get(sketches)).toHaveLength(1);
    expect(created!.origin).toBe('example');
    expect(created!.exampleId).toBe('noise-field');
    expect(created!.name).toBe('Noise field');
    expect(SKETCH_EXAMPLES.map((example) => example.source)).toEqual(before);

    useExample('noise-field');
    const names = get(sketches).map((entry) => entry.name);
    expect(names).toContain('Noise field');
    expect(names).toContain('Noise field copy');
    expect(get(sketches)).toHaveLength(2);
  });

  it('New sketch creates one blank document', () => {
    const created = createSketch();
    expect(created.source).toBe(BLANK_SKETCH_SOURCE);
    expect(created.origin).toBe('blank');
    expect(created.output.mode).toBe('preserve-current');
    expect(get(sketches)).toHaveLength(1);
  });

  it('unique example copy names follow Name / Name copy / Name copy 2', () => {
    const list = [
      sketch({ id: 'a', name: 'Grid', source: 'x' }),
      sketch({ id: 'b', name: 'Grid copy', source: 'x' }),
    ];
    expect(uniqueExampleCopyName('Grid', list)).toBe('Grid copy 2');
    expect(uniqueExampleCopyName('Circles', list)).toBe('Circles');
  });

  it('pristine placeholder migration never deletes edited content', () => {
    const pristine = sketch({
      id: 'p1',
      name: 'Untitled sketch',
      source: BLANK_SKETCH_SOURCE,
      origin: 'app-placeholder',
    });
    const editedUntitled = sketch({
      id: 'p2',
      name: 'Untitled sketch',
      source: `${BLANK_SKETCH_SOURCE}\nline(1,1,2,2);\n`,
      origin: 'blank',
    });
    const titled = sketch({
      id: 'p3',
      name: 'My study',
      source: BLANK_SKETCH_SOURCE,
      origin: 'blank',
    });

    expect(isPristinePlaceholder(pristine)).toBe(true);
    expect(isPristinePlaceholder(editedUntitled)).toBe(false);
    expect(isPristinePlaceholder(titled)).toBe(false);
    // Title alone is never enough:
    expect(
      isPristinePlaceholder(
        sketch({
          id: 'p4',
          name: 'Untitled sketch',
          source: 'function setup(){ createCanvas(10,10); }',
          origin: 'blank',
        }),
      ),
    ).toBe(false);
  });
});

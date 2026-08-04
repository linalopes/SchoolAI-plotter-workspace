import { describe, expect, it } from 'vitest';
import {
  allocateUniqueJsFilenames,
  sanitizeArchiveJsBasename,
  sanitizeDownloadBasename,
} from './download';

describe('sanitizeDownloadBasename', () => {
  it('turns display names into portable kebab-case basenames', () => {
    expect(sanitizeDownloadBasename('Noise field')).toBe('noise-field');
    expect(sanitizeDownloadBasename('My Sketch!!!')).toBe('my-sketch');
  });

  it('falls back for empty or invalid names', () => {
    expect(sanitizeDownloadBasename('   ', 'untitled-sketch')).toBe(
      'untitled-sketch',
    );
    expect(sanitizeDownloadBasename('@@@', 'untitled-sketch')).toBe(
      'untitled-sketch',
    );
  });
});

describe('archive filename sanitization', () => {
  it('preserves spaces and case while removing unsafe characters', () => {
    expect(sanitizeArchiveJsBasename('Polyline composition')).toBe(
      'Polyline composition',
    );
    expect(sanitizeArchiveJsBasename('Grid:study?/a')).toBe('Grid-study--a');
    expect(sanitizeArchiveJsBasename('   ')).toBe('untitled-sketch');
  });

  it('resolves duplicate names predictably', () => {
    expect(allocateUniqueJsFilenames(['Grid', 'Grid', 'Grid'])).toEqual([
      'Grid.js',
      'Grid copy.js',
      'Grid copy 2.js',
    ]);
  });
});

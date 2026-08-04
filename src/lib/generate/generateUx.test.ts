import { describe, expect, it } from 'vitest';
import generateNav from './components/GenerateNav.svelte?raw';
import generateView from '../../views/GenerateView.svelte?raw';
import guide from '../guide/content.ts?raw';

/**
 * Structural UX guarantees for Generate consolidation + Milestone 2.4.
 */

describe('Generate UX consolidation', () => {
  it('retains only one sidebar plus editor and preview — no inspector column', () => {
    expect(generateView).toContain('GenerateNav');
    expect(generateView).toContain('stage__editor');
    expect(generateView).toContain('stage__preview');
    expect(generateView).not.toContain('class="sketch-list"');
    expect(generateView).not.toContain('aria-label="Saved sketches"');
    expect(generateView).not.toContain('inspector');
    expect(generateView).not.toContain('right-sidebar');
    expect(generateNav).toContain('My sketches');
    expect(generateNav).toContain('Browse examples');
    expect(generateNav).toContain('aria-label="Generate navigation"');
    // No second permanent navigator / file browser column in the view.
    expect(generateView).not.toContain('aria-label="Imported sketches"');
    expect(generateView).not.toContain('permanent inspector');
  });

  it('New sketch exposes Blank sketch and Import p5.js — no Paste action', () => {
    expect(generateNav).toContain('+ New sketch');
    expect(generateNav).toContain('Blank sketch');
    expect(generateNav).toContain('Import p5.js');
    expect(generateNav).not.toMatch(/Paste code/i);
    expect(generateView).not.toMatch(/Paste code/i);
  });

  it('keeps Duplicate, Download .js, and Delete in the overflow menu, not as permanent top actions', () => {
    expect(generateNav).toContain('Rename');
    expect(generateNav).toContain('Duplicate');
    expect(generateNav).toContain('Download .js');
    expect(generateNav).toContain('Delete');
    expect(generateNav).toContain('Download all sketches (.zip)');
    expect(generateNav).not.toContain('Export all sketches…');
    expect(generateNav).not.toMatch(/as JSON backup/i);
    expect(generateNav).toContain('Saved locally in this browser');
    expect(generateNav).toContain('About local storage');
    expect(generateView).toContain('downloadSketchJs');
    expect(generateView).toContain('downloadAllSketchesZip');
    expect(generateView).not.toContain('exportAllSketches');
    expect(generateView).not.toContain('captureSvgToPlotDocument(download');
    expect(generateView).not.toMatch(
      /sidebar-actions[\s\S]*Duplicate[\s\S]*Delete/,
    );
  });

  it('does not auto-run ordinary sketch selection or import; Use example may auto-run', () => {
    expect(generateView).toContain(
      'Selecting an ordinary sketch never auto-executes',
    );
    expect(generateView).toContain(
      'Imported sketches never run on application startup or selection',
    );
    expect(generateView).toContain(
      'Imported code never runs automatically — user must click Run',
    );
    expect(generateView).toContain(
      'Trusted built-in content may auto-run after Use example',
    );
    expect(generateView).toContain('handleUseExample');
    expect(generateView).toContain('captureReady');
    expect(generateView).toContain('applySketchSelection');
    expect(generateView).toContain('createRunSnapshot');
  });

  it('shows compact canvas/output metadata without a permanent inspector', () => {
    expect(generateView).toContain('canvas-output-meta');
    expect(generateView).toContain('PhysicalOutputModal');
    expect(generateView).toContain('ImportSketchModal');
    expect(generateView).toContain('formatOutputMetaRow');
  });

  it('disables Run on invalid syntax and WEBGL capture', () => {
    expect(generateView).toContain('parseState.ok');
    expect(generateView).toContain('isWebgl');
    expect(generateView).toContain(
      'p5.plotSvg does not currently support WEBGL capture',
    );
  });

  it('gives the editor/preview split the former nested-list space', () => {
    expect(generateView).toContain('stage__split');
    expect(generateView).toContain('generateEditorRatio');
    expect(generateView).not.toContain('grid-template-columns: 180px');
  });

  it('documents import and physical size in the Guide', () => {
    expect(guide).toContain('importing-p5');
    expect(guide).toContain('canvas-units-physical-size');
    expect(guide).toContain('Imported code never runs until you click Run');
  });
});

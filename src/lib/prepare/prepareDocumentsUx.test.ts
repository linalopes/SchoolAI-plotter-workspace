import { describe, expect, it } from 'vitest';
import documentsList from './components/DocumentsList.svelte?raw';
import prepareView from '../../views/PrepareView.svelte?raw';

/**
 * Structural UX guarantees for Prepare document management.
 */

describe('Prepare document management UX', () => {
  it('exposes a document overflow menu with Rename and Delete on every row', () => {
    expect(documentsList).toContain('data-document-menu={doc.id}');
    expect(documentsList).toContain('Actions for ${doc.name}');
    expect(documentsList).toContain('Rename');
    expect(documentsList).toContain('Delete');
    expect(documentsList).toContain('⋯');
    expect(documentsList).toContain('sourceMarker');
    expect(documentsList).toContain("'SVG'");
    expect(documentsList).toContain("'p5'");
  });

  it('keeps a single sidebar and no permanent inspector column', () => {
    expect(prepareView).toContain('DocumentsList');
    expect(prepareView).toContain('Import SVG');
    expect(prepareView).not.toContain('permanent inspector');
    expect(prepareView).not.toContain('right-sidebar');
  });

  it('shows empty Prepare state with Generate and Import actions', () => {
    expect(prepareView).toContain('No prepared documents');
    expect(prepareView).toContain('Back to Generate');
    expect(prepareView).toContain('Import SVG');
    expect(documentsList).toContain('Clear all documents…');
  });

  it('blocks destructive document actions while a plot job holds a document', () => {
    expect(prepareView).toContain('isDocumentLockedByPlotJob');
    expect(prepareView).toContain('jobBlocksDocumentDeletion');
    expect(prepareView).toContain(
      'A plot job is using this document. Cancel or finish the job before deleting it.',
    );
    expect(prepareView).toContain('clearAllPlotDocuments');
    expect(prepareView).toContain('deletePlotDocument');
  });

  it('wires rename persistence without a second column', () => {
    expect(prepareView).toContain('RenameDocumentDialog');
    expect(prepareView).toContain('renamePlotDocument');
    expect(prepareView).toContain('ConfirmDialog');
  });
});

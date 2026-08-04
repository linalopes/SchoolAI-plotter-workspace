<script lang="ts">
  import ConfirmDialog from '../lib/components/ConfirmDialog.svelte';
  import EmptyState from '../lib/components/EmptyState.svelte';
  import MainSection from '../lib/components/MainSection.svelte';
  import Sidebar from '../lib/components/Sidebar.svelte';
  import type { SidebarSection } from '../lib/components/types';
  import {
    dismissJobConfirmation,
    isDocumentLockedByPlotJob,
    jobBlocksDocumentDeletion,
    jobIsActive,
    prepareJob,
    plotJob,
    startPreparedJob,
  } from '../lib/jobs/plotJob';
  import { isConnected } from '../lib/grbl/stores';
  import {
    activePlotDocument,
    clearAllPlotDocuments,
    deletePlotDocument,
    estimatePlotDocumentsStorageBytes,
    formatPlotDocumentsStorageEstimate,
    plotDocuments,
    plotPlacement,
    renamePlotDocument,
    selectPlotDocument,
    setActivePlotDocument,
    updatePlacement,
  } from '../lib/plot/documents';
  import {
    confirmSvgImport,
    documentNameFromSvgFileName,
    prepareSvgImport,
    readSvgFile,
    uniqueDocumentName,
  } from '../lib/plot/svgImport/importSvg';
  import type { SvgImportDraft } from '../lib/plot/svgImport/types';
  import { DEFAULT_PLACEMENT } from '../lib/plot/types';
  import DocumentsList from '../lib/prepare/components/DocumentsList.svelte';
  import ImportSvgModal from '../lib/prepare/components/ImportSvgModal.svelte';
  import RenameDocumentDialog from '../lib/prepare/components/RenameDocumentDialog.svelte';
  import {
    calculateWorkspaceGeometry,
    formatAxisRange,
    formatRectSize,
    isGeometryValid,
    machinePointToMediaPoint,
    validateWorkspaceGeometry,
    ZERO_INSETS,
    ZERO_MEDIA_PLACEMENT,
  } from '../lib/machines/workspaceGeometry';
  import { assessPlotGeometry } from '../lib/plot/plotValidation';
  import {
    centerInRect,
    fitAndCenterInRect,
    transformDocument,
  } from '../lib/plot/transform';
  import { type PlotRotation } from '../lib/plot/types';
  import PlotConfirmDialog from '../lib/prepare/components/PlotConfirmDialog.svelte';
  import PlotJobBar from '../lib/prepare/components/PlotJobBar.svelte';
  import WorkspacePreview from '../lib/prepare/components/WorkspacePreview.svelte';
  import { activeProfile } from '../lib/machines/stores/profiles';
  import { activeTab, prepareSection } from '../lib/stores/navigation';

  const DOCUMENT_DELETE_BLOCKED_REASON =
    'A plot job is using this document. Cancel or finish the job before deleting it.';

  /**
   * Prepare — place a PlotDocument (Generate capture or SVG import) in machine
   * coordinates and plot.
   *
   * Fit / Center / validation use the profile safe rectangle in machine space
   * (reachable media − additional insets − safe margin).
   */

  const sections: SidebarSection[] = [
    { id: 'documents', label: 'Documents', hint: 'Recent working copies' },
    { id: 'layers', label: 'Layers', hint: 'Later milestone' },
    { id: 'steps', label: 'Processing steps', hint: 'Later milestone' },
  ];

  const rotations: PlotRotation[] = [0, 90, 180, 270];

  let localError = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let importOpen = $state(false);
  let importDraft = $state<SvgImportDraft | null>(null);
  let importSourceText = $state<string | null>(null);
  let reportOnlyOpen = $state(false);
  let deleteTargetId = $state<string | null>(null);
  let clearAllOpen = $state(false);
  let renameTargetId = $state<string | null>(null);
  let focusReturnDocumentId = $state<string | null>(null);

  const deletionBlocked = $derived(jobBlocksDocumentDeletion($plotJob.phase));

  const documentCountLabel = $derived.by(() => {
    const count = $plotDocuments.length;
    const noun = count === 1 ? 'document' : 'documents';
    if (count === 0) return `0 recent documents · stored locally in this browser`;
    const estimate = formatPlotDocumentsStorageEstimate(
      estimatePlotDocumentsStorageBytes(),
    );
    return `${count} recent ${noun} · approximately ${estimate}`;
  });

  const deleteTarget = $derived(
    deleteTargetId
      ? ($plotDocuments.find((doc) => doc.id === deleteTargetId) ?? null)
      : null,
  );

  const renameTarget = $derived(
    renameTargetId
      ? ($plotDocuments.find((doc) => doc.id === renameTargetId) ?? null)
      : null,
  );

  function restoreDocumentMenuFocus() {
    const id = focusReturnDocumentId;
    focusReturnDocumentId = null;
    if (!id) return;
    queueMicrotask(() => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-document-menu="${id}"]`,
      );
      el?.focus();
    });
  }

  function requestRename(id: string) {
    focusReturnDocumentId = id;
    renameTargetId = id;
  }

  function confirmRename(name: string) {
    if (!renameTargetId) return;
    renamePlotDocument(renameTargetId, name);
    renameTargetId = null;
    restoreDocumentMenuFocus();
  }

  function cancelRename() {
    renameTargetId = null;
    restoreDocumentMenuFocus();
  }

  function requestDeleteDocument(id: string) {
    if (isDocumentLockedByPlotJob(id)) return;
    focusReturnDocumentId = id;
    deleteTargetId = id;
  }

  function confirmDeleteDocument() {
    if (!deleteTargetId) return;
    if (isDocumentLockedByPlotJob(deleteTargetId)) {
      deleteTargetId = null;
      restoreDocumentMenuFocus();
      return;
    }
    deletePlotDocument(deleteTargetId);
    deleteTargetId = null;
    focusReturnDocumentId = null;
  }

  function cancelDeleteDocument() {
    deleteTargetId = null;
    restoreDocumentMenuFocus();
  }

  function requestClearAll() {
    if (deletionBlocked || $plotDocuments.length === 0) return;
    focusReturnDocumentId = null;
    clearAllOpen = true;
  }

  function confirmClearAll() {
    if (deletionBlocked) {
      clearAllOpen = false;
      return;
    }
    clearAllPlotDocuments();
    clearAllOpen = false;
  }

  function cancelClearAll() {
    clearAllOpen = false;
  }

  const workspace = $derived($activeProfile.workspace);
  /** Guard stale in-memory profiles from before schema v3 / HMR. */
  const insets = $derived(workspace.nonDrawableInsets ?? ZERO_INSETS);
  const mediaPlacement = $derived(
    workspace.mediaPlacement ?? ZERO_MEDIA_PLACEMENT,
  );

  const geometry = $derived(
    calculateWorkspaceGeometry(
      workspace.widthMm,
      workspace.heightMm,
      insets,
      workspace.safeMarginMm,
      mediaPlacement,
    ),
  );

  const geometryOk = $derived(
    isGeometryValid(
      workspace.widthMm,
      workspace.heightMm,
      insets,
      workspace.safeMarginMm,
      mediaPlacement,
    ),
  );

  const transformed = $derived.by(() => {
    if (!$activePlotDocument) return null;
    return transformDocument($activePlotDocument, $plotPlacement);
  });

  const assessment = $derived.by(() => {
    if (!transformed || !geometryOk) return null;
    return assessPlotGeometry(
      transformed,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
  });

  const canPlot = $derived(
    !!$activePlotDocument &&
      !!transformed &&
      geometryOk &&
      !!assessment?.canPlot &&
      transformed.metrics.pathCount > 0 &&
      !$jobIsActive,
  );

  const penConfigured = $derived(
    $activeProfile.pen.upCommand.trim().length > 0 &&
      $activeProfile.pen.downCommand.trim().length > 0,
  );

  function goGenerate() {
    activeTab.goTo('generate');
  }

  function fitToSafeArea() {
    if (!$activePlotDocument || !geometryOk) return;
    updatePlacement(
      fitAndCenterInRect(
        $activePlotDocument,
        $plotPlacement,
        geometry.safePlotRect,
      ),
    );
  }

  function centerInSafeArea() {
    if (!$activePlotDocument || !geometryOk) return;
    updatePlacement(
      centerInRect($activePlotDocument, $plotPlacement, geometry.safePlotRect),
    );
  }

  function requestPlot() {
    localError = null;

    if (!$activePlotDocument || !transformed) {
      localError = 'Capture a drawing in Generate before plotting.';
      return;
    }
    if ($jobIsActive) {
      localError = 'A plot job is already running. Pause or cancel it first.';
      return;
    }
    if (!$isConnected) {
      localError =
        'Connect a machine in the Machines tab (or enable Demo mode) before plotting.';
      return;
    }
    if (!geometryOk) {
      const issues = validateWorkspaceGeometry(
        workspace.widthMm,
        workspace.heightMm,
        insets,
        workspace.safeMarginMm,
        mediaPlacement,
      );
      localError =
        issues[0]?.message ??
        'Machine workspace geometry is invalid. Fix it in Machines → Workspace.';
      return;
    }
    const gate = assessPlotGeometry(
      transformed,
      geometry.drawableRect,
      geometry.safePlotRect,
    );
    if (!gate.canPlot) {
      localError = [gate.headline, gate.detail].filter(Boolean).join('\n');
      return;
    }
    if (transformed.metrics.pathCount === 0) {
      localError = 'This document has no plottable paths.';
      return;
    }

    try {
      prepareJob(transformed, $activeProfile, $activePlotDocument.name, {
        dryRun: !penConfigured,
        feedRateMmPerMin: $activeProfile.motion.jogFeedRateMmPerMin,
        documentId: $activePlotDocument.id,
      });
    } catch (error) {
      localError =
        error instanceof Error
          ? error.message
          : 'G-code generation failed unexpectedly.';
    }
  }

  async function confirmStart() {
    await startPreparedJob();
  }

  function openImportPicker() {
    prepareSection.set('documents');
    localError = null;
    fileInput?.click();
  }

  async function onSvgFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const read = await readSvgFile(file);
    if (!read.ok) {
      localError = read.error;
      return;
    }

    importSourceText = read.text;
    importDraft = prepareSvgImport(read.text, { fileName: read.fileName });
    importOpen = true;
    reportOnlyOpen = false;
  }

  function cancelImport() {
    importOpen = false;
    importDraft = null;
    importSourceText = null;
    reportOnlyOpen = false;
  }

  function reparseWithPhysicalSize(widthMm: number, heightMm: number) {
    if (!importSourceText || !importDraft) return;
    importDraft = prepareSvgImport(importSourceText, {
      fileName: importDraft.fileName,
      physicalWidthMm: widthMm,
      physicalHeightMm: heightMm,
    });
  }

  function confirmImport() {
    if (reportOnlyOpen) {
      cancelImport();
      return;
    }
    if (!importDraft || importDraft.status === 'cannot-import') return;
    const base = documentNameFromSvgFileName(importDraft.fileName);
    const name = uniqueDocumentName(
      base,
      $plotDocuments.map((doc) => doc.name),
    );
    const document = confirmSvgImport(importDraft, name);
    if (!document) {
      localError = 'Could not create a plot document from the SVG.';
      cancelImport();
      return;
    }
    // Preserve source physical size at Prepare scale 1; do not auto-fit.
    updatePlacement({ ...DEFAULT_PLACEMENT });
    setActivePlotDocument(document);
    prepareSection.set('documents');
    cancelImport();
  }

  function viewStoredImportReport() {
    if (!$activePlotDocument?.svgImport || !$activePlotDocument.rawSvg) return;
    importDraft = {
      status:
        $activePlotDocument.svgImport.warnings.some(
          (w) =>
            w.level === 'warning' ||
            w.level === 'unsupported' ||
            w.level === 'security',
        )
          ? 'ready-with-warnings'
          : 'ready',
      fileName: $activePlotDocument.svgImport.originalFileName,
      sanitizedSvg: $activePlotDocument.rawSvg,
      sourceHash: $activePlotDocument.svgImport.sourceHash,
      metadata: $activePlotDocument.svgImport,
      paths: $activePlotDocument.paths,
      widthMm: $activePlotDocument.widthMm,
      heightMm: $activePlotDocument.heightMm,
      needsPhysicalSize: false,
    };
    reportOnlyOpen = true;
    importOpen = true;
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".svg,image/svg+xml"
  class="visually-hidden"
  aria-hidden="true"
  tabindex="-1"
  onchange={(event) => void onSvgFileSelected(event)}
/>

<Sidebar
  title="Prepare"
  {sections}
  active={$prepareSection}
  onSelect={(id) => prepareSection.set(id)}
>
  {#snippet top()}
    <p class="section-label">Recent prepared documents</p>
    <button type="button" class="btn btn--primary sidebar-action" onclick={openImportPicker}>
      Import SVG
    </button>
    <DocumentsList
      documents={$plotDocuments}
      activeId={$activePlotDocument?.id ?? null}
      documentCountLabel={documentCountLabel}
      clearAllDisabled={deletionBlocked || $plotDocuments.length === 0}
      deleteDisabledReason={DOCUMENT_DELETE_BLOCKED_REASON}
      isDeleteDisabled={(id) => isDocumentLockedByPlotJob(id)}
      onSelect={(id) => {
        prepareSection.set('documents');
        selectPlotDocument(id);
      }}
      onRename={requestRename}
      onDelete={requestDeleteDocument}
      onClearAll={requestClearAll}
    />
  {/snippet}

  {#snippet bottom()}
    <p class="section-label">Workspace</p>
    <p class="target mono">
      Media · {workspace.widthMm} × {workspace.heightMm} mm
    </p>
    <p class="target target--muted mono">
      Safe (machine) · {formatAxisRange(
        geometry.safePlotRect.x,
        geometry.safePlotRect.x + geometry.safePlotRect.width,
      )}
    </p>
    <p class="target target--muted mono">Profile · {$activeProfile.name}</p>
  {/snippet}
</Sidebar>

<MainSection
  title="Prepare for plotting"
  description="Scale and place the captured drawing inside the machine’s safe plotting area, then send it to the plotter."
>
  {#snippet actions()}
    <button type="button" class="btn" onclick={goGenerate}>Back to Generate</button>
    <button
      type="button"
      class="btn btn--go"
      disabled={!canPlot || !$isConnected}
      title={!canPlot
        ? (assessment?.headline ?? 'Drawing must fit the safe plotting area')
        : 'Confirm and plot'}
      onclick={requestPlot}
    >
      Plot
    </button>
  {/snippet}

  <PlotJobBar />

  {#if $prepareSection === 'layers' || $prepareSection === 'steps'}
    <div class="panel panel--soft">
      <h2>{$prepareSection === 'layers' ? 'Layers' : 'Processing steps'}</h2>
      <p class="muted">
        This area is reserved for a later milestone. Path grouping, reordering,
        hatching, and centerline tools are not available yet.
      </p>
    </div>
  {:else if !$activePlotDocument}
    <EmptyState
      title="No prepared documents"
      description="Capture a p5.js sketch in Generate or import an SVG to prepare it for plotting."
      seed={11}
    >
      <button type="button" class="btn" onclick={goGenerate}>
        Back to Generate
      </button>
      <button type="button" class="btn btn--primary" onclick={openImportPicker}>
        Import SVG
      </button>
    </EmptyState>
  {:else}
    <div class="prepare">
      <div class="prepare__preview">
        <WorkspacePreview
          plot={transformed}
          pageWidthMm={workspace.widthMm}
          pageHeightMm={workspace.heightMm}
          nonDrawableInsets={insets}
          mediaPlacement={mediaPlacement}
          safeMarginMm={workspace.safeMarginMm}
          showPenUpTravel={$plotPlacement.showPenUpTravel}
        />
      </div>

      <aside class="controls" aria-label="Preparation controls">
        {#if $activePlotDocument.source === 'svg-import' && $activePlotDocument.svgImport}
          <div class="controls__group metrics">
            <p class="section-label">Source</p>
            <p><span>SVG import</span><span class="mono">{$activePlotDocument.svgImport.originalFileName}</span></p>
            <p>
              <span>Original size</span>
              <span class="mono">
                {Number.parseFloat($activePlotDocument.widthMm.toFixed(1))} ×
                {Number.parseFloat($activePlotDocument.heightMm.toFixed(1))} mm
              </span>
            </p>
            <p>
              <span>Detected units</span>
              <span class="mono">{$activePlotDocument.svgImport.detectedUnits}</span>
            </p>
            <p>
              <span>Import</span>
              <span class="mono">
                {$activePlotDocument.svgImport.acceptedGeometryCount} paths ·
                {$activePlotDocument.svgImport.warnings.some(
                  (w) => w.level !== 'info',
                )
                  ? 'warnings'
                  : 'ready'}
              </span>
            </p>
            <button type="button" class="btn btn--small" onclick={viewStoredImportReport}>
              View import report
            </button>
          </div>
        {/if}

        <div class="controls__group">
          <p class="section-label">Transform</p>

          <div class="field">
            <label class="field__label" for="prepare-scale">Uniform scale</label>
            <input
              id="prepare-scale"
              type="number"
              min="0.01"
              max="20"
              step="0.01"
              value={$plotPlacement.scale}
              oninput={(event) => {
                const next = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(next) && next > 0) updatePlacement({ scale: next });
              }}
            />
          </div>

          <div class="field">
            <label class="field__label" for="prepare-x">Position X (machine mm)</label>
            <input
              id="prepare-x"
              type="number"
              step="0.1"
              value={$plotPlacement.offsetXMm}
              oninput={(event) => {
                const next = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(next)) updatePlacement({ offsetXMm: next });
              }}
            />
          </div>

          <div class="field">
            <label class="field__label" for="prepare-y">Position Y (machine mm)</label>
            <input
              id="prepare-y"
              type="number"
              step="0.1"
              value={$plotPlacement.offsetYMm}
              oninput={(event) => {
                const next = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(next)) updatePlacement({ offsetYMm: next });
              }}
            />
          </div>

          <div class="field">
            <label class="field__label" for="prepare-rotation">Rotation</label>
            <select
              id="prepare-rotation"
              value={String($plotPlacement.rotation)}
              onchange={(event) => {
                const next = Number.parseInt(
                  (event.currentTarget as HTMLSelectElement).value,
                  10,
                ) as PlotRotation;
                updatePlacement({ rotation: next });
              }}
            >
              {#each rotations as angle (angle)}
                <option value={String(angle)}>{angle}°</option>
              {/each}
            </select>
          </div>

          <p class="help-text">
            Positions are machine coordinates (same as Manual Control / G-code).
            Media placement and safe margin come from Machines → Workspace.
          </p>

          <div class="btn-row">
            <button
              type="button"
              class="btn btn--small"
              disabled={!geometryOk}
              onclick={fitToSafeArea}
            >
              Fit to safe area
            </button>
            <button
              type="button"
              class="btn btn--small"
              disabled={!geometryOk}
              onclick={centerInSafeArea}
            >
              Center in safe area
            </button>
          </div>
        </div>

        <div class="controls__group">
          <p class="section-label">Preview</p>
          <label class="checkbox" for="prepare-travel">
            <input
              id="prepare-travel"
              type="checkbox"
              checked={$plotPlacement.showPenUpTravel}
              onchange={(event) =>
                updatePlacement({
                  showPenUpTravel: (event.currentTarget as HTMLInputElement).checked,
                })}
            />
            <span>Show pen-up travel</span>
          </label>
        </div>

        <div class="controls__group metrics">
          <p class="section-label">Machine coordinates</p>
          <p>
            <span>Safe machine area</span>
            <span class="mono">
              X {formatAxisRange(
                geometry.safePlotRect.x,
                geometry.safePlotRect.x + geometry.safePlotRect.width,
              )}
            </span>
          </p>
          <p>
            <span></span>
            <span class="mono">
              Y {formatAxisRange(
                geometry.safePlotRect.y,
                geometry.safePlotRect.y + geometry.safePlotRect.height,
              )}
            </span>
          </p>
          <p>
            <span>Reachable</span>
            <span class="mono">{formatRectSize(geometry.reachableRect)}</span>
          </p>
          {#if transformed && assessment}
            <p><span>Paths</span><span class="mono">{transformed.metrics.pathCount}</span></p>
            <p>
              <span>Pen-down</span>
              <span class="mono">{transformed.metrics.penDownLengthMm.toFixed(1)} mm</span>
            </p>
            <p>
              <span>Document bounds</span>
              <span class="mono">
                X {formatAxisRange(transformed.bounds.minX, transformed.bounds.maxX)}
              </span>
            </p>
            <p>
              <span></span>
              <span class="mono">
                Y {formatAxisRange(transformed.bounds.minY, transformed.bounds.maxY)}
              </span>
            </p>
            <p class="section-label">Position on media</p>
            <p>
              <span>Paper X</span>
              <span class="mono">
                {formatAxisRange(
                  machinePointToMediaPoint(
                    { x: transformed.bounds.minX, y: 0 },
                    mediaPlacement,
                  ).x,
                  machinePointToMediaPoint(
                    { x: transformed.bounds.maxX, y: 0 },
                    mediaPlacement,
                  ).x,
                )}
              </span>
            </p>
            <p>
              <span>Paper Y</span>
              <span class="mono">
                {formatAxisRange(
                  machinePointToMediaPoint(
                    { x: 0, y: transformed.bounds.minY },
                    mediaPlacement,
                  ).y,
                  machinePointToMediaPoint(
                    { x: 0, y: transformed.bounds.maxY },
                    mediaPlacement,
                  ).y,
                )}
              </span>
            </p>
            <p>
              <span>Fits drawable area</span>
              <span class="mono" class:bad={!assessment.fitsDrawable}>
                {assessment.fitsDrawable ? 'Yes' : 'No'}
              </span>
            </p>
            <p>
              <span>Fits safe area</span>
              <span class="mono" class:bad={!assessment.fitsSafe}>
                {assessment.fitsSafe ? 'Yes' : 'No'}
              </span>
            </p>
          {/if}
        </div>

        {#if assessment?.headline}
          <div class="error" role="alert">
            <strong>{assessment.headline}</strong>
            {#if assessment.detail}
              <pre class="error__detail">{assessment.detail}</pre>
            {/if}
          </div>
        {:else if !geometryOk}
          <p class="error" role="alert">
            Machine workspace geometry is invalid. Fix insets or safe margin in
            Machines → Workspace.
          </p>
        {/if}

        {#if localError}
          <pre class="error" role="alert">{localError}</pre>
        {/if}

        <p class="help-text">
          Plotting uses the active machine profile and streams through the existing
          GRBL queue. Confirm before anything moves.
        </p>
      </aside>
    </div>
  {/if}
</MainSection>

<PlotConfirmDialog
  open={$plotJob.phase === 'confirming'}
  summary={$plotJob.summary}
  onCancel={dismissJobConfirmation}
  onStart={() => void confirmStart()}
/>

<ImportSvgModal
  open={importOpen}
  draft={importDraft}
  reportOnly={reportOnlyOpen}
  onCancel={cancelImport}
  onConfirm={confirmImport}
  onPhysicalSizeChange={reparseWithPhysicalSize}
/>

<RenameDocumentDialog
  open={renameTarget !== null}
  name={renameTarget?.name ?? ''}
  onConfirm={confirmRename}
  onCancel={cancelRename}
/>

<ConfirmDialog
  open={deleteTarget !== null}
  title={deleteTarget ? `Delete “${deleteTarget.name}”?` : 'Delete document'}
  message="This removes the prepared document and its locally stored geometry."
  detail="The original p5 sketch or SVG file on your computer will not be deleted."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  tone="caution"
  showSafety={false}
  onConfirm={confirmDeleteDocument}
  onCancel={cancelDeleteDocument}
/>

<ConfirmDialog
  open={clearAllOpen}
  title="Clear all prepared documents?"
  message={`This will remove ${$plotDocuments.length} locally stored document${$plotDocuments.length === 1 ? '' : 's'} and their prepared geometry.`}
  detail="Your p5 sketches and original SVG files will not be deleted."
  confirmLabel="Clear all"
  cancelLabel="Cancel"
  tone="caution"
  showSafety={false}
  onConfirm={confirmClearAll}
  onCancel={cancelClearAll}
/>

{#if localError && !$activePlotDocument}
  <p class="visually-hidden" role="alert">{localError}</p>
{/if}

<style>
  .prepare {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: var(--space-4);
    flex: 1 1 auto;
    min-height: 0;
  }

  .prepare__preview {
    min-width: 0;
    min-height: 0;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--color-surface-soft);
    padding: var(--space-3);
    overflow-y: auto;
  }

  .controls__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .controls select,
  .controls input[type='number'] {
    width: 100%;
    font-family: var(--font-mono);
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-1) var(--space-2);
    background: var(--color-white);
  }

  .metrics p {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin: 0;
    font-size: 13px;
  }

  .bad {
    color: var(--color-warning);
    font-weight: 700;
  }

  .error {
    margin: 0;
    color: var(--color-warning);
    font-size: 13px;
    white-space: pre-wrap;
    font-family: var(--font-mono);
  }

  .error__detail {
    margin: var(--space-1) 0 0;
    font: inherit;
    white-space: pre-wrap;
  }

  .sidebar-action {
    width: 100%;
    margin-bottom: var(--space-2);
  }

  .target {
    margin: var(--space-1) 0 0;
    font-size: 12px;
  }

  .target--muted {
    color: var(--color-text-muted);
  }

  @media (max-width: 960px) {
    .prepare {
      grid-template-columns: 1fr;
    }
  }
</style>

<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import ConfirmDialog from '../lib/components/ConfirmDialog.svelte';
  import MainSection from '../lib/components/MainSection.svelte';
  import CodeEditor from '../lib/generate/components/CodeEditor.svelte';
  import ExampleGallery from '../lib/generate/components/ExampleGallery.svelte';
  import GenerateNav from '../lib/generate/components/GenerateNav.svelte';
  import ImportSketchModal from '../lib/generate/components/ImportSketchModal.svelte';
  import LocalStorageInfoModal from '../lib/generate/components/LocalStorageInfoModal.svelte';
  import PhysicalOutputModal from '../lib/generate/components/PhysicalOutputModal.svelte';
  import PreviewPanel, {
    type PreviewStatus,
  } from '../lib/generate/components/PreviewPanel.svelte';
  import {
    createRunSnapshot,
    ownershipMatches,
    type PreviewOwnership,
    type RunSnapshot,
    type RuntimeCanvasInfo,
  } from '../lib/generate/runSnapshot';
  import type { RunnerError, SketchRunner } from '../lib/p5/runner';
  import { setActivePlotDocument } from '../lib/plot/documents';
  import { analyzeSketchSource, sourceParses } from '../lib/sketches/import/analyzeSketch';
  import { readJsSketchFile } from '../lib/sketches/import/readJsFile';
  import type { SketchCompatibilityReport } from '../lib/sketches/import/types';
  import { captureSvgToPlotDocument } from '../lib/sketches/capturePlot';
  import {
    formatAspectRatio,
    formatOutputMetaRow,
    type CanvasSizeUnits,
  } from '../lib/sketches/outputDisplay';
  import { defaultOutputSettings } from '../lib/sketches/outputSettings';
  import { hashSource } from '../lib/sketches/sourceHash';
  import {
    downloadAllSketchesZip,
    downloadSketchJs,
  } from '../lib/sketches/exportSketches';
  import {
    deleteSketch,
    duplicateSketch,
    importSketch,
    renameSketch,
    restoreOriginalExample,
    selectSketch,
    sketches,
    activeSketch,
    createSketch,
    updateSketchOutput,
    updateSketchSource,
    useExample,
  } from '../lib/sketches/store';
  import { preferences, updatePreferences } from '../lib/stores/preferences';
  import { activeTab, generateSection } from '../lib/stores/navigation';

  /**
   * Generate tab — one sidebar navigator, editor + preview workspace.
   *
   * Source of truth: selected sketch → CodeMirror → Run snapshots CodeMirror.
   * Trusted built-in examples may auto-run after Use example.
   * Ordinary user sketches never execute until explicit Run.
   */

  let draftSource = $state('');
  let draftName = $state('');
  let renaming = $state(false);
  let focusTitlePending = $state(false);
  let sketchError = $state<RunnerError | null>(null);
  let previewStatus = $state<PreviewStatus>('idle');
  let statusMessage = $state<string | null>(null);
  let statusTone = $state<'ok' | 'warn' | 'error'>('ok');
  let capturing = $state(false);
  let running = $state(false);
  let runner: SketchRunner | null = null;
  let search = $state('');
  let lastPreview = $state<PreviewOwnership | null>(null);
  let saveState = $state<'saved' | 'saving' | 'modified'>('saved');
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: { sketchId: string; source: string } | null = null;
  let deleteTargetId = $state<string | null>(null);
  let localStorageInfoOpen = $state(false);
  let exportStatus = $state<string | null>(null);
  let exportStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let restoreConfirmOpen = $state(false);
  let titleInput = $state<HTMLInputElement | null>(null);
  let loadedSketchId = $state<string | null>(null);
  let activeRun = $state<RunSnapshot | null>(null);
  /** Bumps when the editor must replace its document for a sketch. */
  let editorSyncKey = $state('');
  let runtimeCanvas = $state<RuntimeCanvasInfo | null>(null);
  let runtimeCanvasForHash = $state<string | null>(null);
  let plotCaptureLevel = $state<'compatible' | 'warning' | 'unsupported' | 'unknown'>(
    'unknown',
  );
  let importOpen = $state(false);
  let importFileName = $state('');
  let importSource = $state('');
  let importReport = $state<SketchCompatibilityReport | null>(null);
  let importError = $state<string | null>(null);
  let outputModalOpen = $state(false);
  let partialCaptureConfirmOpen = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  let splitRatio = $state($preferences.generateEditorRatio);
  let dragging = $state(false);
  let splitEl = $state<HTMLDivElement | null>(null);

  const browsingExamples = $derived($generateSection === 'examples');
  const deleteTarget = $derived(
    $sketches.find((sketch) => sketch.id === deleteTargetId) ?? null,
  );
  const dirtySketchIds = $derived.by(() => {
    if (saveState === 'saved' || !$activeSketch) return new Set<string>();
    return new Set([$activeSketch.id]);
  });

  const parseState = $derived(sourceParses(draftSource));
  const staticReport = $derived(
    draftSource.trim() ? analyzeSketchSource(draftSource) : null,
  );

  const canvasUnits = $derived.by((): CanvasSizeUnits | null => {
    const hash = hashSource(draftSource);
    if (
      runtimeCanvas &&
      runtimeCanvasForHash === hash &&
      runtimeCanvas.widthUnits > 0 &&
      runtimeCanvas.heightUnits > 0
    ) {
      return {
        widthUnits: runtimeCanvas.widthUnits,
        heightUnits: runtimeCanvas.heightUnits,
        source: 'runtime',
      };
    }
    const canvas = staticReport?.canvas;
    if (
      canvas?.detection === 'static' &&
      canvas.widthUnits != null &&
      canvas.heightUnits != null
    ) {
      return {
        widthUnits: canvas.widthUnits,
        heightUnits: canvas.heightUnits,
        source: 'static',
      };
    }
    return null;
  });

  const activeOutput = $derived(
    $activeSketch?.output ?? defaultOutputSettings(),
  );

  const metaRowText = $derived(
    formatOutputMetaRow(canvasUnits, activeOutput),
  );

  const isWebgl = $derived(
    runtimeCanvas?.renderer === 'webgl' ||
      staticReport?.canvas?.renderer === 'webgl',
  );

  const captureReady = $derived(
    !!$activeSketch &&
      !capturing &&
      !running &&
      parseState.ok &&
      !isWebgl &&
      ownershipMatches(lastPreview, $activeSketch.id, draftSource),
  );

  const captureDisabledReason = $derived.by(() => {
    if (!$activeSketch) return 'Select a sketch first.';
    if (!parseState.ok) {
      const loc =
        parseState.error?.line != null
          ? ` (line ${parseState.error.line}${parseState.error.column != null ? `, column ${parseState.error.column}` : ''})`
          : '';
      return `Fix the syntax error${loc} before running or capturing.`;
    }
    if (isWebgl) {
      return 'p5.plotSvg does not currently support WEBGL capture in this workspace.';
    }
    if (running) return 'Wait for the current run to finish.';
    if (previewStatus === 'idle') return 'Run the sketch successfully before capturing.';
    if (previewStatus === 'error' || previewStatus === 'timeout') {
      return 'Fix the sketch error and Run again before capturing.';
    }
    if (previewStatus === 'stale' || !ownershipMatches(lastPreview, $activeSketch.id, draftSource)) {
      return 'Source changed since the last successful run. Run again before capturing.';
    }
    if (previewStatus !== 'success') return 'Run the sketch successfully before capturing.';
    return null;
  });

  const statusChip = $derived.by(() => {
    if (running || previewStatus === 'running') return 'Running';
    if (previewStatus === 'error') return 'Run failed';
    if (previewStatus === 'timeout') return 'Run timed out';
    if (previewStatus === 'cancelled') return 'Run cancelled';
    if (previewStatus === 'stale') return 'Changed since last run';
    if (previewStatus === 'success') return 'Run successful';
    if (previewStatus === 'idle') return 'Not run';
    if (saveState === 'saving') return 'Saving';
    if (saveState === 'modified') return 'Modified';
    return 'Saved';
  });

  function logSelect(detail: Record<string, unknown>) {
    if (import.meta.env.DEV) console.info('[generate:select]', detail);
  }

  function logRun(detail: Record<string, unknown>) {
    if (import.meta.env.DEV) console.info('[generate:run]', detail);
  }

  function flushPendingSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!pendingSave) return;
    const { sketchId, source } = pendingSave;
    pendingSave = null;
    updateSketchSource(sketchId, source);
    if ($activeSketch?.id === sketchId) saveState = 'saved';
  }

  function cancelActiveRun(reason = 'Switched sketches.') {
    const snapshot = activeRun;
    if (snapshot) {
      logRun({ action: 'cancel', run: snapshot.runId, reason });
    }
    runner?.cancel(reason);
    activeRun = null;
    running = false;
  }

  /**
   * Controlled sketch selection transaction:
   * flush edits → cancel run → update id → replace editor → reset preview ownership UI.
   */
  function applySketchSelection(sketchId: string, source: string, name: string) {
    flushPendingSave();
    cancelActiveRun('Switched sketches.');
    loadedSketchId = sketchId;
    draftSource = source;
    draftName = name;
    editorSyncKey = `${sketchId}:${hashSource(source)}`;
    saveState = 'saved';
    sketchError = null;
    statusMessage = null;
    runtimeCanvas = null;
    runtimeCanvasForHash = null;
    plotCaptureLevel = analyzeSketchSource(source).plotCapture;
    // Selecting an ordinary sketch never auto-executes.
    // Clear the previous sketch's preview; never reuse another sketch's canvas.
    // Imported sketches never run on application startup or selection.
    runner?.stop();
    previewStatus = 'idle';
    logSelect({
      sketch: sketchId,
      sourceHash: hashSource(source),
      editorSyncKey,
      preview: previewStatus,
    });
  }

  $effect(() => {
    const sketch = $activeSketch;
    if (!sketch) {
      flushPendingSave();
      cancelActiveRun('No sketch selected.');
      loadedSketchId = null;
      draftSource = '';
      draftName = '';
      editorSyncKey = '';
      previewStatus = 'idle';
      return;
    }
    if (loadedSketchId === sketch.id) return;
    applySketchSelection(sketch.id, sketch.source, sketch.name);
  });

  $effect(() => {
    if (renaming && focusTitlePending && titleInput) {
      titleInput.focus();
      titleInput.select();
      focusTitlePending = false;
    }
  });

  function persistSource(next: string) {
    draftSource = next;
    const sketchId = $activeSketch?.id;
    if (!sketchId) return;
    // Capture sketch id with the edit — never save into a later selection.
    pendingSave = { sketchId, source: next };
    saveState = 'modified';
    if (
      lastPreview &&
      lastPreview.sketchId === sketchId &&
      lastPreview.sourceHash !== hashSource(next) &&
      (previewStatus === 'success' || previewStatus === 'stale')
    ) {
      previewStatus = 'stale';
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveState = 'saving';
    saveTimer = setTimeout(() => {
      const pending = pendingSave;
      if (!pending) return;
      pendingSave = null;
      saveTimer = null;
      updateSketchSource(pending.sketchId, pending.source);
      if ($activeSketch?.id === pending.sketchId) saveState = 'saved';
    }, 350);
  }

  async function runSketch() {
    if (!$activeSketch || running || !runner) return;
    if (!sourceParses(draftSource).ok) {
      const err = sourceParses(draftSource).error;
      sketchError = {
        message: err?.message ?? 'Syntax error',
        line: err?.line,
        column: err?.column,
        phase: 'loading',
      };
      previewStatus = 'error';
      statusMessage = 'Fix the syntax error before running.';
      statusTone = 'error';
      return;
    }
    flushPendingSave();

    const sketchId = $activeSketch.id;
    // Snapshot CodeMirror-backed draft at click time — never re-read later.
    const source = draftSource;
    const snapshot = createRunSnapshot({
      sketchId,
      source,
      runtimeId: runner.runtimeId,
    });

    activeRun = snapshot;
    running = true;
    sketchError = null;
    statusMessage = null;
    previewStatus = 'running';

    logRun({
      run: snapshot.runId,
      sketch: snapshot.sketchId,
      sourceHash: snapshot.sourceHash,
      runtime: snapshot.runtimeId,
    });

    try {
      const outcome = await runner.run(snapshot);
      // Superseded runs must already be settled; ignore their UI updates.
      if (activeRun?.runId !== snapshot.runId) {
        logRun({ action: 'ignore-stale-outcome', run: snapshot.runId, state: outcome.state });
        return;
      }

      if (outcome.state === 'success') {
        lastPreview = {
          sketchId: snapshot.sketchId,
          sourceHash: snapshot.sourceHash,
          renderedAt: Date.now(),
        };
        previewStatus = 'success';
        sketchError = null;
        if (outcome.canvas) {
          runtimeCanvas = outcome.canvas;
          runtimeCanvasForHash = snapshot.sourceHash;
          if (outcome.canvas.renderer === 'webgl') {
            plotCaptureLevel = 'unsupported';
          } else if (staticReport?.plotCapture === 'warning') {
            plotCaptureLevel = 'warning';
          } else {
            plotCaptureLevel = 'compatible';
          }
        } else {
          plotCaptureLevel = staticReport?.plotCapture ?? 'unknown';
        }
        if (staticReport?.externalAssets.length) {
          statusMessage =
            'This sketch references assets that were not included in the imported .js file.';
          statusTone = 'warn';
        }
        return;
      }

      if (outcome.state === 'timeout') {
        previewStatus = 'timeout';
        sketchError = {
          message:
            'Preview timed out. The sketch runtime did not respond. You can run it again.',
          phase: 'runtime',
        };
        statusMessage = 'Preview timed out. You can run it again.';
        statusTone = 'warn';
        return;
      }

      if (outcome.state === 'cancelled') {
        previewStatus = 'cancelled';
        return;
      }

      previewStatus = 'error';
      sketchError = {
        message: outcome.error ?? 'Failed to run sketch.',
        phase: 'runtime',
      };
    } finally {
      if (activeRun?.runId === snapshot.runId) {
        activeRun = null;
        running = false;
      }
    }
  }

  function resetSketch() {
    if (!$activeSketch) return;
    flushPendingSave();
    cancelActiveRun('Reset.');
    // Reset restores the last saved user source — not the built-in template.
    draftSource = $activeSketch.source;
    editorSyncKey = `${$activeSketch.id}:${hashSource($activeSketch.source)}:reset`;
    sketchError = null;
    statusMessage = 'Restored the last saved source.';
    statusTone = 'ok';
    saveState = 'saved';
    previewStatus = 'idle';
    lastPreview = null;
  }

  function requestRestoreExample() {
    if (!$activeSketch?.exampleId) return;
    restoreConfirmOpen = true;
  }

  function confirmRestoreExample() {
    if (!$activeSketch) return;
    const id = $activeSketch.id;
    flushPendingSave();
    cancelActiveRun('Restore example.');
    if (!restoreOriginalExample(id)) {
      restoreConfirmOpen = false;
      return;
    }
    const restored = get(sketches).find((sketch) => sketch.id === id);
    if (restored) {
      applySketchSelection(restored.id, restored.source, restored.name);
    }
    restoreConfirmOpen = false;
    statusMessage = 'Restored the original example source.';
    statusTone = 'ok';
    lastPreview = null;
  }

  function requestCapture() {
    if (!$activeSketch || !captureReady) return;
    if (plotCaptureLevel === 'warning' || staticReport?.plotCapture === 'warning') {
      partialCaptureConfirmOpen = true;
      return;
    }
    void captureSvg();
  }

  async function captureSvg() {
    if (!$activeSketch || !captureReady || !runner) return;
    partialCaptureConfirmOpen = false;
    capturing = true;
    statusMessage = null;
    try {
      const capture = await runner.capture(draftSource);
      if (!capture.ok || !capture.svg) {
        statusMessage = capture.error ?? 'Capture failed.';
        statusTone = 'error';
        return;
      }

      const width =
        canvasUnits?.widthUnits ??
        runtimeCanvas?.widthUnits ??
        staticReport?.canvas?.widthUnits;
      const height =
        canvasUnits?.heightUnits ??
        runtimeCanvas?.heightUnits ??
        staticReport?.canvas?.heightUnits;
      if (width == null || height == null || width <= 0 || height <= 0) {
        statusMessage = 'Canvas size is unknown. Run the sketch successfully before capturing.';
        statusTone = 'error';
        return;
      }

      const parsed = captureSvgToPlotDocument({
        svg: capture.svg,
        name: $activeSketch.name,
        sketchId: $activeSketch.id,
        source: draftSource,
        canvasWidthUnits: width,
        canvasHeightUnits: height,
        output: activeOutput,
      });
      if (!parsed.ok || !parsed.document) {
        statusMessage = parsed.error ?? 'Could not convert the SVG into a plot document.';
        statusTone = 'error';
        return;
      }

      setActivePlotDocument(parsed.document);
      const warningText =
        [...(capture.warnings ?? []), ...(parsed.warnings ?? [])].join(' ') || null;
      statusMessage = warningText
        ? `Captured ${parsed.document.paths.length} paths. ${warningText}`
        : `Captured ${parsed.document.paths.length} paths (${Number.parseFloat(parsed.document.widthMm.toFixed(1))} × ${Number.parseFloat(parsed.document.heightMm.toFixed(1))} mm). Opening Prepare…`;
      statusTone = warningText ? 'warn' : 'ok';
      activeTab.goTo('prepare');
    } finally {
      capturing = false;
    }
  }

  function commitRename() {
    if (!$activeSketch) return;
    renameSketch($activeSketch.id, draftName);
    renaming = false;
  }

  function cancelRename() {
    draftName = $activeSketch?.name ?? '';
    renaming = false;
  }

  async function handleBlankSketch() {
    generateSection.set('sketches');
    flushPendingSave();
    cancelActiveRun('New sketch.');
    createSketch();
    renaming = true;
    focusTitlePending = true;
    await tick();
    lastPreview = null;
  }

  function handleImportSketch() {
    importError = null;
    fileInput?.click();
  }

  async function onImportFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const result = await readJsSketchFile(file);
    if (!result.ok) {
      importError = result.error;
      statusMessage = result.error;
      statusTone = 'error';
      return;
    }

    // Never execute imported code at file-selection time.
    importFileName = result.fileName;
    importSource = result.source;
    importReport = result.report;
    importOpen = true;
  }

  function cancelImport() {
    importOpen = false;
    importFileName = '';
    importSource = '';
    importReport = null;
  }

  async function confirmImport() {
    if (!importSource || !importFileName) return;
    generateSection.set('sketches');
    flushPendingSave();
    cancelActiveRun('Import sketch.');
    const sketch = importSketch({
      fileName: importFileName,
      source: importSource,
    });
    cancelImport();
    applySketchSelection(sketch.id, sketch.source, sketch.name);
    lastPreview = null;
    // Imported code never runs automatically — user must click Run.
    statusMessage = `Imported “${sketch.name}”. Review the source, then click Run.`;
    statusTone = 'ok';
    await tick();
  }

  function handleSelectSketch(id: string) {
    generateSection.set('sketches');
    if ($activeSketch?.id === id) return;
    // Flush + cancel happen in applySketchSelection via the activeSketch effect,
    // but flush immediately so the previous id cannot receive a late save.
    flushPendingSave();
    cancelActiveRun('Switched sketches.');
    selectSketch(id);
  }

  async function handleUseExample(exampleId: string) {
    flushPendingSave();
    cancelActiveRun('Use example.');
    const sketch = useExample(exampleId);
    if (!sketch) return;
    generateSection.set('sketches');
    applySketchSelection(sketch.id, sketch.source, sketch.name);
    lastPreview = null;
    // Trusted built-in content may auto-run after Use example.
    await tick();
    await runSketch();
  }

  function handleRenameFromMenu(id: string) {
    handleSelectSketch(id);
    renaming = true;
    focusTitlePending = true;
  }

  function requestDelete(id: string) {
    deleteTargetId = id;
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    if (deleteTargetId === $activeSketch?.id) {
      flushPendingSave();
      cancelActiveRun('Deleted sketch.');
    }
    deleteSketch(deleteTargetId);
    deleteTargetId = null;
  }

  function setExportStatus(message: string | null) {
    if (exportStatusTimer) {
      clearTimeout(exportStatusTimer);
      exportStatusTimer = null;
    }
    exportStatus = message;
    if (message) {
      exportStatusTimer = setTimeout(() => {
        exportStatus = null;
        exportStatusTimer = null;
      }, 4000);
    }
  }

  function handleDownloadSketch(id: string) {
    const sketch = $sketches.find((entry) => entry.id === id);
    if (!sketch) {
      setExportStatus('Could not download sketch.');
      return;
    }
    // Flush pending editor edits for the active sketch before download.
    if (sketch.id === $activeSketch?.id) {
      flushPendingSave();
    }
    const current =
      sketch.id === $activeSketch?.id
        ? { ...sketch, source: draftSource, name: draftName || sketch.name }
        : sketch;
    try {
      const { filename } = downloadSketchJs(current);
      setExportStatus(`Downloaded ${filename}`);
    } catch (error) {
      setExportStatus(
        error instanceof Error ? error.message : 'Could not download sketch.',
      );
    }
  }

  function handleExportAllSketches() {
    // Ensure the active draft is included if it has unsaved edits.
    flushPendingSave();
    const result = downloadAllSketchesZip(get(sketches));
    if (!result.ok) {
      setExportStatus(result.error);
      return;
    }
    setExportStatus(
      `Downloaded ${result.count} sketch${result.count === 1 ? '' : 'es'} (.zip)`,
    );
  }

  function onSplitPointerDown(event: PointerEvent) {
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onSplitPointerMove(event: PointerEvent) {
    if (!dragging || !splitEl) return;
    const rect = splitEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = (event.clientX - rect.left) / rect.width;
    splitRatio = Math.min(0.75, Math.max(0.35, next));
  }

  function onSplitPointerUp() {
    if (!dragging) return;
    dragging = false;
    updatePreferences({ generateEditorRatio: splitRatio });
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".js,text/javascript,application/javascript"
  class="visually-hidden"
  aria-hidden="true"
  tabindex="-1"
  onchange={(event) => void onImportFileSelected(event)}
/>

<GenerateNav
  sketches={$sketches}
  activeSketchId={$activeSketch?.id ?? null}
  {browsingExamples}
  {search}
  {dirtySketchIds}
  {exportStatus}
  onSearch={(value) => (search = value)}
  onBlankSketch={() => void handleBlankSketch()}
  onImportSketch={handleImportSketch}
  onSelectSketch={handleSelectSketch}
  onBrowseExamples={() => generateSection.set('examples')}
  onRename={handleRenameFromMenu}
  onDuplicate={(id) => {
    duplicateSketch(id);
    generateSection.set('sketches');
  }}
  onDownload={handleDownloadSketch}
  onDelete={requestDelete}
  onExportAll={handleExportAllSketches}
  onAboutLocalStorage={() => (localStorageInfoOpen = true)}
/>

<MainSection
  title="Generate drawings with code"
  description="Write a p5.js sketch, preview it, then capture plotter-ready vectors for Prepare."
>
  {#snippet actions()}
    {#if !browsingExamples && $activeSketch}
      <button
        type="button"
        class="btn btn--primary"
        disabled={running || !draftSource.trim() || !parseState.ok}
        title={!parseState.ok ? captureDisabledReason ?? 'Syntax error' : undefined}
        onclick={() => void runSketch()}
      >
        {running ? 'Running…' : 'Run'}
      </button>
      <button type="button" class="btn" disabled={running} onclick={resetSketch}>
        Reset
      </button>
      {#if $activeSketch.exampleId}
        <button
          type="button"
          class="btn"
          disabled={running}
          onclick={requestRestoreExample}
        >
          Restore original example
        </button>
      {/if}
      <button
        type="button"
        class="btn btn--go"
        disabled={!captureReady}
        title={captureDisabledReason ?? 'Capture SVG for Prepare'}
        aria-describedby="capture-help"
        onclick={requestCapture}
      >
        {capturing ? 'Capturing…' : 'Capture SVG'}
      </button>
    {/if}
  {/snippet}

  {#if browsingExamples}
    <ExampleGallery onUseExample={(id) => void handleUseExample(id)} />
  {:else if !$activeSketch}
    <div class="panel panel--soft empty-stage">
      <h2>No sketch selected</h2>
      <p>Create a new sketch or use a built-in example to begin.</p>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" onclick={() => void handleBlankSketch()}>
          Blank sketch
        </button>
        <button type="button" class="btn" onclick={handleImportSketch}>
          Import p5.js…
        </button>
        <button type="button" class="btn" onclick={() => generateSection.set('examples')}>
          Browse examples
        </button>
      </div>
    </div>
  {:else}
    <div class="stage">
      <div class="stage__toolbar">
        {#if renaming}
          <div class="rename">
            <label class="visually-hidden" for="sketch-name">Sketch name</label>
            <input
              id="sketch-name"
              bind:this={titleInput}
              type="text"
              bind:value={draftName}
              maxlength="64"
              onkeydown={(event) => {
                if (event.key === 'Enter') commitRename();
                if (event.key === 'Escape') cancelRename();
              }}
              onblur={commitRename}
            />
          </div>
        {:else}
          <button
            type="button"
            class="stage__title"
            onclick={() => {
              renaming = true;
              focusTitlePending = true;
            }}
            ondblclick={() => {
              renaming = true;
              focusTitlePending = true;
            }}
            title="Click to rename"
          >
            {$activeSketch.name}
          </button>
        {/if}
        <span class="stage__chip" data-tone={previewStatus}>{statusChip}</span>
      </div>

      <div class="stage__meta" data-testid="canvas-output-meta">
        <span class="stage__meta-text">
          {metaRowText}
          {#if canvasUnits}
            · Aspect {formatAspectRatio(canvasUnits.widthUnits, canvasUnits.heightUnits)}
          {/if}
        </span>
        <button
          type="button"
          class="btn stage__meta-edit"
          onclick={() => (outputModalOpen = true)}
        >
          Edit
        </button>
      </div>

      <div class="stage__split" bind:this={splitEl} style={`--editor-ratio: ${splitRatio}`}>
        <div class="stage__editor">
          <CodeEditor
            value={draftSource}
            syncKey={editorSyncKey}
            onChange={persistSource}
          />
        </div>
        <button
          type="button"
          class="stage__divider"
          aria-label="Drag to resize editor and preview"
          onpointerdown={onSplitPointerDown}
          onpointermove={onSplitPointerMove}
          onpointerup={onSplitPointerUp}
          onpointercancel={onSplitPointerUp}
        ></button>
        <div class="stage__preview">
          <PreviewPanel
            error={sketchError}
            status={previewStatus}
            bindRunner={(next) => (runner = next)}
          />
        </div>
      </div>

      <p id="capture-help" class="help-text">
        {#if captureDisabledReason && !captureReady}
          {captureDisabledReason}
        {:else}
          Capture uses p5.plotSvg and opens Prepare. Prefer line-based drawing with noFill().
        {/if}
      </p>

      {#if statusMessage}
        <p
          class="status"
          class:status--warn={statusTone === 'warn'}
          class:status--error={statusTone === 'error'}
          role="status"
        >
          {statusMessage}
        </p>
      {/if}
    </div>
  {/if}
</MainSection>

<ConfirmDialog
  open={deleteTargetId !== null}
  title="Delete sketch?"
  message={deleteTarget
    ? `Delete “${deleteTarget.name}”? This cannot be undone.`
    : 'Delete this sketch?'}
  confirmLabel="Delete"
  tone="caution"
  showSafety={false}
  onConfirm={confirmDelete}
  onCancel={() => (deleteTargetId = null)}
/>

<ConfirmDialog
  open={restoreConfirmOpen}
  title="Restore original example?"
  message="Replace your current source with the immutable built-in example? Your edits in this sketch will be overwritten."
  confirmLabel="Restore"
  tone="caution"
  showSafety={false}
  onConfirm={confirmRestoreExample}
  onCancel={() => (restoreConfirmOpen = false)}
/>

<ConfirmDialog
  open={partialCaptureConfirmOpen}
  title="Capture may be incomplete"
  message="The captured plot may omit raster images, fills, text, or other unsupported visual features."
  confirmLabel="Capture anyway"
  tone="caution"
  showSafety={false}
  onConfirm={() => void captureSvg()}
  onCancel={() => (partialCaptureConfirmOpen = false)}
/>

<ImportSketchModal
  open={importOpen}
  fileName={importFileName}
  report={importReport}
  onCancel={cancelImport}
  onConfirm={() => void confirmImport()}
/>

<LocalStorageInfoModal
  open={localStorageInfoOpen}
  onClose={() => (localStorageInfoOpen = false)}
/>

<PhysicalOutputModal
  open={outputModalOpen}
  canvasWidthUnits={canvasUnits?.widthUnits ?? null}
  canvasHeightUnits={canvasUnits?.heightUnits ?? null}
  output={activeOutput}
  onCancel={() => (outputModalOpen = false)}
  onApply={(next) => {
    if ($activeSketch) updateSketchOutput($activeSketch.id, next);
    outputModalOpen = false;
    statusMessage = 'Physical output updated. Capture again to send the new size to Prepare.';
    statusTone = 'ok';
  }}
/>

{#if importError}
  <p class="visually-hidden" role="alert">{importError}</p>
{/if}

<style>
  .stage {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
  }

  .stage__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
  }

  .stage__meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex: none;
    min-width: 0;
  }

  .stage__meta-text {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
    min-width: 0;
  }

  .stage__meta-edit {
    flex: none;
    padding: 2px 8px;
    font-size: 12px;
  }

  .stage__title {
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
    font-family: var(--font-title);
    font-size: 18px;
    font-weight: 500;
    color: var(--color-text);
    cursor: text;
    text-align: left;
  }

  .stage__title:hover,
  .stage__title:focus-visible {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .stage__chip {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    border: var(--border);
    border-radius: 2px;
    padding: 2px 8px;
  }

  .stage__split {
    --editor-ratio: 0.55;
    display: grid;
    grid-template-columns: minmax(200px, calc(var(--editor-ratio) * 100%)) 8px minmax(200px, 1fr);
    gap: 0;
    flex: 1 1 auto;
    min-height: 360px;
    min-width: 0;
  }

  .stage__editor,
  .stage__preview {
    min-height: 0;
    min-width: 0;
  }

  .stage__divider {
    border: 0;
    padding: 0;
    margin: 0 var(--space-1);
    cursor: col-resize;
    background: transparent;
    position: relative;
  }

  .stage__divider::after {
    content: '';
    position: absolute;
    inset: 0 2px;
    border-radius: 2px;
    background: rgba(34, 17, 62, 0.18);
  }

  .stage__divider:hover::after,
  .stage__divider:focus-visible::after {
    background: var(--color-deep-purple);
  }

  .rename {
    flex: 1;
    min-width: 0;
  }

  .rename input {
    width: 100%;
    max-width: 420px;
    font-family: var(--font-title);
    font-size: 18px;
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-1) var(--space-2);
  }

  .status {
    margin: 0;
    font-size: 13px;
    font-family: var(--font-mono);
  }

  .status--warn {
    color: var(--color-deep-purple);
  }

  .status--error {
    color: var(--color-warning);
  }

  .empty-stage {
    padding: var(--space-4);
  }

  @media (max-width: 900px) {
    .stage__split {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(220px, 1fr) 8px minmax(220px, 1fr);
    }

    .stage__divider {
      cursor: row-resize;
      margin: var(--space-1) 0;
    }
  }
</style>

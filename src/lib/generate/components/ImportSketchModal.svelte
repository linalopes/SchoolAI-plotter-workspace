<script lang="ts">
  import type { SketchCompatibilityReport } from '../../sketches/import/types';

  interface Props {
    open: boolean;
    fileName: string;
    report: SketchCompatibilityReport | null;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let { open, fileName, report, onCancel, onConfirm }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const hasBlockingWarning = $derived(
    !!report &&
      (report.plotCapture === 'unsupported' ||
        report.preview === 'warning' ||
        report.warnings.length > 0 ||
        report.syntax === 'unsupported'),
  );

  const confirmLabel = $derived(
    hasBlockingWarning && report?.plotCapture === 'unsupported'
      ? 'Import anyway'
      : 'Import sketch',
  );

  function levelLabel(level: string): string {
    switch (level) {
      case 'compatible':
        return 'Likely supported';
      case 'warning':
        return 'Partial / with warnings';
      case 'unsupported':
        return 'Unsupported';
      default:
        return 'Unknown until Run';
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  aria-labelledby="import-title"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
  onclose={() => {
    if (open) onCancel();
  }}
>
  <h2 id="import-title" class="dialog__title">Import p5.js</h2>

  {#if report}
    <dl class="report">
      <div>
        <dt>File</dt>
        <dd class="mono">{fileName}</dd>
      </div>

      <div>
        <dt>Sketch structure</dt>
        <dd>
          Global mode
          {#if report.hasSetup}
            · setup(): detected
          {:else}
            · setup(): not detected
          {/if}
          {#if report.hasDraw}
            · draw(): detected
          {:else}
            · draw(): not detected
          {/if}
          {#if report.hasPreload}
            · preload(): detected
          {/if}
        </dd>
      </div>

      <div>
        <dt>Canvas</dt>
        <dd>
          {#if report.canvas?.detection === 'runtime'}
            Size determined at runtime
          {:else if report.canvas?.widthUnits != null && report.canvas?.heightUnits != null}
            {report.canvas.widthUnits} × {report.canvas.heightUnits} p5 units
          {:else}
            Unknown until Run
          {/if}
          · Renderer: {report.canvas?.renderer === 'webgl'
            ? 'WEBGL'
            : report.canvas?.renderer === '2d'
              ? '2D'
              : 'Unknown'}
        </dd>
      </div>

      <div>
        <dt>External assets</dt>
        <dd>
          {#if report.externalAssets.length === 0}
            None detected
          {:else}
            {report.externalAssets.join(', ')}
          {/if}
        </dd>
      </div>

      <div>
        <dt>Import</dt>
        <dd>{report.importable ? 'Supported' : 'Not supported'}</dd>
      </div>

      <div>
        <dt>Preview</dt>
        <dd>{levelLabel(report.preview)}</dd>
      </div>

      <div>
        <dt>Plot capture</dt>
        <dd>{levelLabel(report.plotCapture)}</dd>
      </div>
    </dl>

    {#if report.syntaxError}
      <p class="callout callout--warn" role="status">
        Syntax error
        {#if report.syntaxError.line != null}
          at line {report.syntaxError.line}{#if report.syntaxError.column != null},
            column {report.syntaxError.column}{/if}:
        {:else}
          :
        {/if}
        {report.syntaxError.message} You can import the source to repair it in the
        editor. Run stays disabled until the source parses.
      </p>
    {:else if report.plotCapture === 'unsupported'}
      <p class="callout callout--warn" role="status">
        This sketch can be imported and edited, but it cannot currently be captured
        for Prepare. p5.plotSvg does not currently support WEBGL capture in this
        workspace.
      </p>
    {:else if report.externalAssets.length > 0}
      <p class="callout callout--warn" role="status">
        This sketch references assets that were not included in the imported .js
        file.
      </p>
    {:else if report.plotCapture === 'warning'}
      <p class="callout" role="status">
        Supported vector lines may capture while raster images, fills, text, or
        effects may not appear in the plotted result.
      </p>
    {/if}
  {/if}

  <div class="dialog__actions">
    <button type="button" class="btn" onclick={onCancel}>Cancel</button>
    <button type="button" class="btn btn--primary" onclick={onConfirm} disabled={!report}>
      {confirmLabel}
    </button>
  </div>
</dialog>

<style>
  .dialog {
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    max-width: 440px;
    width: calc(100% - 2rem);
    background: var(--color-white);
    color: var(--color-text);
  }

  .dialog::backdrop {
    background: rgba(34, 17, 62, 0.35);
  }

  .dialog__title {
    margin: 0 0 var(--space-3);
    font-size: 1.15rem;
  }

  .report {
    margin: 0 0 var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .report div {
    display: grid;
    gap: 2px;
  }

  .report dt {
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .report dd {
    margin: 0;
    font-size: 13px;
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .callout {
    margin: 0 0 var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius);
    background: var(--color-surface-soft);
    font-size: 13px;
  }

  .callout--warn {
    background: color-mix(in srgb, var(--color-warning) 12%, white);
  }
</style>

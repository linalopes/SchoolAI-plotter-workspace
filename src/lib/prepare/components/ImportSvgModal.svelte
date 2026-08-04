<script lang="ts">
  import type { SvgImportDraft } from '../../plot/svgImport/types';
  import { MM_PER_PX } from '../../plot/svgImport/units';

  interface Props {
    open: boolean;
    draft: SvgImportDraft | null;
    /** When true, show stored report only (no re-import). */
    reportOnly?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    onPhysicalSizeChange: (widthMm: number, heightMm: number) => void;
  }

  let {
    open,
    draft,
    reportOnly = false,
    onCancel,
    onConfirm,
    onPhysicalSizeChange,
  }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let widthMm = $state('');
  let heightMm = $state('');
  let editingSize = $state(false);
  let detailsOpen = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      if (draft) {
        widthMm = String(Number.parseFloat(draft.widthMm.toFixed(3)));
        heightMm = String(Number.parseFloat(draft.heightMm.toFixed(3)));
        editingSize = draft.needsPhysicalSize;
      }
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  const statusLabel = $derived.by(() => {
    if (!draft) return '';
    if (draft.status === 'cannot-import') return 'Cannot import';
    if (draft.status === 'ready-with-warnings') return 'Ready with warnings';
    return 'Ready';
  });

  const aspect = $derived(
    draft && draft.widthMm > 0 ? draft.heightMm / draft.widthMm : 1,
  );

  function applyWidth(value: string) {
    widthMm = value;
    const w = Number.parseFloat(value);
    if (!Number.isFinite(w) || w <= 0 || !draft) return;
    const h = w * aspect;
    heightMm = String(Number.parseFloat(h.toFixed(3)));
    onPhysicalSizeChange(w, h);
  }

  function applyHeight(value: string) {
    heightMm = value;
    const h = Number.parseFloat(value);
    if (!Number.isFinite(h) || h <= 0 || !draft) return;
    const w = h / (aspect || 1);
    widthMm = String(Number.parseFloat(w.toFixed(3)));
    onPhysicalSizeChange(w, h);
  }

  function sizeSourceLabel(source: string): string {
    switch (source) {
      case 'physical':
        return 'Declared physical units';
      case 'px-96dpi':
        return '96 DPI (px)';
      case 'unitless-96dpi':
      case 'viewbox-96dpi':
        return '96 DPI interpretation';
      case 'user-override':
        return 'Custom physical size';
      case 'percentage-override':
        return 'Percentage — set physical size';
      default:
        return source;
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  aria-labelledby="import-svg-title"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
  onclose={() => {
    if (open) onCancel();
  }}
>
  <h2 id="import-svg-title" class="dialog__title">Import SVG</h2>

  {#if draft}
    <p
      class="status"
      class:status--ok={draft.status === 'ready'}
      class:status--warn={draft.status === 'ready-with-warnings'}
      class:status--err={draft.status === 'cannot-import'}
      role="status"
    >
      {statusLabel}
    </p>

    {#if draft.error}
      <p class="callout callout--warn">{draft.error}</p>
    {/if}

    <dl class="report">
      <div>
        <dt>File</dt>
        <dd class="mono">{draft.fileName}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>
          {#if draft.metadata.sourceWidth || draft.metadata.sourceHeight}
            Width: {draft.metadata.sourceWidth ?? '—'} · Height:
            {draft.metadata.sourceHeight ?? '—'}
          {:else}
            No width/height attributes
          {/if}
          {#if draft.metadata.viewBox}
            <br />
            viewBox: {draft.metadata.viewBox.minX}
            {draft.metadata.viewBox.minY}
            {draft.metadata.viewBox.width}
            {draft.metadata.viewBox.height}
          {/if}
        </dd>
      </div>
      <div>
        <dt>Physical interpretation</dt>
        <dd>
          {Number.parseFloat(draft.widthMm.toFixed(2))} ×
          {Number.parseFloat(draft.heightMm.toFixed(2))} mm
          <br />
          <span class="muted">{sizeSourceLabel(draft.metadata.sizeSource)}</span>
          {#if draft.needsPhysicalSize}
            <br />
            <span class="muted">This is an interpretation, not a size declared by the file.</span>
          {/if}
          <button
            type="button"
            class="linkish"
            onclick={() => (editingSize = !editingSize)}
          >
            {editingSize ? 'Hide size editor' : 'Edit physical size'}
          </button>
        </dd>
      </div>
    </dl>

    {#if editingSize && !reportOnly && draft.status !== 'cannot-import'}
      <div class="fields">
        <label class="field">
          <span class="field__label">Width (mm)</span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={widthMm}
            oninput={(e) => applyWidth(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field__label">Height (mm)</span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={heightMm}
            oninput={(e) => applyHeight(e.currentTarget.value)}
          />
        </label>
        <p class="muted">
          Aspect ratio locked ·
          {Number.parseFloat((draft.metadata.millimetersPerUserUnitX || MM_PER_PX).toFixed(4))}
          mm per SVG unit (X)
        </p>
      </div>
    {/if}

    {#if draft.status !== 'cannot-import'}
      <dl class="report">
        <div>
          <dt>Geometry</dt>
          <dd>
            {draft.metadata.acceptedGeometryCount} paths accepted ·
            {draft.metadata.closedPathCount} closed ·
            {draft.metadata.filledShapeCount} filled shapes as outlines
            {#if draft.metadata.degenerateRemovedCount > 0}
              · {draft.metadata.degenerateRemovedCount} degenerate removed
            {/if}
          </dd>
        </div>
      </dl>
    {/if}

    {#if draft.metadata.warnings.length > 0}
      <div class="attention">
        <p class="section-label">Requires attention</p>
        <ul>
          {#each draft.metadata.warnings.filter((w) => w.level !== 'info') as warning}
            <li>{warning.text}</li>
          {/each}
        </ul>
        <button
          type="button"
          class="linkish"
          onclick={() => (detailsOpen = !detailsOpen)}
        >
          {detailsOpen ? 'Hide details' : 'Show all messages'}
        </button>
        {#if detailsOpen}
          <ul class="details">
            {#each draft.metadata.warnings as warning}
              <li class="mono">[{warning.level}] {warning.text}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}

  <div class="dialog__actions">
    {#if reportOnly}
      <button type="button" class="btn btn--primary" onclick={onCancel}>Close</button>
    {:else}
      <button type="button" class="btn" onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="btn btn--primary"
        disabled={!draft || draft.status === 'cannot-import'}
        onclick={onConfirm}
      >
        Import SVG
      </button>
    {/if}
  </div>
</dialog>

<style>
  .dialog {
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    max-width: 480px;
    width: calc(100% - 2rem);
    max-height: min(90vh, 720px);
    overflow: auto;
    background: var(--color-white);
  }

  .dialog::backdrop {
    background: rgba(34, 17, 62, 0.35);
  }

  .dialog__title {
    margin: 0 0 var(--space-2);
    font-size: 1.15rem;
  }

  .status {
    margin: 0 0 var(--space-3);
    font-size: 12px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status--ok {
    color: var(--color-deep-purple);
  }

  .status--warn {
    color: var(--color-warning);
  }

  .status--err {
    color: var(--color-warning);
  }

  .report {
    margin: 0 0 var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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

  .fields {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .field__label {
    display: block;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .field input {
    width: 100%;
    border: var(--border);
    border-radius: var(--radius);
    padding: var(--space-2);
    font: inherit;
  }

  .attention ul {
    margin: var(--space-1) 0;
    padding-left: 1.2rem;
    font-size: 13px;
  }

  .details {
    font-size: 12px;
  }

  .muted {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .linkish {
    border: 0;
    background: transparent;
    color: var(--color-deep-purple);
    font: inherit;
    font-size: 12px;
    padding: 0;
    margin-top: 4px;
    cursor: pointer;
    text-decoration: underline;
  }

  .callout {
    padding: var(--space-2);
    border-radius: var(--radius);
    background: var(--color-surface-soft);
    font-size: 13px;
  }

  .callout--warn {
    background: color-mix(in srgb, var(--color-warning) 12%, white);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
</style>

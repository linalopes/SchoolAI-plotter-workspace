<script lang="ts">
  import {
    deriveHeightFromWidth,
    deriveWidthFromHeight,
    formatMmPerUnit,
    legacyPhysicalSizeMm,
    type SketchOutputSettings,
  } from '../../sketches/outputSettings';

  interface Props {
    open: boolean;
    canvasWidthUnits: number | null;
    canvasHeightUnits: number | null;
    output: SketchOutputSettings;
    onCancel: () => void;
    onApply: (next: SketchOutputSettings) => void;
  }

  let { open, canvasWidthUnits, canvasHeightUnits, output, onCancel, onApply }: Props =
    $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let widthMm = $state('');
  let heightMm = $state('');

  const known = $derived(
    canvasWidthUnits != null &&
      canvasHeightUnits != null &&
      canvasWidthUnits > 0 &&
      canvasHeightUnits > 0,
  );

  const aspectLabel = $derived.by(() => {
    if (!known || canvasWidthUnits == null || canvasHeightUnits == null) return '—';
    const g = gcd(Math.round(canvasWidthUnits), Math.round(canvasHeightUnits));
    return `${Math.round(canvasWidthUnits) / g}:${Math.round(canvasHeightUnits) / g}`;
  });

  const scaleLabel = $derived.by(() => {
    if (!known || canvasWidthUnits == null) return '—';
    const w = Number.parseFloat(widthMm);
    if (!Number.isFinite(w) || w <= 0) return '—';
    return formatMmPerUnit(w / canvasWidthUnits);
  });

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      seedFields();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  }

  function seedFields() {
    if (!known || canvasWidthUnits == null || canvasHeightUnits == null) {
      widthMm = '';
      heightMm = '';
      return;
    }
    if (
      output.mode === 'custom' &&
      typeof output.physicalWidthMm === 'number' &&
      output.physicalWidthMm > 0
    ) {
      widthMm = String(Number.parseFloat(output.physicalWidthMm.toFixed(3)));
      heightMm = String(
        Number.parseFloat(
          deriveHeightFromWidth(
            canvasWidthUnits,
            canvasHeightUnits,
            output.physicalWidthMm,
          ).toFixed(3),
        ),
      );
      return;
    }
    const legacy = legacyPhysicalSizeMm(canvasWidthUnits, canvasHeightUnits);
    widthMm = String(Number.parseFloat(legacy.widthMm.toFixed(3)));
    heightMm = String(Number.parseFloat(legacy.heightMm.toFixed(3)));
  }

  function onWidthInput(value: string) {
    widthMm = value;
    if (!known || canvasWidthUnits == null || canvasHeightUnits == null) return;
    const w = Number.parseFloat(value);
    if (!Number.isFinite(w) || w <= 0) return;
    heightMm = String(
      Number.parseFloat(
        deriveHeightFromWidth(canvasWidthUnits, canvasHeightUnits, w).toFixed(3),
      ),
    );
  }

  function onHeightInput(value: string) {
    heightMm = value;
    if (!known || canvasWidthUnits == null || canvasHeightUnits == null) return;
    const h = Number.parseFloat(value);
    if (!Number.isFinite(h) || h <= 0) return;
    widthMm = String(
      Number.parseFloat(
        deriveWidthFromHeight(canvasWidthUnits, canvasHeightUnits, h).toFixed(3),
      ),
    );
  }

  function apply() {
    if (!known || canvasWidthUnits == null || canvasHeightUnits == null) return;
    const w = Number.parseFloat(widthMm);
    if (!Number.isFinite(w) || w <= 0) return;
    const h = deriveHeightFromWidth(canvasWidthUnits, canvasHeightUnits, w);
    onApply({
      version: 1,
      mode: 'custom',
      physicalWidthMm: w,
      physicalHeightMm: h,
      lockAspectRatio: true,
    });
  }
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  aria-labelledby="output-title"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
  onclose={() => {
    if (open) onCancel();
  }}
>
  <h2 id="output-title" class="dialog__title">Physical output</h2>

  {#if !known}
    <p class="help">
      Run the sketch to detect its canvas before setting physical output.
    </p>
  {:else}
    <dl class="report">
      <div>
        <dt>Canvas</dt>
        <dd>{canvasWidthUnits} × {canvasHeightUnits} p5 units</dd>
      </div>
    </dl>

    <div class="fields">
      <label class="field">
        <span class="field__label">Width</span>
        <span class="field__row">
          <input
            type="number"
            min="1"
            step="0.1"
            value={widthMm}
            oninput={(e) => onWidthInput(e.currentTarget.value)}
          />
          <span class="field__unit">mm</span>
        </span>
      </label>
      <label class="field">
        <span class="field__label">Height</span>
        <span class="field__row">
          <input
            type="number"
            min="1"
            step="0.1"
            value={heightMm}
            oninput={(e) => onHeightInput(e.currentTarget.value)}
          />
          <span class="field__unit">mm</span>
        </span>
      </label>
    </div>

    <p class="meta">Aspect ratio · Locked · {aspectLabel}</p>
    <p class="meta">Scale · {scaleLabel}</p>
  {/if}

  <div class="dialog__actions">
    <button type="button" class="btn" onclick={onCancel}>Cancel</button>
    <button
      type="button"
      class="btn btn--primary"
      disabled={!known}
      onclick={apply}
    >
      Apply
    </button>
  </div>
</dialog>

<style>
  .dialog {
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    max-width: 400px;
    width: calc(100% - 2rem);
    background: var(--color-white);
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
  }

  .report dt {
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .report dd {
    margin: 0;
  }

  .fields {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .field__label {
    display: block;
    font-size: 12px;
    color: var(--color-text-muted);
    margin-bottom: 2px;
  }

  .field__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .field__row input {
    flex: 1;
    border: var(--border);
    border-radius: var(--radius);
    padding: var(--space-2);
    font: inherit;
  }

  .field__unit {
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .meta,
  .help {
    margin: 0 0 var(--space-1);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
</style>

<script lang="ts">
  import type { PlotJobSummary } from '../../jobs/plotJob';

  interface Props {
    open: boolean;
    summary: PlotJobSummary | null;
    onStart: () => void;
    onCancel: () => void;
  }

  let { open, summary, onStart, onCancel }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
  onclose={() => {
    if (open) onCancel();
  }}
>
  <h2 class="dialog__title">Confirm plot job</h2>
  <p class="dialog__message">
    Review the job summary, then start plotting. Nothing moves until you confirm.
  </p>

  {#if summary}
    <dl class="summary">
      <div><dt>Document</dt><dd>{summary.documentName}</dd></div>
      <div><dt>Paths</dt><dd>{summary.pathCount}</dd></div>
      <div>
        <dt>Pen-down length</dt>
        <dd>{summary.penDownLengthMm.toFixed(1)} mm</dd>
      </div>
      <div>
        <dt>Pen-up travel</dt>
        <dd>{summary.penUpLengthMm.toFixed(1)} mm</dd>
      </div>
      <div><dt>Bounding box</dt><dd class="mono">{summary.boundsLabel}</dd></div>
      <div><dt>Machine profile</dt><dd>{summary.profileName}</dd></div>
      <div>
        <dt>Pen commands</dt>
        <dd>
          {summary.penConfigured
            ? 'Configured'
            : summary.dryRun
              ? 'Missing — dry run (motion only)'
              : 'Missing'}
        </dd>
      </div>
      <div><dt>Commands</dt><dd>{summary.commandCount}</dd></div>
    </dl>
  {/if}

  {#if summary && !summary.penConfigured}
    <div class="callout callout--warn">
      <span class="callout__arrow" aria-hidden="true">→</span>
      <span>
        Pen up/down commands are empty on this profile. Starting will run a dry
        motion pass without pen commands. Configure them in Machines → Pen for a
        real plot.
      </span>
    </div>
  {/if}

  <div class="callout callout--warn dialog__safety">
    <span class="callout__arrow" aria-hidden="true">→</span>
    <span>
      Software controls are not a replacement for a physical emergency stop.
      Stay ready to cut power to the machine.
    </span>
  </div>

  <div class="dialog__actions">
    <button type="button" class="btn" onclick={onCancel}>Cancel</button>
    <button type="button" class="btn btn--go" onclick={onStart}>Start plot</button>
  </div>
</dialog>

<style>
  .dialog {
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    max-width: 520px;
    width: calc(100vw - var(--space-6));
    background: var(--color-white);
    color: var(--color-text);
    font-family: var(--font-body);
  }

  .dialog::backdrop {
    background: rgba(34, 17, 62, 0.5);
  }

  .dialog__title {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: var(--space-2);
  }

  .dialog__message {
    margin-bottom: var(--space-3);
  }

  .summary {
    display: grid;
    gap: var(--space-2);
    margin: 0 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius);
    padding: var(--space-3);
    background: var(--color-surface-soft);
  }

  .summary div {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: var(--space-2);
    font-size: 13px;
  }

  .summary dt {
    margin: 0;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .summary dd {
    margin: 0;
  }

  .dialog__safety {
    margin: var(--space-3) 0 var(--space-4);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>

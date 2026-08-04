<script lang="ts">
  import {
    cancelPlotJob,
    clearJobState,
    pausePlotJob,
    plotJob,
    resumePlotJob,
  } from '../../jobs/plotJob';

  const phase = $derived($plotJob.phase);
  const active = $derived(
    ['running', 'paused', 'cancelling'].includes(phase),
  );
  const show =
    $derived(active || ['completed', 'failed', 'cancelled'].includes(phase));

  const percent = $derived.by(() => {
    const total = $plotJob.progressTotal;
    if (total <= 0) return 0;
    return Math.min(100, Math.round(($plotJob.progressIndex / total) * 100));
  });

  const label = $derived.by(() => {
    switch (phase) {
      case 'running':
        return 'Plotting…';
      case 'paused':
        return 'Paused';
      case 'cancelling':
        return 'Cancelling…';
      case 'completed':
        return 'Plot completed';
      case 'failed':
        return 'Plot failed';
      case 'cancelled':
        return 'Plot cancelled';
      default:
        return '';
    }
  });

  const detail = $derived($plotJob.statusLabel);
</script>

{#if show}
  <section
    class="job"
    class:job--error={phase === 'failed'}
    class:job--ok={phase === 'completed'}
    aria-live="polite"
  >
    <div class="job__text">
      <strong>{label}</strong>
      {#if $plotJob.summary}
        <span class="muted">{$plotJob.summary.documentName}</span>
      {/if}
      {#if detail && phase === 'running'}
        <span class="job__phase">{detail}</span>
      {/if}
      <span class="mono">
        {$plotJob.progressIndex} / {$plotJob.progressTotal} · {percent}%
      </span>
      {#if $plotJob.lastError}
        <span class="job__error" role="alert">{$plotJob.lastError}</span>
      {/if}
    </div>

    <div
      class="job__bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label="Plot progress"
    >
      <div class="job__fill" style={`width: ${percent}%`}></div>
    </div>

    <div class="btn-row job__actions">
      {#if phase === 'running'}
        <button type="button" class="btn btn--small" onclick={() => void pausePlotJob()}>
          Pause
        </button>
      {/if}
      {#if phase === 'paused'}
        <button
          type="button"
          class="btn btn--small btn--primary"
          onclick={() => void resumePlotJob()}
        >
          Resume
        </button>
      {/if}
      {#if active}
        <button
          type="button"
          class="btn btn--small btn--danger"
          onclick={() => void cancelPlotJob()}
        >
          Cancel
        </button>
      {:else}
        <button type="button" class="btn btn--small" onclick={() => clearJobState()}>
          Dismiss
        </button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .job {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2) var(--space-3);
    align-items: center;
    border: var(--border-strong);
    border-radius: var(--radius);
    background: var(--color-surface-soft);
    padding: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .job--ok {
    border-color: var(--color-turquoise);
  }

  .job--error {
    border-color: var(--color-warning);
    background: var(--color-warning-surface);
  }

  .job__text {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: baseline;
    font-size: 13px;
    grid-column: 1 / -1;
  }

  .job__phase {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .job__error {
    width: 100%;
    color: var(--color-warning);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .job__bar {
    height: 8px;
    border-radius: 2px;
    background: rgba(34, 17, 62, 0.12);
    overflow: hidden;
  }

  .job__fill {
    height: 100%;
    background: var(--color-deep-purple);
    transition: width 120ms linear;
  }

  .job--ok .job__fill {
    background: var(--color-turquoise);
  }

  .job__actions {
    justify-content: flex-end;
  }
</style>

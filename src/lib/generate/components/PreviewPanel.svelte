<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SketchRunner, type RunnerError } from '../../p5/runner';

  export type PreviewStatus =
    | 'idle'
    | 'running'
    | 'success'
    | 'error'
    | 'stale'
    | 'cancelled'
    | 'timeout';

  interface Props {
    error: RunnerError | null;
    status: PreviewStatus;
    bindRunner?: (runner: SketchRunner | null) => void;
  }

  let { error, status, bindRunner }: Props = $props();

  let container = $state<HTMLDivElement | null>(null);
  let runner: SketchRunner | null = null;
  let showStack = $state(false);

  $effect(() => {
    if (!container) return;
    if (!runner) {
      runner = new SketchRunner(container, (_err: RunnerError) => {
        // Errors are surfaced through RunOutcome in GenerateView.
      });
      bindRunner?.(runner);
    }
  });

  onDestroy(() => {
    runner?.dispose();
    bindRunner?.(null);
    runner = null;
  });

  $effect(() => {
    if (error) showStack = false;
  });

  const locationLabel = $derived.by(() => {
    if (!error) return null;
    if (error.line == null) return null;
    const column = error.column != null ? `:${error.column}` : '';
    return `Line ${error.line}${column}`;
  });

  const emptyMessage = $derived.by(() => {
    switch (status) {
      case 'running':
        return 'Running sketch…';
      case 'stale':
        return 'Source changed since the last run. Click Run to refresh the preview.';
      case 'cancelled':
        return 'Run cancelled.';
      case 'timeout':
        return 'Preview timed out. The sketch runtime did not respond. You can run it again.';
      case 'success':
        return null;
      case 'error':
        return null;
      default:
        return 'Run the sketch to preview it here.';
    }
  });
</script>

<div class="preview">
  <div class="preview__frame" bind:this={container}></div>
  {#if error}
    <div class="preview__error" role="alert">
      <strong>Sketch error{error.phase ? ` · ${error.phase}` : ''}</strong>
      {#if locationLabel}
        <p class="preview__location">{locationLabel}</p>
      {/if}
      <p>{error.message}</p>
      {#if error.stack}
        <button
          type="button"
          class="preview__stack-toggle"
          aria-expanded={showStack}
          onclick={() => (showStack = !showStack)}
        >
          {showStack ? 'Hide details' : 'Show details'}
        </button>
        {#if showStack}
          <pre class="preview__stack">{error.stack}</pre>
        {/if}
      {/if}
    </div>
  {:else if emptyMessage && status !== 'success'}
    <div
      class="preview__empty"
      class:preview__empty--stale={status === 'stale'}
      class:preview__empty--timeout={status === 'timeout'}
      role="status"
    >
      <p>{emptyMessage}</p>
    </div>
  {/if}
</div>

<style>
  .preview {
    position: relative;
    height: 100%;
    min-height: 240px;
    border: var(--border-strong);
    border-radius: var(--radius);
    background: #f3f6f6;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview__frame {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview__error,
  .preview__empty {
    position: absolute;
    inset: auto var(--space-3) var(--space-3);
    max-width: calc(100% - var(--space-6));
    background: var(--color-white);
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
    font-size: 13px;
  }

  .preview__error {
    border-color: var(--color-warning);
    background: var(--color-warning-surface);
    color: var(--color-warning);
  }

  .preview__error p,
  .preview__empty p {
    margin: var(--space-1) 0 0;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .preview__location {
    font-weight: 700;
  }

  .preview__stack-toggle {
    margin-top: var(--space-2);
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .preview__stack {
    margin: var(--space-2) 0 0;
    max-height: 120px;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    white-space: pre-wrap;
  }

  .preview__empty {
    color: var(--color-text-muted);
  }

  .preview__empty--stale {
    border-color: var(--color-deep-purple);
    color: var(--color-deep-purple);
  }

  .preview__empty--timeout {
    border-color: var(--color-warning);
    color: var(--color-warning);
  }
</style>

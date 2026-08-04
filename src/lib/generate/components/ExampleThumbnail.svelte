<script lang="ts">
  import type { SketchExample } from '../../sketches/types';

  interface Props {
    example: SketchExample;
  }

  let { example }: Props = $props();

  let failed = $state(false);

  $effect(() => {
    // Reset when the static asset path changes (never derived from user input).
    void example.previewUrl;
    failed = false;
  });
</script>

<div class="thumb">
  {#if failed}
    <p class="thumb__fallback">Preview unavailable</p>
  {:else}
    <img
      src={example.previewUrl}
      alt={`Preview of the ${example.name} example`}
      width="400"
      height="400"
      loading="lazy"
      decoding="async"
      onerror={() => (failed = true)}
    />
  {/if}
</div>

<style>
  .thumb {
    aspect-ratio: 297 / 210;
    width: 100%;
    border: var(--border);
    border-radius: var(--radius);
    background: #ffffff;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .thumb__fallback {
    margin: 0;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-2);
  }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    tag?: string;
    /** Controls rendered on the right of the section heading. */
    actions?: Snippet;
    children: Snippet;
  }

  let { title, description, tag, actions, children }: Props = $props();
</script>

<!--
  Standard frame for the main workspace: a fixed heading with a single
  scrolling body underneath, so the page itself never scrolls horizontally or
  vertically.
-->
<section class="section" aria-label={title}>
  <header class="section__header">
    <div class="section__heading">
      <h1 class="section__title">{title}</h1>
      {#if tag}
        <span class="badge badge--soft">{tag}</span>
      {/if}
    </div>
    {#if actions}
      <div class="section__actions">{@render actions()}</div>
    {/if}
  </header>

  {#if description}
    <p class="section__description">{description}</p>
  {/if}

  <div class="section__body">
    {@render children()}
  </div>
</section>

<style>
  .section {
    /* Fills whatever the sidebar leaves. min-width keeps long console lines
       from pushing the layout wider than the viewport. */
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: var(--space-4) var(--space-5);
    gap: var(--space-3);
  }

  .section__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex: none;
  }

  .section__heading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .section__title {
    font-size: 24px;
  }

  .section__actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .section__description {
    flex: none;
    margin: 0;
    color: var(--color-text-muted);
  }

  .section__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
  }
</style>

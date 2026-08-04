<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SidebarSection } from './types';

  interface Props {
    title: string;
    sections: SidebarSection[];
    active: string;
    onSelect: (id: string) => void;
    /** Optional content above the section list, e.g. a profile selector. */
    top?: Snippet;
    /** Optional content pinned to the bottom, e.g. a connection summary. */
    bottom?: Snippet;
  }

  let { title, sections, active, onSelect, top, bottom }: Props = $props();
</script>

<aside class="sidebar" aria-label="{title} sections">
  {#if top}
    <div class="sidebar__top">
      {@render top()}
    </div>
  {/if}

  <nav class="sidebar__nav">
    <p class="section-label sidebar__title">{title}</p>
    <ul class="sidebar__list">
      {#each sections as section (section.id)}
        <li>
          <button
            type="button"
            class="sidebar__item"
            class:sidebar__item--active={active === section.id}
            aria-current={active === section.id ? 'true' : undefined}
            onclick={() => onSelect(section.id)}
          >
            <span class="sidebar__label">{section.label}</span>
            {#if section.hint}
              <span class="sidebar__hint">{section.hint}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  {#if bottom}
    <div class="sidebar__bottom">
      {@render bottom()}
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    width: 280px;
    flex: none;
    display: flex;
    flex-direction: column;
    border-right: var(--border);
    background: var(--color-white);
    overflow: hidden;
  }

  .sidebar__top {
    padding: var(--space-3);
    border-bottom: var(--border);
    flex: none;
  }

  .sidebar__nav {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--space-3) var(--space-2);
  }

  .sidebar__title {
    margin: 0 0 var(--space-2);
    padding: 0 var(--space-2);
  }

  .sidebar__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .sidebar__item {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-2);
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius) var(--radius) 0;
    background: transparent;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
  }

  .sidebar__item:hover {
    background: var(--color-surface-soft);
  }

  /* The active section is marked by weight and a rule, not by colour alone. */
  .sidebar__item--active {
    background: var(--color-surface);
    border-left-color: var(--color-deep-purple);
    font-weight: 600;
  }

  .sidebar__hint {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .sidebar__bottom {
    flex: none;
    border-top: var(--border);
    padding: var(--space-3);
    background: var(--color-surface-soft);
  }
</style>

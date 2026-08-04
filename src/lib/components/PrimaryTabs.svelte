<script lang="ts">
  import { PRIMARY_TABS, TAB_LABELS, activeTab } from '../stores/navigation';

  /**
   * Primary navigation implemented as an ARIA tab list. Left and right arrows
   * move between tabs, matching what keyboard users expect from this pattern.
   */
  let buttons: HTMLButtonElement[] = $state([]);

  function focusTab(index: number) {
    const target = (index + PRIMARY_TABS.length) % PRIMARY_TABS.length;
    const tab = PRIMARY_TABS[target];
    if (!tab) return;
    activeTab.goTo(tab);
    buttons[target]?.focus();
  }

  function onKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(PRIMARY_TABS.length - 1);
    }
  }
</script>

<nav class="tabs on-dark" aria-label="Primary sections">
  <div role="tablist" aria-label="Primary sections" class="tabs__list">
    {#each PRIMARY_TABS as tab, index (tab)}
      <button
        bind:this={buttons[index]}
        type="button"
        role="tab"
        id="tab-{tab}"
        aria-selected={$activeTab === tab}
        aria-controls="panel-{tab}"
        tabindex={$activeTab === tab ? 0 : -1}
        class="tab"
        class:tab--active={$activeTab === tab}
        onclick={() => activeTab.goTo(tab)}
        onkeydown={(event) => onKeydown(event, index)}
      >
        {TAB_LABELS[tab]}
      </button>
    {/each}
  </div>
</nav>

<style>
  .tabs__list {
    display: flex;
    gap: 2px;
  }

  .tab {
    font-family: var(--font-title);
    font-weight: 500;
    font-size: 14px;
    letter-spacing: 0.01em;
    color: var(--color-gray-green);
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    border-radius: 2px 2px 0 0;
  }

  .tab:hover {
    color: var(--color-white);
  }

  /* Pink is used as a structural accent on Deep Purple, an approved pair. */
  .tab--active {
    color: var(--color-white);
    border-bottom-color: var(--color-pink);
  }
</style>

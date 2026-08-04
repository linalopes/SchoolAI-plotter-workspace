<script lang="ts">
  import type { PlotDocument } from '../../plot/types';

  /**
   * Prepare Documents sidebar list with per-row overflow actions.
   * Matches Generate sketch menu language (⋯ → Rename / Delete).
   */

  interface Props {
    documents: PlotDocument[];
    activeId: string | null;
    documentCountLabel: string;
    clearAllDisabled: boolean;
    clearAllTitle?: string;
    isDeleteDisabled: (id: string) => boolean;
    deleteDisabledReason: string;
    onSelect: (id: string) => void;
    onRename: (id: string) => void;
    onDelete: (id: string) => void;
    onClearAll: () => void;
  }

  let {
    documents,
    activeId,
    documentCountLabel,
    clearAllDisabled,
    clearAllTitle = 'Clear all prepared documents',
    isDeleteDisabled,
    deleteDisabledReason,
    onSelect,
    onRename,
    onDelete,
    onClearAll,
  }: Props = $props();

  let openMenuId = $state<string | null>(null);

  function closeMenu() {
    openMenuId = null;
  }

  function toggleMenu(id: string, event: MouseEvent) {
    event.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

  $effect(() => {
    if (openMenuId === null) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.doc-list__menu-wrap')) return;
      closeMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  });

  function sourceMarker(doc: PlotDocument): string {
    if (doc.source === 'svg-import') return 'SVG';
    if (doc.source === 'p5') return 'p5';
    return doc.source;
  }
</script>

<p class="doc-storage mono" aria-live="polite">{documentCountLabel}</p>

{#if documents.length > 0}
  <ul class="doc-list" role="list">
    {#each documents as doc (doc.id)}
      <li class="doc-list__row" data-document-id={doc.id}>
        <button
          type="button"
          class="doc-list__item"
          class:doc-list__item--active={activeId === doc.id}
          aria-current={activeId === doc.id ? 'true' : undefined}
          onclick={() => {
            closeMenu();
            onSelect(doc.id);
          }}
        >
          <span class="doc-list__name">{doc.name}</span>
          <span class="doc-list__meta mono">{sourceMarker(doc)}</span>
        </button>

        <div class="doc-list__menu-wrap">
          <button
            type="button"
            class="doc-list__more"
            data-document-menu={doc.id}
            aria-label={`Actions for ${doc.name}`}
            aria-haspopup="menu"
            aria-expanded={openMenuId === doc.id}
            onclick={(event) => toggleMenu(doc.id, event)}
          >
            ⋯
          </button>
          {#if openMenuId === doc.id}
            <div class="doc-list__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onclick={(event) => {
                  event.stopPropagation();
                  closeMenu();
                  onRename(doc.id);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                class="doc-list__menu-danger"
                disabled={isDeleteDisabled(doc.id)}
                title={isDeleteDisabled(doc.id) ? deleteDisabledReason : undefined}
                onclick={(event) => {
                  event.stopPropagation();
                  if (isDeleteDisabled(doc.id)) return;
                  closeMenu();
                  onDelete(doc.id);
                }}
              >
                Delete
              </button>
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  <div class="doc-list__footer">
    <button
      type="button"
      class="doc-list__clear"
      disabled={clearAllDisabled}
      title={clearAllDisabled ? deleteDisabledReason : clearAllTitle}
      onclick={onClearAll}
    >
      Clear all documents…
    </button>
  </div>
{:else}
  <p class="help-text">
    Recent captures and imported SVG documents stored locally in this browser.
  </p>
{/if}

<style>
  .doc-storage {
    margin: 0 0 var(--space-2);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .doc-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 220px;
    overflow-y: auto;
  }

  .doc-list__row {
    display: flex;
    align-items: stretch;
    gap: 0;
    position: relative;
  }

  .doc-list__item {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    padding: var(--space-1) var(--space-2);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .doc-list__item:hover {
    background: var(--color-surface-soft);
  }

  .doc-list__item--active {
    background: var(--color-surface);
    border-left-color: var(--color-deep-purple);
    font-weight: 600;
  }

  .doc-list__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-list__meta {
    flex: none;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .doc-list__menu-wrap {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
  }

  .doc-list__more {
    border: 0;
    background: transparent;
    border-radius: var(--radius);
    width: 28px;
    height: 100%;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 16px;
    line-height: 1;
  }

  .doc-list__more:hover,
  .doc-list__more:focus-visible {
    background: var(--color-surface-soft);
    color: var(--color-text);
  }

  .doc-list__menu {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 20;
    min-width: 140px;
    border: var(--border-strong);
    border-radius: var(--radius);
    background: var(--color-white);
    box-shadow: 0 8px 24px rgba(34, 17, 62, 0.12);
    padding: var(--space-1);
    display: flex;
    flex-direction: column;
  }

  .doc-list__menu button {
    border: 0;
    background: transparent;
    text-align: left;
    padding: var(--space-2);
    border-radius: var(--radius);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .doc-list__menu button:hover:not(:disabled) {
    background: var(--color-surface-soft);
  }

  .doc-list__menu button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .doc-list__menu-danger {
    color: var(--color-warning);
  }

  .doc-list__footer {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--border);
  }

  .doc-list__clear {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .doc-list__clear:hover:not(:disabled) {
    color: var(--color-warning);
  }

  .doc-list__clear:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    text-decoration: none;
  }
</style>

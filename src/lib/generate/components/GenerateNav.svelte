<script lang="ts">
  import type { Sketch } from '../../sketches/types';

  interface Props {
    sketches: Sketch[];
    activeSketchId: string | null;
    browsingExamples: boolean;
    search: string;
    dirtySketchIds?: Set<string>;
    exportStatus?: string | null;
    onSearch: (value: string) => void;
    onBlankSketch: () => void;
    onImportSketch: () => void;
    onSelectSketch: (id: string) => void;
    onBrowseExamples: () => void;
    onRename: (id: string) => void;
    onDuplicate: (id: string) => void;
    onDownload: (id: string) => void;
    onDelete: (id: string) => void;
    onExportAll: () => void;
    onAboutLocalStorage: () => void;
  }

  let {
    sketches,
    activeSketchId,
    browsingExamples,
    search,
    dirtySketchIds = new Set(),
    exportStatus = null,
    onSearch,
    onBlankSketch,
    onImportSketch,
    onSelectSketch,
    onBrowseExamples,
    onRename,
    onDuplicate,
    onDownload,
    onDelete,
    onExportAll,
    onAboutLocalStorage,
  }: Props = $props();

  let openMenuId = $state<string | null>(null);
  let newMenuOpen = $state(false);

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sketches;
    return sketches.filter((sketch) => sketch.name.toLowerCase().includes(q));
  });

  function formatUpdated(ts: number): string {
    try {
      return new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  function toggleMenu(id: string, event: MouseEvent) {
    event.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

  function closeMenu() {
    openMenuId = null;
    newMenuOpen = false;
  }
</script>

<svelte:window onclick={closeMenu} onkeydown={(e) => e.key === 'Escape' && closeMenu()} />

<aside class="nav" aria-label="Generate navigation">
  <div class="nav__top">
    <div class="nav__new-wrap">
      <button
        type="button"
        class="btn btn--primary nav__new"
        aria-haspopup="menu"
        aria-expanded={newMenuOpen}
        onclick={(event) => {
          event.stopPropagation();
          newMenuOpen = !newMenuOpen;
          openMenuId = null;
        }}
      >
        + New sketch
      </button>
      {#if newMenuOpen}
        <div class="nav__new-menu" role="menu" aria-label="New sketch">
          <button
            type="button"
            role="menuitem"
            onclick={(event) => {
              event.stopPropagation();
              closeMenu();
              onBlankSketch();
            }}
          >
            Blank sketch
          </button>
          <button
            type="button"
            role="menuitem"
            onclick={(event) => {
              event.stopPropagation();
              closeMenu();
              onImportSketch();
            }}
          >
            Import p5.js…
          </button>
        </div>
      {/if}
    </div>
  </div>

  <div class="nav__body">
    <p class="section-label">My sketches</p>
    <p class="nav__local mono">
      Saved locally in this browser
      <button
        type="button"
        class="nav__local-link"
        onclick={() => {
          closeMenu();
          onAboutLocalStorage();
        }}
      >
        About local storage
      </button>
    </p>
    {#if sketches.length > 6}
      <label class="nav__search">
        <span class="visually-hidden">Search sketches</span>
        <input
          type="search"
          placeholder="Search…"
          value={search}
          oninput={(event) => onSearch((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {/if}

    {#if filtered.length === 0}
      <p class="nav__empty muted">
        {sketches.length === 0 ? 'No sketches yet.' : 'No matches.'}
      </p>
    {:else}
      <ul class="nav__list" role="list">
        {#each filtered as sketch (sketch.id)}
          <li class="nav__row">
            <button
              type="button"
              class="nav__item"
              class:nav__item--active={!browsingExamples && activeSketchId === sketch.id}
              aria-current={!browsingExamples && activeSketchId === sketch.id ? 'true' : undefined}
              title={`Updated ${formatUpdated(sketch.updatedAt)}`}
              onclick={() => {
                closeMenu();
                onSelectSketch(sketch.id);
              }}
            >
              <span class="nav__name">
                {sketch.name}
                {#if dirtySketchIds.has(sketch.id)}
                  <span class="nav__dirty" title="Unsaved changes" aria-label="Unsaved changes">•</span>
                {/if}
              </span>
              <span class="nav__meta visually-hidden">
                Updated {formatUpdated(sketch.updatedAt)}
              </span>
            </button>

            <div class="nav__menu-wrap">
              <button
                type="button"
                class="nav__more"
                aria-label={`Actions for ${sketch.name}`}
                aria-haspopup="menu"
                aria-expanded={openMenuId === sketch.id}
                onclick={(event) => toggleMenu(sketch.id, event)}
              >
                ⋯
              </button>
              {#if openMenuId === sketch.id}
                <div class="nav__menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onclick={(event) => {
                      event.stopPropagation();
                      closeMenu();
                      onRename(sketch.id);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onclick={(event) => {
                      event.stopPropagation();
                      closeMenu();
                      onDuplicate(sketch.id);
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`Download ${sketch.name} as JavaScript file`}
                    onclick={(event) => {
                      event.stopPropagation();
                      closeMenu();
                      onDownload(sketch.id);
                    }}
                  >
                    Download .js
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="nav__menu-danger"
                    onclick={(event) => {
                      event.stopPropagation();
                      closeMenu();
                      onDelete(sketch.id);
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
    {/if}

    <div class="nav__export">
      <button
        type="button"
        class="nav__export-btn"
        disabled={sketches.length === 0}
        title={sketches.length === 0
          ? 'There are no sketches to download.'
          : `Download all ${sketches.length} sketch${sketches.length === 1 ? '' : 'es'} as a ZIP of .js files`}
        aria-label={sketches.length === 0
          ? 'Download all sketches as ZIP — none available'
          : `Download all ${sketches.length} sketches as a ZIP archive`}
        onclick={() => {
          closeMenu();
          onExportAll();
        }}
      >
        Download all sketches (.zip)
      </button>
      {#if exportStatus}
        <p class="nav__export-status mono" role="status" aria-live="polite">
          {exportStatus}
        </p>
      {/if}
    </div>

    <p class="section-label nav__learn">Learn</p>
    <button
      type="button"
      class="nav__item nav__browse"
      class:nav__item--active={browsingExamples}
      aria-current={browsingExamples ? 'true' : undefined}
      onclick={() => {
        closeMenu();
        onBrowseExamples();
      }}
    >
      <span class="nav__name">Browse examples →</span>
    </button>
  </div>

  <div class="nav__bottom">
    <p class="section-label">Target</p>
    <p class="mono nav__target">A4 landscape · 297 × 210 mm</p>
  </div>
</aside>

<style>
  .nav {
    width: 280px;
    flex: none;
    display: flex;
    flex-direction: column;
    border-right: var(--border);
    background: var(--color-white);
    overflow: hidden;
  }

  .nav__top {
    padding: var(--space-3);
    border-bottom: var(--border);
  }

  .nav__new-wrap {
    position: relative;
  }

  .nav__new {
    width: 100%;
  }

  .nav__new-menu {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    z-index: 30;
    border: var(--border-strong);
    border-radius: var(--radius);
    background: var(--color-white);
    box-shadow: 0 8px 24px rgba(34, 17, 62, 0.12);
    padding: var(--space-1);
    display: flex;
    flex-direction: column;
  }

  .nav__new-menu button {
    border: 0;
    background: transparent;
    text-align: left;
    padding: var(--space-2);
    border-radius: var(--radius);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .nav__new-menu button:hover {
    background: var(--color-surface-soft);
  }

  .nav__body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--space-3) var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .nav__search input {
    width: 100%;
    border: var(--border);
    border-radius: var(--radius);
    padding: var(--space-1) var(--space-2);
    font: inherit;
    font-size: 13px;
  }

  .nav__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    gap: 2px;
  }

  .nav__item {
    width: 100%;
    text-align: left;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius) var(--radius) 0;
    background: transparent;
    padding: var(--space-2);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text);
    cursor: pointer;
    min-width: 0;
  }

  .nav__item:hover {
    background: var(--color-surface-soft);
  }

  .nav__item--active {
    background: var(--color-surface);
    border-left-color: var(--color-deep-purple);
    font-weight: 600;
  }

  .nav__name {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav__dirty {
    color: var(--color-pink);
    font-size: 18px;
    line-height: 1;
  }

  .nav__more {
    border: 0;
    background: transparent;
    border-radius: var(--radius);
    width: 28px;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 16px;
    line-height: 1;
  }

  .nav__more:hover,
  .nav__more:focus-visible {
    background: var(--color-surface-soft);
    color: var(--color-text);
  }

  .nav__menu-wrap {
    position: relative;
  }

  .nav__menu {
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

  .nav__menu button {
    border: 0;
    background: transparent;
    text-align: left;
    padding: var(--space-2);
    border-radius: var(--radius);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .nav__menu button:hover {
    background: var(--color-surface-soft);
  }

  .nav__menu-danger {
    color: var(--color-warning);
  }

  .nav__local {
    margin: 0 0 var(--space-2);
    padding: 0 var(--space-2);
    font-size: 11px;
    color: var(--color-text-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0.35em 0.6em;
    align-items: baseline;
  }

  .nav__local-link {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    font-size: 11px;
    color: var(--color-text-muted);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .nav__local-link:hover {
    color: var(--color-text);
  }

  .nav__export {
    margin-top: var(--space-2);
    padding: 0 var(--space-2);
  }

  .nav__export-btn {
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

  .nav__export-btn:hover:not(:disabled) {
    color: var(--color-text);
  }

  .nav__export-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    text-decoration: none;
  }

  .nav__export-status {
    margin: var(--space-1) 0 0;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .nav__learn {
    margin-top: var(--space-3);
  }

  .nav__browse {
    border-left: 2px solid transparent;
  }

  .nav__empty {
    margin: 0;
    padding: 0 var(--space-2);
    font-size: 13px;
  }

  .nav__bottom {
    border-top: var(--border);
    padding: var(--space-3);
    background: var(--color-surface-soft);
  }

  .nav__target {
    margin: var(--space-1) 0 0;
    font-size: 12px;
  }
</style>

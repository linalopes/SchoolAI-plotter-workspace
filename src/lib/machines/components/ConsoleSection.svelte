<script lang="ts">
  import { REALTIME_LABELS, type RealtimeCommand } from '../../grbl/commands';
  import {
    CONSOLE_LIMIT,
    clearConsole,
    consoleEntries,
    grblClient,
    isConnected,
    logSystemMessage,
    sendCommand,
  } from '../../grbl/stores';
  import type { ConsoleDirection } from '../../grbl/types';
  import {
    preferences,
    toggleConsoleFilter,
    updatePreferences,
  } from '../../stores/preferences';
  import { formatTimestamp } from '../../utils/misc';

  /**
   * Serial console.
   *
   * Text typed here is sent as a normal queued command with the profile's line
   * ending appended. Realtime characters are not detected in the input: they
   * have dedicated buttons, because silently reinterpreting a typed `!` as a
   * feed hold would be the kind of surprise that stops a machine mid-drawing.
   */

  const DIRECTIONS: ConsoleDirection[] = ['TX', 'RX', 'SYSTEM', 'ERROR'];

  /** Prefix shown before each entry, so direction never relies on colour. */
  const DIRECTION_MARK: Record<ConsoleDirection, string> = {
    TX: '>>',
    RX: '<<',
    SYSTEM: '--',
    ERROR: '!!',
  };

  let input = $state('');
  let history = $state<string[]>([]);
  let historyIndex = $state(-1);
  let draft = $state('');
  let logElement = $state<HTMLDivElement | null>(null);
  let showStatusReports = $state(false);

  const filters = $derived($preferences.consoleFilters);
  const autoScroll = $derived($preferences.consoleAutoScroll);

  const visibleEntries = $derived(
    $consoleEntries.filter((entry) => filters[entry.direction]),
  );

  $effect(() => {
    // Re-runs whenever the visible list changes.
    void visibleEntries.length;
    if (autoScroll && logElement) {
      logElement.scrollTop = logElement.scrollHeight;
    }
  });

  function setStatusLogging(enabled: boolean) {
    showStatusReports = enabled;
    grblClient.setLogStatusReports(enabled);
  }

  async function submit() {
    const command = input.trim();
    // Blank submissions are common when tapping Enter; they are simply ignored.
    if (command.length === 0) return;
    if (!$isConnected) return;

    history = [...history.filter((entry) => entry !== command), command].slice(-50);
    historyIndex = -1;
    draft = '';
    input = '';
    await sendCommand(command);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
      return;
    }

    if (event.key === 'ArrowUp') {
      if (history.length === 0) return;
      event.preventDefault();
      if (historyIndex === -1) draft = input;
      historyIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      input = history[historyIndex] ?? '';
      return;
    }

    if (event.key === 'ArrowDown') {
      if (historyIndex === -1) return;
      event.preventDefault();
      if (historyIndex >= history.length - 1) {
        historyIndex = -1;
        input = draft;
      } else {
        historyIndex += 1;
        input = history[historyIndex] ?? '';
      }
    }
  }

  async function copyConsole() {
    const text = visibleEntries
      .map(
        (entry) =>
          `${formatTimestamp(entry.timestamp)} ${entry.direction.padEnd(6)} ${entry.message}`,
      )
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      logSystemMessage(`Copied ${visibleEntries.length} console entries to the clipboard.`);
    } catch {
      logSystemMessage('The clipboard is not available in this context.');
    }
  }

  const realtimeButtons: Array<{ command: RealtimeCommand; label: string }> = [
    { command: 'statusReport', label: 'Status ?' },
    { command: 'feedHold', label: 'Pause !' },
    { command: 'cycleStart', label: 'Resume ~' },
  ];
</script>

<section class="panel console">
  <div class="panel__header">
    <h2>Console</h2>
    <span class="badge badge--soft">
      {visibleEntries.length} / {CONSOLE_LIMIT} shown
    </span>
  </div>

  <div class="toolbar">
    <fieldset class="filters">
      <legend class="visually-hidden">Filter console entries by direction</legend>
      {#each DIRECTIONS as direction (direction)}
        <label class="filter" class:filter--off={!filters[direction]}>
          <input
            type="checkbox"
            checked={filters[direction]}
            onchange={() => toggleConsoleFilter(direction)}
          />
          <span class="filter__mark" aria-hidden="true">{DIRECTION_MARK[direction]}</span>
          <span>{direction}</span>
        </label>
      {/each}
    </fieldset>

    <div class="toolbar__actions">
      <label class="checkbox" for="auto-scroll">
        <input
          id="auto-scroll"
          type="checkbox"
          checked={autoScroll}
          onchange={(event) =>
            updatePreferences({ consoleAutoScroll: event.currentTarget.checked })}
        />
        <span>Auto-scroll</span>
      </label>

      <label class="checkbox" for="log-status">
        <input
          id="log-status"
          type="checkbox"
          checked={showStatusReports}
          onchange={(event) => setStatusLogging(event.currentTarget.checked)}
        />
        <span>Log status polling</span>
      </label>

      <button type="button" class="btn btn--small" onclick={() => void copyConsole()}>
        Copy
      </button>
      <button type="button" class="btn btn--small" onclick={clearConsole}>Clear</button>
    </div>
  </div>

  <!--
    A scrollable region has to be reachable by keyboard, which is why this log
    carries tabindex despite not being an interactive control.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="log"
    bind:this={logElement}
    role="log"
    aria-label="Serial console output"
    tabindex="0"
  >
    {#if visibleEntries.length === 0}
      <p class="log__empty">
        No entries match the current filters. Connect a machine, or enable more
        directions above.
      </p>
    {:else}
      {#each visibleEntries as entry (entry.id)}
        <p class="entry entry--{entry.direction.toLowerCase()}">
          <span class="entry__time">{formatTimestamp(entry.timestamp)}</span>
          <span class="entry__mark" aria-hidden="true">{DIRECTION_MARK[entry.direction]}</span>
          <span class="visually-hidden">{entry.direction}</span>
          <span class="entry__message">{entry.message}</span>
        </p>
      {/each}
    {/if}
  </div>

  <form
    class="sender"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <div class="field sender__field">
      <label class="field__label" for="console-input">Send a command</label>
      <input
        id="console-input"
        type="text"
        bind:value={input}
        onkeydown={onKeydown}
        disabled={!$isConnected}
        autocomplete="off"
        spellcheck="false"
        placeholder={$isConnected ? '$$' : 'Connect the machine to send commands'}
        aria-describedby="console-input-hint"
      />
    </div>
    <button type="submit" class="btn btn--primary" disabled={!$isConnected || input.trim().length === 0}>
      Send
    </button>
  </form>

  <p id="console-input-hint" class="help-text">
    Sent as a normal queued command with the profile's line ending. Use the up
    and down arrows to recall previous commands. Realtime characters are not
    interpreted here — use the buttons below.
  </p>

  <div class="realtime">
    <p class="section-label">Realtime commands</p>
    <div class="btn-row">
      {#each realtimeButtons as button (button.command)}
        <button
          type="button"
          class="btn btn--small"
          disabled={!$isConnected}
          title={REALTIME_LABELS[button.command]}
          onclick={() => void grblClient.sendRealtime(button.command)}
        >
          {button.label}
        </button>
      {/each}
    </div>
    <p class="help-text">
      These bypass the command queue and are written straight to the controller.
      Soft reset lives in Manual Control, behind a confirmation.
    </p>
  </div>
</section>

<style>
  .console {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .filters {
    display: flex;
    gap: var(--space-1);
    border: 0;
    padding: 0;
    margin: 0;
  }

  .filter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: 2px var(--space-2);
    cursor: pointer;
    background: var(--color-surface);
  }

  .filter input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }

  .filter:has(input:focus-visible) {
    outline: 2px solid var(--color-deep-purple);
    outline-offset: 2px;
  }

  /* Excluded directions are dimmed and struck through, not merely recoloured. */
  .filter--off {
    background: transparent;
    color: var(--color-text-muted);
    text-decoration: line-through;
    border-style: dashed;
  }

  .toolbar__actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .log {
    flex: 1 1 auto;
    min-height: 260px;
    max-height: 44vh;
    overflow-y: auto;
    border: var(--border-strong);
    border-radius: var(--radius);
    background: var(--color-deep-purple);
    padding: var(--space-2);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--color-gray-green);
  }

  .log:focus-visible {
    outline: 2px solid var(--color-turquoise);
    outline-offset: 2px;
  }

  .log__empty {
    margin: 0;
    color: var(--color-gray-green);
    opacity: 0.7;
  }

  .entry {
    margin: 0;
    display: grid;
    grid-template-columns: 90px 22px minmax(0, 1fr);
    gap: var(--space-1);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .entry__time {
    color: rgba(202, 216, 216, 0.55);
  }

  .entry__mark {
    font-weight: 700;
  }

  .entry--tx .entry__message {
    color: var(--color-turquoise);
  }

  .entry--rx .entry__message {
    color: var(--color-white);
  }

  .entry--system .entry__message {
    color: var(--color-gray-green);
    font-style: italic;
  }

  .entry--error .entry__message,
  .entry--error .entry__mark {
    color: var(--color-pink);
    font-weight: 700;
  }

  .sender {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .sender__field {
    flex: 1 1 auto;
  }

  .realtime {
    margin-top: var(--space-4);
    border-top: var(--border);
    padding-top: var(--space-3);
  }
</style>

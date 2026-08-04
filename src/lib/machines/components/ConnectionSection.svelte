<script lang="ts">
  import {
    connection,
    displayState,
    grblClient,
    isConnected,
    serialEnvironment,
  } from '../../grbl/stores';
  import { preferences, updatePreferences } from '../../stores/preferences';
  import {
    chooseSerialPort,
    connectFromUi,
    disconnectFromUi,
  } from '../actions';
  import { activeProfile, updateActiveProfile } from '../stores/profiles';
  import {
    BAUD_RATE_OPTIONS,
    PROTOCOL_COMPATIBILITY_OPTIONS,
    type ProtocolCompatibility,
  } from '../profiles/types';
  import CompatibilityNotice from './CompatibilityNotice.svelte';

  /**
   * Serial connection controls.
   *
   * The port picker is only ever opened from a click, never automatically:
   * Chrome requires a user gesture, and silently prompting for hardware access
   * would be the wrong behaviour regardless.
   */

  let busy = $state(false);
  let pickerNotice = $state<string | null>(null);

  const demoMode = $derived($preferences.demoMode);

  const serialUsable = $derived(
    demoMode || (serialEnvironment.supported && serialEnvironment.secureContext),
  );

  const hasPort = $derived.by(() => {
    // Re-evaluated whenever the connection changes so the indicator keeps up
    // with port selection and disconnection.
    void $connection.portDescription;
    return grblClient.hasPort();
  });

  async function onChoosePort() {
    pickerNotice = null;
    busy = true;
    try {
      const selected = await chooseSerialPort();
      if (!selected) pickerNotice = 'No serial port was selected.';
    } catch (error) {
      pickerNotice =
        error instanceof Error ? error.message : 'The port picker could not be opened.';
    } finally {
      busy = false;
    }
  }

  async function onConnect() {
    pickerNotice = null;
    busy = true;
    try {
      await connectFromUi();
    } catch {
      // Reported through the connection store's lastError and the console.
    } finally {
      busy = false;
    }
  }

  async function onDisconnect() {
    busy = true;
    try {
      await disconnectFromUi();
    } finally {
      busy = false;
    }
  }
</script>

<CompatibilityNotice />

<section class="panel">
  <div class="panel__header">
    <h2>Connection</h2>
    <span class="badge {$isConnected ? 'badge--ok' : 'badge--soft'}">{$displayState}</span>
  </div>

  <div class="indicators">
    <div class="indicator">
      <span class="badge {serialEnvironment.supported ? 'badge--ok' : 'badge--warn'}">
        {serialEnvironment.supported ? 'Supported' : 'Unsupported'}
      </span>
      <span class="indicator__label">Web Serial in this browser</span>
    </div>
    <div class="indicator">
      <span class="badge {serialEnvironment.secureContext ? 'badge--ok' : 'badge--warn'}">
        {serialEnvironment.secureContext ? 'Secure' : 'Insecure'}
      </span>
      <span class="indicator__label">Secure context (HTTPS or localhost)</span>
    </div>
    <div class="indicator">
      <span class="badge badge--soft">{$activeProfile.name}</span>
      <span class="indicator__label">Selected machine profile</span>
    </div>
  </div>

  <hr class="divider" />

  <div class="field-grid">
    <div class="field">
      <label class="field__label" for="baud-rate">Baud rate</label>
      <select
        id="baud-rate"
        disabled={$isConnected}
        value={$activeProfile.connection.baudRate}
        onchange={(event) =>
          updateActiveProfile((profile) => ({
            ...profile,
            connection: {
              ...profile.connection,
              baudRate: Number(event.currentTarget.value),
            },
          }))}
      >
        {#each BAUD_RATE_OPTIONS as rate (rate)}
          <option value={rate}>{rate}</option>
        {/each}
      </select>
      <p class="field__hint">GRBL 1.1 uses 115200 by default.</p>
    </div>

    <div class="field">
      <label class="field__label" for="protocol-compatibility">Protocol compatibility</label>
      <select
        id="protocol-compatibility"
        value={$activeProfile.connection.protocolCompatibility}
        onchange={(event) => {
          const value = event.currentTarget.value as ProtocolCompatibility;
          updateActiveProfile((profile) => ({
            ...profile,
            connection: {
              ...profile.connection,
              protocolCompatibility: value,
            },
          }));
          // Live sessions pick up the override immediately so jogging switches
          // without a reconnect. The choice is still stored in the profile.
          grblClient.setProtocolCompatibility(value);
        }}
      >
        {#each PROTOCOL_COMPATIBILITY_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      <p class="field__hint">
        Auto reads the startup banner. Use a forced mode only when detection is
        wrong.
      </p>
    </div>

    <div class="field">
      <span class="field__label" id="demo-mode-label">Demo mode</span>
      <label class="checkbox" for="demo-mode">
        <input
          id="demo-mode"
          type="checkbox"
          checked={demoMode}
          disabled={$isConnected}
          onchange={(event) =>
            updatePreferences({ demoMode: event.currentTarget.checked })}
        />
        <span>Use a simulated GRBL controller</span>
      </label>
      <p class="field__hint">
        Demo mode never touches hardware. It is labelled as a demo connection
        everywhere it appears.
      </p>
    </div>
  </div>

  <hr class="divider" />

  <div class="btn-row">
    <button
      type="button"
      class="btn"
      disabled={busy || $isConnected || demoMode || !serialUsable}
      onclick={() => void onChoosePort()}
    >
      Choose serial port
    </button>

    <button
      type="button"
      class="btn btn--primary"
      disabled={busy || $isConnected || !serialUsable}
      onclick={() => void onConnect()}
    >
      {busy && !$isConnected ? 'Connecting…' : 'Connect'}
    </button>

    <button
      type="button"
      class="btn"
      disabled={busy || !$isConnected}
      onclick={() => void onDisconnect()}
    >
      Disconnect
    </button>

    <button
      type="button"
      class="btn btn--small"
      disabled={!$isConnected}
      onclick={() => void grblClient.requestBuildInfo()}
    >
      Re-read build info
    </button>
  </div>

  <p class="help-text">
    {#if demoMode}
      Demo mode is on. Connect starts a simulated controller; no port is chosen.
    {:else}
      Choosing a port is optional: Connect opens the picker when no port has been
      selected yet.
    {/if}
  </p>

  {#if pickerNotice}
    <!-- Cancelling the picker is a normal outcome, so it is reported quietly. -->
    <p class="notice-line" role="status">{pickerNotice}</p>
  {/if}
</section>

<section class="panel panel--soft">
  <h3>Connection details</h3>
  <dl class="details">
    <div>
      <dt class="section-label">Status</dt>
      <dd>{$displayState}</dd>
    </div>
    <div>
      <dt class="section-label">Transport</dt>
      <dd>
        {#if $connection.kind === 'demo'}
          Demo connection
        {:else if $connection.kind === 'web-serial'}
          Web Serial
        {:else}
          —
        {/if}
      </dd>
    </div>
    <div>
      <dt class="section-label">Port</dt>
      <dd>{$connection.portDescription ?? (hasPort ? 'Selected' : 'Not selected')}</dd>
    </div>
    <div>
      <dt class="section-label">Baud rate</dt>
      <dd>{$connection.baudRate ?? $activeProfile.connection.baudRate}</dd>
    </div>
    <div>
      <dt class="section-label">Startup banner</dt>
      <dd>{$connection.rawFirmwareBanner ?? ($connection.bannerVersion ? `Grbl ${$connection.bannerVersion}` : 'Not received')}</dd>
    </div>
    <div>
      <dt class="section-label">Protocol</dt>
      <dd>{$connection.protocolLabel}</dd>
    </div>
    <div>
      <dt class="section-label">Jog command</dt>
      <dd>
        {$connection.capabilities.supportsJogCommand
          ? '$J= (GRBL 1.1+)'
          : 'Legacy G1 (GRBL 0.9)'}
      </dd>
    </div>
    <div>
      <dt class="section-label">Build info ($I)</dt>
      <dd>
        {$connection.firmwareVersion ?? '—'}
        {#if $connection.firmwareBuild}
          <span class="muted"> · {$connection.firmwareBuild}</span>
        {/if}
      </dd>
    </div>
    <div>
      <dt class="section-label">Options ($I OPT)</dt>
      <dd>{$connection.options ?? '—'}</dd>
    </div>
  </dl>

  <hr class="divider" />

  <div class="field">
    <span class="field__label">Last serial error</span>
    {#if $connection.lastError}
      <p class="error-line">{$connection.lastError}</p>
    {:else}
      <p class="muted no-error">No errors reported in this session.</p>
    {/if}
  </div>
</section>

<style>
  .indicators {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .indicator__label {
    font-size: 13px;
  }

  .details {
    margin: var(--space-3) 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .details dd {
    margin: 2px 0 0;
    font-family: var(--font-mono);
    font-size: 13px;
    word-break: break-word;
  }

  .notice-line {
    margin: var(--space-2) 0 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .error-line {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-warning);
    background: var(--color-warning-surface);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius);
    padding: var(--space-2);
  }

  .no-error {
    margin: 0;
    font-size: 13px;
  }
</style>

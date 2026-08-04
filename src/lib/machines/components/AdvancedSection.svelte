<script lang="ts">
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import { connection, grblClient, isConnected, logSystemMessage } from '../../grbl/stores';
  import {
    BAUD_RATE_OPTIONS,
    type LineEnding,
  } from '../profiles/types';
  import {
    parseProfileImport,
    serializeProfile,
  } from '../profiles/validation';
  import {
    activeProfile,
    addProfile,
    resetProfileToDefaults,
    updateActiveProfile,
  } from '../stores/profiles';

  /**
   * Advanced connection settings and profile transfer.
   *
   * Timing changes apply to a live connection immediately, so a poll interval
   * can be tuned while watching the machine rather than by reconnecting.
   */

  const profile = $derived($activeProfile);

  let importError = $state<string | null>(null);
  let importNotice = $state<string | null>(null);
  let confirmingReset = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  function patchConnection(patch: Partial<typeof profile.connection>) {
    updateActiveProfile((current) => ({
      ...current,
      connection: { ...current.connection, ...patch },
    }));
  }

  function setPollInterval(value: number) {
    patchConnection({ statusPollIntervalMs: value });
    grblClient.setPollInterval(value);
  }

  function setCommandTimeout(value: number) {
    patchConnection({ commandTimeoutMs: value });
    grblClient.setCommandTimeout(value);
  }

  function setMotionIdleTimeout(value: number) {
    patchConnection({ motionIdleTimeoutMs: value });
    grblClient.setMotionIdleTimeout(value);
  }

  function setLineEnding(value: LineEnding) {
    patchConnection({ lineEnding: value });
    grblClient.setLineEnding(value);
  }

  function exportProfile() {
    const json = serializeProfile(profile);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    logSystemMessage(`Exported the profile "${profile.name}" as JSON.`);
  }

  async function importProfile(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    importError = null;
    importNotice = null;
    if (!file) return;

    try {
      const text = await file.text();
      const result = parseProfileImport(text);
      if (!result.ok || !result.profile) {
        importError = result.error ?? 'The profile could not be imported.';
        return;
      }
      const added = addProfile(result.profile);
      importNotice = `Imported "${added.name}" and selected it.`;
      logSystemMessage(`Imported the machine profile "${added.name}".`);
    } catch {
      importError = 'The file could not be read.';
    } finally {
      // Allows re-importing the same file after a correction.
      target.value = '';
    }
  }
</script>

<section class="panel">
  <h2>Advanced</h2>
  <p>
    Connection timing for this profile. Changes apply to the current session as
    well as to future connections.
  </p>

  <div class="field-grid">
    <div class="field">
      <label class="field__label" for="advanced-baud">Baud rate</label>
      <select
        id="advanced-baud"
        value={profile.connection.baudRate}
        disabled={$isConnected}
        onchange={(event) => patchConnection({ baudRate: Number(event.currentTarget.value) })}
      >
        {#each BAUD_RATE_OPTIONS as rate (rate)}
          <option value={rate}>{rate}</option>
        {/each}
      </select>
      <p class="field__hint">Locked while connected.</p>
    </div>

    <div class="field">
      <label class="field__label" for="advanced-poll">Status polling interval (ms)</label>
      <input
        id="advanced-poll"
        type="number"
        min="100"
        max="5000"
        step="50"
        value={profile.connection.statusPollIntervalMs}
        onchange={(event) => setPollInterval(Number(event.currentTarget.value))}
      />
      <p class="field__hint">
        How often <code>?</code> is sent. Polling pauses while the tab is hidden.
      </p>
    </div>

    <div class="field">
      <label class="field__label" for="advanced-timeout">Command acknowledgement timeout (ms)</label>
      <input
        id="advanced-timeout"
        type="number"
        min="500"
        max="60000"
        step="100"
        value={profile.connection.commandTimeoutMs}
        onchange={(event) => setCommandTimeout(Number(event.currentTarget.value))}
      />
      <p class="field__hint">
        Default acknowledgement budget for non-motion commands. G0/G1 allow a
        longer window while status reports show the controller is still running.
        Homing uses a longer allowance. Genuine serial silence fails sooner.
      </p>
    </div>

    <div class="field">
      <label class="field__label" for="advanced-idle-timeout">Motion Idle timeout (ms)</label>
      <input
        id="advanced-idle-timeout"
        type="number"
        min="1000"
        max="300000"
        step="1000"
        value={profile.connection.motionIdleTimeoutMs}
        onchange={(event) => setMotionIdleTimeout(Number(event.currentTarget.value))}
      />
      <p class="field__hint">
        How long to wait for GRBL Idle before pen up/down. Not a serial disconnect.
      </p>
    </div>

    <div class="field">
      <label class="field__label" for="advanced-line-ending">Line ending</label>
      <select
        id="advanced-line-ending"
        value={profile.connection.lineEnding}
        onchange={(event) => setLineEnding(event.currentTarget.value as LineEnding)}
      >
        <option value="lf">LF (\n)</option>
        <option value="crlf">CRLF (\r\n)</option>
      </select>
      <p class="field__hint">GRBL expects LF. Change this only if your build needs CRLF.</p>
    </div>
  </div>
</section>

<section class="panel panel--soft">
  <h3>Firmware information</h3>
  <dl class="details">
    <div>
      <dt class="section-label">Startup banner</dt>
      <dd>{$connection.rawFirmwareBanner ?? ($connection.bannerVersion ? `Grbl ${$connection.bannerVersion}` : 'Not received')}</dd>
    </div>
    <div>
      <dt class="section-label">Protocol</dt>
      <dd>{$connection.protocolLabel}</dd>
    </div>
    <div>
      <dt class="section-label">Version ($I)</dt>
      <dd>{$connection.firmwareVersion ?? '—'}</dd>
    </div>
    <div>
      <dt class="section-label">Raw build info</dt>
      <dd>{$connection.firmwareBuild ?? '—'}</dd>
    </div>
    <div>
      <dt class="section-label">Raw options</dt>
      <dd>{$connection.options ?? '—'}</dd>
    </div>
  </dl>
</section>

<section class="panel">
  <h3>Profile data</h3>

  <div class="btn-row transfer">
    <button type="button" class="btn" onclick={exportProfile}>
      Export profile as JSON
    </button>

    <button type="button" class="btn" onclick={() => fileInput?.click()}>
      Import profile from JSON
    </button>
    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      accept="application/json,.json"
      aria-label="Choose a machine profile JSON file"
      onchange={(event) => void importProfile(event)}
    />

    <button
      type="button"
      class="btn btn--danger"
      onclick={() => (confirmingReset = true)}
    >
      Reset profile to defaults
    </button>
  </div>

  <p class="help-text">
    Imported files are validated field by field and always create a new profile.
    Unknown keys are discarded, and pen safety confirmation is never inherited.
  </p>

  {#if importError}
    <p class="import-error" role="alert">{importError}</p>
  {/if}
  {#if importNotice}
    <p class="import-notice" role="status">{importNotice}</p>
  {/if}
</section>

<ConfirmDialog
  open={confirmingReset}
  title="Reset this profile to defaults?"
  message="Every setting in “{profile.name}” returns to the default XY plotter values, including the pen commands."
  detail="The profile name is kept. This cannot be undone."
  confirmLabel="Reset profile"
  onConfirm={() => {
    resetProfileToDefaults(profile.id);
    confirmingReset = false;
    logSystemMessage(`Reset the profile "${profile.name}" to defaults.`);
  }}
  onCancel={() => (confirmingReset = false)}
/>

<style>
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

  .transfer {
    margin: var(--space-3) 0;
  }

  .import-error {
    margin: var(--space-2) 0 0;
    font-size: 13px;
    color: var(--color-warning);
    border: 1px solid var(--color-warning);
    background: var(--color-warning-surface);
    border-radius: var(--radius);
    padding: var(--space-2);
  }

  .import-notice {
    margin: var(--space-2) 0 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }
</style>

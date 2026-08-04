<script lang="ts">
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import { isConnected } from '../../grbl/stores';
  import { hasPendingCommand, sendPenCommand } from '../actions';
  import { PEN_PRESETS, type PenPreset } from '../profiles/types';
  import { activeProfile, updateActiveProfile } from '../stores/profiles';

  /**
   * Pen mechanism configuration.
   *
   * Pen lift is the least standardised part of a pen plotter: some builds drive
   * a servo through spindle PWM, others switch a solenoid on the spindle enable
   * pin, and the S values differ per machine. Nothing is assumed here. Presets
   * fill the fields in, but the user reviews them and confirms once per profile
   * before the first test.
   */

  const pen = $derived($activeProfile.pen);

  const canTestUp = $derived(
    $isConnected && !$hasPendingCommand && pen.upCommand.trim().length > 0,
  );
  const canTestDown = $derived(
    $isConnected && !$hasPendingCommand && pen.downCommand.trim().length > 0,
  );

  let pendingTest = $state<'up' | 'down' | null>(null);

  function patchPen(patch: Partial<typeof pen>) {
    updateActiveProfile((profile) => ({
      ...profile,
      pen: { ...profile.pen, ...patch },
    }));
  }

  function applyPreset(value: PenPreset) {
    const preset = PEN_PRESETS.find((entry) => entry.value === value);
    if (!preset) return;
    if (value === 'custom') {
      patchPen({ preset: value });
      return;
    }
    // A new set of commands has to be re-confirmed before the next test.
    patchPen({
      preset: value,
      upCommand: preset.upCommand,
      downCommand: preset.downCommand,
      safetyAcknowledged: false,
    });
  }

  function requestTest(direction: 'up' | 'down') {
    if (!pen.safetyAcknowledged) {
      pendingTest = direction;
      return;
    }
    void runTest(direction);
  }

  async function runTest(direction: 'up' | 'down') {
    const command = direction === 'up' ? pen.upCommand : pen.downCommand;
    const delay = direction === 'up' ? pen.upDelayMs : pen.downDelayMs;
    await sendPenCommand(command, delay);
  }

  async function confirmAndTest() {
    const direction = pendingTest;
    pendingTest = null;
    if (!direction) return;
    patchPen({ safetyAcknowledged: true });
    await runTest(direction);
  }

  const activePresetDescription = $derived(
    PEN_PRESETS.find((entry) => entry.value === pen.preset)?.description ?? '',
  );
</script>

<section class="panel">
  <div class="panel__header">
    <h2>Pen</h2>
    <span class="badge {pen.upCommand && pen.downCommand ? 'badge--ok' : 'badge--soft'}">
      {pen.upCommand && pen.downCommand ? 'Configured' : 'Incomplete'}
    </span>
  </div>

  <p>
    Enter the commands your machine actually uses to raise and lower the pen.
    They are stored in the machine profile and sent verbatim.
  </p>

  <div class="field preset">
    <label class="field__label" for="pen-preset">Preset</label>
    <select
      id="pen-preset"
      value={pen.preset}
      onchange={(event) => applyPreset(event.currentTarget.value as PenPreset)}
    >
      {#each PEN_PRESETS as preset (preset.value)}
        <option value={preset.value}>{preset.label}</option>
      {/each}
    </select>
    <p class="field__hint">{activePresetDescription}</p>
  </div>

  <div class="callout">
    <span class="callout__arrow" aria-hidden="true">→</span>
    <span>
      A preset only fills the fields in. Check the commands against your own
      hardware before testing: the correct values are build-specific.
    </span>
  </div>

  <div class="field-grid pen-grid">
    <div class="field">
      <label class="field__label" for="pen-up-command">Pen up command</label>
      <input
        id="pen-up-command"
        type="text"
        placeholder="e.g. M5"
        value={pen.upCommand}
        onchange={(event) =>
          patchPen({ upCommand: event.currentTarget.value, preset: 'custom' })}
      />
      <p class="field__hint">Sent as a normal queued command.</p>
    </div>

    <div class="field">
      <label class="field__label" for="pen-down-command">Pen down command</label>
      <input
        id="pen-down-command"
        type="text"
        placeholder="e.g. M3 S90"
        value={pen.downCommand}
        onchange={(event) =>
          patchPen({ downCommand: event.currentTarget.value, preset: 'custom' })}
      />
      <p class="field__hint">Sent as a normal queued command.</p>
    </div>

    <div class="field">
      <label class="field__label" for="pen-up-delay">Pen up delay (ms)</label>
      <input
        id="pen-up-delay"
        type="number"
        min="0"
        max="10000"
        step="50"
        value={pen.upDelayMs}
        onchange={(event) => patchPen({ upDelayMs: Number(event.currentTarget.value) })}
      />
      <p class="field__hint">Time allowed for the mechanism to finish moving.</p>
    </div>

    <div class="field">
      <label class="field__label" for="pen-down-delay">Pen down delay (ms)</label>
      <input
        id="pen-down-delay"
        type="number"
        min="0"
        max="10000"
        step="50"
        value={pen.downDelayMs}
        onchange={(event) => patchPen({ downDelayMs: Number(event.currentTarget.value) })}
      />
      <p class="field__hint">Time allowed for the mechanism to finish moving.</p>
    </div>
  </div>

  <hr class="divider" />

  <div class="btn-row">
    <button
      type="button"
      class="btn btn--primary"
      disabled={!canTestUp}
      onclick={() => requestTest('up')}
    >
      Test pen up
    </button>
    <button
      type="button"
      class="btn btn--primary"
      disabled={!canTestDown}
      onclick={() => requestTest('down')}
    >
      Test pen down
    </button>
  </div>

  <p class="help-text">
    {#if !$isConnected}
      Connect the machine to test the pen.
    {:else if !pen.upCommand || !pen.downCommand}
      Each test button becomes available once its command has a value.
    {:else}
      Both commands appear in the Console as they are sent.
    {/if}
  </p>
</section>

<ConfirmDialog
  open={pendingTest !== null}
  title="Test the pen mechanism?"
  message="Confirm that the pen mechanism can move safely and that the configured GRBL command is correct."
  detail={pendingTest === 'up'
    ? `The command "${pen.upCommand}" will be sent to the machine.`
    : `The command "${pen.downCommand}" will be sent to the machine.`}
  confirmLabel="Send command"
  tone="caution"
  onConfirm={() => void confirmAndTest()}
  onCancel={() => (pendingTest = null)}
/>

<style>
  .preset {
    max-width: 320px;
    margin-bottom: var(--space-3);
  }

  .pen-grid {
    margin-top: var(--space-4);
  }
</style>

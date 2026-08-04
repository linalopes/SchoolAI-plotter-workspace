<script lang="ts">
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import { COMMAND_NOTES, COMMANDS } from '../../grbl/commands';
  import { connection, isConnected, machineStatus } from '../../grbl/stores';
  import { preferences, updatePreferences } from '../../stores/preferences';
  import { formatCoordinate } from '../../utils/misc';
  import {
    goToWorkZero,
    homeAvailability,
    homeMachine,
    jog,
    jogAvailability,
    pauseMachine,
    requestStatusNow,
    resumeMachine,
    setWorkZero,
    softReset,
    unlockMachine,
  } from '../actions';
  import { JOG_STEP_OPTIONS, type JogStep } from '../profiles/types';
  import { activeProfile, updateActiveProfile } from '../stores/profiles';

  /**
   * Manual machine control.
   *
   * Every button that causes motion is gated by `jogAvailability`, and the
   * three actions that can move the machine unexpectedly — homing, travelling
   * to work zero, and soft reset — additionally require a confirmation.
   *
   * Jog controls are intentionally not bound to global key handlers in this
   * milestone: typing in the console must never move the machine.
   */

  const step = $derived($preferences.jogStep);
  const feedRate = $derived($activeProfile.motion.jogFeedRateMmPerMin);

  const stateLabel = $derived(
    $machineStatus?.state ?? ($isConnected ? 'Connected' : 'Disconnected'),
  );
  const workPosition = $derived($machineStatus?.wpos ?? null);
  const machinePosition = $derived($machineStatus?.mpos ?? null);

  const canJog = $derived($jogAvailability.enabled);
  const blockedReason = $derived($jogAvailability.reason);
  const canHome = $derived($homeAvailability.enabled);
  const homeBlockedReason = $derived($homeAvailability.reason);

  const usesLegacyJog = $derived(
    $isConnected && !$connection.capabilities.supportsJogCommand,
  );

  const isAlarm = $derived($machineStatus?.state === 'Alarm');
  const isHold = $derived($machineStatus?.state === 'Hold');
  const isMoving = $derived(
    $machineStatus?.state === 'Run' ||
      $machineStatus?.state === 'Jog' ||
      $machineStatus?.state === 'Home',
  );

  type PendingAction = 'home' | 'work-zero' | 'soft-reset' | null;
  let pendingAction = $state<PendingAction>(null);

  const dialogContent = $derived.by(() => {
    switch (pendingAction) {
      case 'home':
        return {
          title: 'Run the homing cycle?',
          message:
            'The machine will move towards its limit switches at the homing speed configured in the firmware.',
          detail: COMMAND_NOTES[COMMANDS.home],
          confirmLabel: 'Run homing ($H)',
        };
      case 'work-zero':
        return {
          title: 'Travel to work zero?',
          message:
            'The machine will move in a straight line to work zero at rapid speed.',
          detail: COMMAND_NOTES[COMMANDS.goToWorkZero],
          confirmLabel: 'Go to work zero',
        };
      case 'soft-reset':
        return {
          title: 'Soft reset the controller?',
          message:
            'The controller restarts its interpreter and abandons any queued motion. The machine position may be lost.',
          detail:
            'Sent as the single byte 0x18. After a reset, re-home the machine before relying on coordinates.',
          confirmLabel: 'Send soft reset',
        };
      default:
        return null;
    }
  });

  async function runPendingAction() {
    const action = pendingAction;
    pendingAction = null;
    if (action === 'home') await homeMachine();
    else if (action === 'work-zero') await goToWorkZero();
    else if (action === 'soft-reset') await softReset();
  }

  function setStep(value: JogStep) {
    updatePreferences({ jogStep: value });
  }

  function setFeedRate(value: number) {
    updateActiveProfile((profile) => ({
      ...profile,
      motion: { ...profile.motion, jogFeedRateMmPerMin: value },
    }));
  }
</script>

<section class="panel">
  <div class="panel__header">
    <h2>Manual control</h2>
    <div class="header-badges">
      {#if $connection.kind === 'demo' && $isConnected}
        <span class="badge badge--accent">Demo connection</span>
      {/if}
      <span class="badge {isAlarm ? 'badge--warn' : $isConnected ? 'badge--ok' : 'badge--soft'}">
        {stateLabel}
      </span>
    </div>
  </div>

  <div class="readout">
    <div class="readout__block">
      <p class="section-label">Work position</p>
      <p class="readout__value">
        X {formatCoordinate(workPosition?.x)}<br />
        Y {formatCoordinate(workPosition?.y)}
      </p>
    </div>
    <div class="readout__block">
      <p class="section-label">Machine position</p>
      <p class="readout__value readout__value--muted">
        X {formatCoordinate(machinePosition?.x)}<br />
        Y {formatCoordinate(machinePosition?.y)}
      </p>
    </div>
    <div class="readout__block">
      <p class="section-label">Jog step</p>
      <p class="readout__value">{step} mm</p>
    </div>
    <div class="readout__block">
      <p class="section-label">Jog feed rate</p>
      <p class="readout__value">{feedRate} mm/min</p>
    </div>
  </div>

  {#if blockedReason}
    <p class="blocked" role="status">{blockedReason}</p>
  {/if}

  {#if usesLegacyJog}
    <div class="callout legacy-notice" role="note">
      <span class="callout__arrow" aria-hidden="true">→</span>
      <div>
        <strong>Legacy GRBL jogging</strong>
        <p>
          This controller uses GRBL 0.9. Manual movement uses temporary
          incremental G-code instead of the GRBL 1.1 $J= command.
        </p>
      </div>
    </div>
  {/if}
</section>

<div class="columns">
  <section class="panel">
    <h3>Jog</h3>

    <fieldset class="steps">
      <legend class="field__label">Step size</legend>
      <div class="steps__options">
        {#each JOG_STEP_OPTIONS as option (option)}
          <label class="step-option" class:step-option--active={step === option}>
            <input
              type="radio"
              name="jog-step"
              value={option}
              checked={step === option}
              onchange={() => setStep(option)}
            />
            <span>{option} mm</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="field feed">
      <label class="field__label" for="jog-feed">Feed rate (mm/min)</label>
      <input
        id="jog-feed"
        type="number"
        min="1"
        max="20000"
        step="10"
        value={feedRate}
        onchange={(event) => setFeedRate(Number(event.currentTarget.value))}
      />
      <p class="field__hint">Stored in the machine profile.</p>
    </div>

    <!--
      A three-by-three pad. The centre holds a status request rather than a
      motion command, so a mis-aimed click cannot move the machine.
    -->
    <div class="pad" role="group" aria-label="Jog controls">
      <div class="pad__cell"></div>
      <button
        type="button"
        class="btn pad__btn"
        disabled={!canJog}
        onclick={() => void jog('Y', 1, step)}
      >
        <span aria-hidden="true">↑</span>
        <span class="visually-hidden">Jog Y positive by {step} millimetres</span>
        <span class="pad__label" aria-hidden="true">Y+</span>
      </button>
      <div class="pad__cell"></div>

      <button
        type="button"
        class="btn pad__btn"
        disabled={!canJog}
        onclick={() => void jog('X', -1, step)}
      >
        <span aria-hidden="true">←</span>
        <span class="visually-hidden">Jog X negative by {step} millimetres</span>
        <span class="pad__label" aria-hidden="true">X−</span>
      </button>
      <button
        type="button"
        class="btn pad__btn pad__btn--center"
        disabled={!$isConnected}
        onclick={() => void requestStatusNow()}
        title="Request a status report (?)"
      >
        <span aria-hidden="true">?</span>
        <span class="visually-hidden">Request a status report</span>
      </button>
      <button
        type="button"
        class="btn pad__btn"
        disabled={!canJog}
        onclick={() => void jog('X', 1, step)}
      >
        <span aria-hidden="true">→</span>
        <span class="visually-hidden">Jog X positive by {step} millimetres</span>
        <span class="pad__label" aria-hidden="true">X+</span>
      </button>

      <div class="pad__cell"></div>
      <button
        type="button"
        class="btn pad__btn"
        disabled={!canJog}
        onclick={() => void jog('Y', -1, step)}
      >
        <span aria-hidden="true">↓</span>
        <span class="visually-hidden">Jog Y negative by {step} millimetres</span>
        <span class="pad__label" aria-hidden="true">Y−</span>
      </button>
      <div class="pad__cell"></div>
    </div>

    <div class="z-axis">
      <p class="section-label">Z axis</p>
      <div class="btn-row">
        <button type="button" class="btn btn--small" disabled aria-describedby="z-note">
          Z+
        </button>
        <button type="button" class="btn btn--small" disabled aria-describedby="z-note">
          Z−
        </button>
      </div>
      <p id="z-note" class="help-text">Not used by this XY pen plotter profile.</p>
    </div>

    <p class="help-text">
      Each click sends one finite jog command. Continuous jogging is not part of
      this milestone.
    </p>
  </section>

  <section class="panel">
    <h3>Machine actions</h3>

    <div class="actions">
      <div class="action">
        <button
          type="button"
          class="btn"
          disabled={!canHome}
          onclick={() => (pendingAction = 'home')}
        >
          Home
        </button>
        <p class="help-text">
          {#if homeBlockedReason}
            {homeBlockedReason}
          {:else}
            {COMMAND_NOTES[COMMANDS.home]}
          {/if}
        </p>
      </div>

      <div class="action">
        <button
          type="button"
          class="btn"
          disabled={!$isConnected}
          onclick={() => void unlockMachine()}
        >
          Unlock
        </button>
        <p class="help-text">{COMMAND_NOTES[COMMANDS.unlock]}</p>
      </div>

      <div class="action">
        <button
          type="button"
          class="btn"
          disabled={!canJog}
          onclick={() => void setWorkZero()}
        >
          Set current position as work zero
        </button>
        <p class="help-text">{COMMAND_NOTES[COMMANDS.setWorkZero]}</p>
      </div>

      <div class="action">
        <button
          type="button"
          class="btn"
          disabled={!canJog}
          onclick={() => (pendingAction = 'work-zero')}
        >
          Go to work zero
        </button>
        <p class="help-text">{COMMAND_NOTES[COMMANDS.goToWorkZero]}</p>
      </div>
    </div>

    <hr class="divider" />

    <p class="section-label">Motion control</p>
    <div class="actions actions--tight">
      <div class="action">
        <button
          type="button"
          class="btn btn--accent"
          disabled={!$isConnected || !isMoving}
          onclick={() => void pauseMachine()}
        >
          Pause
        </button>
        <p class="help-text">
          Feed hold (!). Decelerates and holds. This is not an emergency stop.
        </p>
      </div>

      <div class="action">
        <button
          type="button"
          class="btn btn--go"
          disabled={!$isConnected || !isHold}
          onclick={() => void resumeMachine()}
        >
          Resume
        </button>
        <p class="help-text">Cycle start (~). Continues the held motion.</p>
      </div>

      <div class="action">
        <button
          type="button"
          class="btn btn--danger"
          disabled={!$isConnected}
          onclick={() => (pendingAction = 'soft-reset')}
        >
          Soft reset
        </button>
        <p class="help-text">
          Sends byte 0x18. Restarts the controller's interpreter.
        </p>
      </div>
    </div>

    <div class="callout callout--warn safety">
      <span class="callout__arrow" aria-hidden="true">→</span>
      <span>
        Software controls are not a replacement for a physical emergency stop.
        Keep the machine's power switch within reach and start with small jog
        distances.
      </span>
    </div>
  </section>
</div>

{#if dialogContent}
  <ConfirmDialog
    open={pendingAction !== null}
    title={dialogContent.title}
    message={dialogContent.message}
    detail={dialogContent.detail}
    confirmLabel={dialogContent.confirmLabel}
    tone="caution"
    onConfirm={() => void runPendingAction()}
    onCancel={() => (pendingAction = null)}
  />
{/if}

<style>
  .header-badges {
    display: flex;
    gap: var(--space-2);
  }

  .readout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-3);
  }

  .readout__block p {
    margin: 0;
  }

  .readout__value {
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.35;
    margin-top: 2px;
  }

  .readout__value--muted {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .blocked {
    margin: var(--space-3) 0 0;
    font-size: 13px;
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    border-left: 2px solid var(--color-line-strong);
    padding-left: var(--space-2);
  }

  .legacy-notice {
    margin-top: var(--space-3);
  }

  .legacy-notice strong {
    display: block;
    font-family: var(--font-title);
    font-weight: 500;
    margin-bottom: var(--space-1);
  }

  .legacy-notice p {
    margin: 0;
  }

  .columns {
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    gap: var(--space-4);
    align-items: start;
  }

  .steps {
    border: 0;
    padding: 0;
    margin: var(--space-3) 0 0;
  }

  .steps legend {
    padding: 0;
  }

  .steps__options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .step-option {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
  }

  .step-option input {
    /* The label itself is the control surface; the radio stays reachable for
       assistive technology and keyboard focus. */
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }

  .step-option:has(input:focus-visible) {
    outline: 2px solid var(--color-deep-purple);
    outline-offset: 2px;
  }

  .step-option--active {
    background: var(--color-deep-purple);
    color: var(--color-white);
  }

  .feed {
    margin-top: var(--space-3);
    max-width: 180px;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-1);
    margin: var(--space-4) 0;
    max-width: 260px;
  }

  .pad__cell {
    aspect-ratio: 1;
  }

  .pad__btn {
    aspect-ratio: 1;
    font-family: var(--font-mono);
    font-size: 20px;
    flex-direction: column;
    gap: 0;
  }

  .pad__btn--center {
    font-size: 16px;
    background: var(--color-surface-soft);
  }

  .pad__label {
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .z-axis {
    border-top: var(--border);
    padding-top: var(--space-3);
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .actions--tight {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }

  .action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .action .btn {
    width: 100%;
  }

  .safety {
    margin-top: var(--space-4);
  }
</style>

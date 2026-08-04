<script lang="ts">
  import { connection, displayState } from '../grbl/stores';
  import { activeProfile } from '../machines/stores/profiles';
  import { activeTab, machinesSection } from '../stores/navigation';

  /**
   * Compact machine status shown in the header on every tab.
   *
   * The label combines the profile name with the live GRBL state so the user
   * always knows which machine the status refers to. Clicking it opens the
   * Machines tab rather than a popover: this milestone keeps one destination
   * for machine detail.
   */

  type Tone = 'neutral' | 'active' | 'ready' | 'warning';

  const tone = $derived.by((): Tone => {
    const phase = $connection.phase;
    if (phase === 'disconnected') return 'neutral';
    if (phase === 'connecting' || phase === 'handshaking') return 'active';
    if (phase === 'disconnecting') return 'neutral';

    switch ($displayState) {
      case 'Alarm':
      case 'Door':
        return 'warning';
      case 'Run':
      case 'Jog':
      case 'Home':
        return 'active';
      default:
        return 'ready';
    }
  });

  const isDemo = $derived($connection.kind === 'demo' && $connection.phase !== 'disconnected');

  const label = $derived(`${$activeProfile.name} · ${$displayState}`);

  const detail = $derived.by(() => {
    if ($connection.phase === 'disconnected') {
      return 'No machine connected. Open Machines to connect.';
    }
    if (isDemo) return 'Demo connection. No physical machine is attached.';
    return `Connected through Web Serial. State: ${$displayState}.`;
  });

  function open() {
    activeTab.goTo('machines');
    machinesSection.set('overview');
  }
</script>

<button
  type="button"
  class="status status--{tone}"
  class:status--pulse={tone === 'active'}
  onclick={open}
  title={detail}
>
  <span class="status__dot" aria-hidden="true"></span>
  <span class="status__label">{label}</span>
  {#if isDemo}
    <span class="status__tag">Demo</span>
  {/if}
  <span class="visually-hidden">— {detail} Activate to open the Machines tab.</span>
</button>

<!--
  Status changes are announced politely so screen reader users hear state
  transitions without the interface narrating every poll.
-->
<span class="visually-hidden" role="status" aria-live="polite">{label}</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--color-gray-green);
    background: transparent;
    color: var(--color-gray-green);
    cursor: pointer;
    white-space: nowrap;
  }

  .status:hover {
    border-color: var(--color-white);
    color: var(--color-white);
  }

  .status__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    flex: none;
  }

  /* Deep Purple text on Turquoise for connected and idle states. */
  .status--ready {
    background: var(--color-turquoise);
    border-color: var(--color-turquoise);
    color: var(--color-deep-purple);
  }

  .status--ready:hover {
    color: var(--color-deep-purple);
    border-color: var(--color-white);
  }

  .status--active {
    background: var(--color-pink);
    border-color: var(--color-pink);
    color: var(--color-deep-purple);
  }

  .status--active:hover {
    color: var(--color-deep-purple);
    border-color: var(--color-white);
  }

  /* Faults are not just a colour: the border thickens and the dot squares off. */
  .status--warning {
    background: var(--color-warning-surface);
    border: 2px solid var(--color-warning);
    color: var(--color-warning);
  }

  .status--warning:hover {
    color: var(--color-warning);
  }

  .status--warning .status__dot {
    border-radius: 1px;
  }

  .status--pulse .status__dot {
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }

  .status__tag {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0 4px;
  }
</style>

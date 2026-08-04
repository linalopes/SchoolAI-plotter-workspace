<script lang="ts">
  import { grblClient, grblSettings, isConnected } from '../../grbl/stores';
  import { hasPendingCommand } from '../actions';

  /**
   * Read-only view of the controller's `$$` settings.
   *
   * Writing EEPROM settings changes how the machine physically moves and can
   * make it crash into its own frame, so this milestone reads them and stops
   * there.
   */

  let reading = $state(false);

  async function readSettings() {
    reading = true;
    try {
      await grblClient.requestSettings();
    } finally {
      reading = false;
    }
  }

  const futureTools = [
    {
      title: 'Measure X travel',
      description:
        'Guided procedure to compare commanded and measured distance along X.',
    },
    {
      title: 'Measure Y travel',
      description:
        'Guided procedure to compare commanded and measured distance along Y.',
    },
    {
      title: 'Draw calibration square',
      description: 'Plot a known square to check scale and squareness.',
    },
    {
      title: 'Draw calibration circle',
      description: 'Plot a known circle to check backlash and roundness.',
    },
  ];
</script>

<section class="panel">
  <div class="panel__header">
    <h2>Calibration</h2>
    <span class="badge badge--soft">Read-only</span>
  </div>

  <div class="callout callout--warn">
    <span class="callout__arrow" aria-hidden="true">→</span>
    <span>GRBL settings affect physical motion and are read-only in this milestone.</span>
  </div>

  <div class="btn-row actions">
    <button
      type="button"
      class="btn btn--primary"
      disabled={!$isConnected || reading || $hasPendingCommand}
      onclick={() => void readSettings()}
    >
      {reading ? 'Reading…' : 'Read GRBL settings'}
    </button>
    <span class="help-text">Sends <code>$$</code> and parses the response.</span>
  </div>

  {#if $grblSettings.length === 0}
    <p class="muted empty-note">
      {#if $isConnected}
        No settings have been read yet. Use “Read GRBL settings”.
      {:else}
        Connect the machine to read its settings.
      {/if}
    </p>
  {:else}
    <table class="data-table">
      <caption class="visually-hidden">
        GRBL settings reported by the controller
      </caption>
      <thead>
        <tr>
          <th scope="col">Key</th>
          <th scope="col">Value</th>
          <th scope="col">Unit</th>
          <th scope="col">Description</th>
        </tr>
      </thead>
      <tbody>
        {#each $grblSettings as setting (setting.key)}
          <tr>
            <th scope="row" class="key">${setting.key}</th>
            <td>{setting.value}</td>
            <td class="muted">{setting.unit ?? ''}</td>
            <td>{setting.label ?? 'Not documented in this application'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="panel panel--soft">
  <div class="panel__header">
    <h3>Calibration procedures</h3>
    <span class="badge badge--soft">Coming later</span>
  </div>

  <div class="cards">
    {#each futureTools as tool (tool.title)}
      <article class="card">
        <h4>{tool.title}</h4>
        <p class="card__text">{tool.description}</p>
        <span class="badge badge--soft">Coming later</span>
      </article>
    {/each}
  </div>
</section>

<style>
  .actions {
    align-items: center;
    margin: var(--space-3) 0;
  }

  .actions .help-text {
    margin: 0;
  }

  .empty-note {
    font-size: 13px;
    margin: 0;
  }

  .key {
    font-weight: 700;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .card {
    border: var(--border);
    border-radius: var(--radius);
    background: var(--color-white);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .card__text {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }
</style>

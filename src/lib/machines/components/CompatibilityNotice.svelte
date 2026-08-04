<script lang="ts">
  import { serialEnvironment } from '../../grbl/stores';

  /**
   * Web Serial availability notice.
   *
   * Shown wherever serial controls appear. The two failure modes need different
   * remedies, so they are reported separately rather than merged into one
   * "unsupported" message. The rest of the application stays usable either way.
   */
  const unavailable = !serialEnvironment.supported || !serialEnvironment.secureContext;
</script>

{#if unavailable}
  <div class="notice" role="note">
    <h3 class="notice__title">Serial connection is not available in this browser</h3>
    <p class="notice__text">
      Open this application in desktop Google Chrome using HTTPS or localhost.
    </p>

    <ul class="notice__list">
      <li>
        <span class="badge badge--warn">
          {serialEnvironment.supported ? 'Available' : 'Missing'}
        </span>
        <span>Web Serial API in this browser</span>
      </li>
      <li>
        <span class="badge badge--warn">
          {serialEnvironment.secureContext ? 'Secure' : 'Not secure'}
        </span>
        <span>Secure context (HTTPS or localhost)</span>
      </li>
    </ul>

    <p class="notice__text notice__text--muted">
      Demo mode still works, and the Generate, Prepare, and Guide sections remain
      fully usable as a design interface.
    </p>
  </div>
{/if}

<style>
  .notice {
    border: 2px solid var(--color-warning);
    border-radius: var(--radius);
    background: var(--color-warning-surface);
    padding: var(--space-3);
    color: var(--color-warning);
  }

  .notice__title {
    font-size: 15px;
    font-weight: 500;
    margin-bottom: var(--space-2);
  }

  .notice__text {
    margin-bottom: var(--space-2);
    color: var(--color-deep-purple);
  }

  .notice__text--muted {
    margin-bottom: 0;
    font-size: 13px;
  }

  .notice__list {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-deep-purple);
    font-size: 13px;
  }

  .notice__list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
</style>

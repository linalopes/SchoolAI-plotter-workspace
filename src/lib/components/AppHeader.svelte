<script lang="ts">
  import { APP_CONFIG } from '../config';
  import MachineStatus from './MachineStatus.svelte';
  import PrimaryTabs from './PrimaryTabs.svelte';
</script>

<header class="app-header header on-dark">
  <div class="header__identity">
    <span class="header__product">{APP_CONFIG.productName}</span>
    <span class="header__org">{APP_CONFIG.organization.name}</span>
  </div>

  <PrimaryTabs />

  <div class="header__status">
    <MachineStatus />
  </div>
</header>

<style>
  .header {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
    align-items: center;
    column-gap: var(--space-4);
    /* Height is locked by the .app grid row + global .app-header rule. */
    overflow: hidden;
    padding: 0 var(--space-4);
    background: var(--color-deep-purple);
    color: var(--color-white);
    box-sizing: border-box;
  }

  .header__identity {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    line-height: 1.2;
    min-width: 0;
    overflow: hidden;
  }

  .header__product {
    font-family: var(--font-title);
    font-weight: 500;
    font-size: 17px;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Typographic reference only. No logo asset is used yet. */
  .header__org {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-gray-green);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header__status {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }
</style>

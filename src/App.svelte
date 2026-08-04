<script lang="ts">
  import AppFooter from './lib/components/AppFooter.svelte';
  import AppHeader from './lib/components/AppHeader.svelte';
  import { APP_CONFIG } from './lib/config';
  import { activeTab } from './lib/stores/navigation';
  import GenerateView from './views/GenerateView.svelte';
  import GuideView from './views/GuideView.svelte';
  import MachinesView from './views/MachinesView.svelte';
  import PrepareView from './views/PrepareView.svelte';

  /**
   * Application shell.
   *
   * The four primary sections are mounted one at a time. Machines is
   * deliberately re-created on entry rather than kept alive: the serial
   * connection lives in a module-level store, so nothing about the machine
   * session depends on a component staying mounted.
   */
  $effect(() => {
    document.title = `${APP_CONFIG.productName} — ${APP_CONFIG.organization.name}`;
  });
</script>

<div class="app">
  <AppHeader />

  <main class="app__body">
    {#if $activeTab === 'generate'}
      <div class="app__panel" role="tabpanel" id="panel-generate" aria-labelledby="tab-generate">
        <GenerateView />
      </div>
    {:else if $activeTab === 'prepare'}
      <div class="app__panel" role="tabpanel" id="panel-prepare" aria-labelledby="tab-prepare">
        <PrepareView />
      </div>
    {:else if $activeTab === 'machines'}
      <div class="app__panel" role="tabpanel" id="panel-machines" aria-labelledby="tab-machines">
        <MachinesView />
      </div>
    {:else}
      <div class="app__panel" role="tabpanel" id="panel-guide" aria-labelledby="tab-guide">
        <GuideView />
      </div>
    {/if}
  </main>

  <AppFooter />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }

  .app__body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }

  .app__panel {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }
</style>

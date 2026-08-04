<script lang="ts">
  import { isConnected } from '../../grbl/stores';
  import {
    activeProfile,
    createProfile,
    profiles,
    selectProfile,
  } from '../stores/profiles';

  /**
   * Profile selector for the Machines sidebar.
   *
   * Switching profiles while connected would change the baud rate and pen
   * commands underneath a live session, so the selector locks during a
   * connection instead of silently applying a different configuration.
   */
</script>

<div class="selector">
  <div class="field">
    <label class="field__label" for="machine-profile">Machine profile</label>
    <select
      id="machine-profile"
      value={$activeProfile.id}
      disabled={$isConnected}
      onchange={(event) => selectProfile(event.currentTarget.value)}
    >
      {#each $profiles as profile (profile.id)}
        <option value={profile.id}>{profile.name}</option>
      {/each}
    </select>
  </div>

  <button
    type="button"
    class="btn btn--small selector__add"
    disabled={$isConnected}
    onclick={() => createProfile()}
  >
    Add machine
  </button>

  {#if $isConnected}
    <p class="help-text">Disconnect to switch or add a machine profile.</p>
  {/if}
</div>

<style>
  .selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .selector__add {
    align-self: flex-start;
  }
</style>

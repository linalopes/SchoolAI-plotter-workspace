<script lang="ts">
  import { connection, displayState, isConnected, machineStatus } from '../../grbl/stores';
  import { machinesSection } from '../../stores/navigation';
  import { formatCoordinate } from '../../utils/misc';
  import { connectFromUi, disconnectFromUi } from '../actions';
  import {
    activeProfile,
    deleteProfile,
    duplicateProfile,
    profiles,
    renameProfile,
  } from '../stores/profiles';
  import { MACHINE_TYPE_OPTIONS } from '../profiles/types';
  import CompatibilityNotice from './CompatibilityNotice.svelte';

  /**
   * Machine summary and profile management.
   *
   * Everything here is read-only except the profile name, so the section can be
   * used as a status board while a job is being set up.
   */

  let connecting = $state(false);
  let renaming = $state(false);
  let draftName = $state('');

  const typeLabel = $derived(
    MACHINE_TYPE_OPTIONS.find((option) => option.value === $activeProfile.type)?.label ??
      'Unknown',
  );

  const grblVersion = $derived(
    $connection.firmwareVersion ?? $connection.bannerVersion ?? 'Not detected',
  );

  const buildInfo = $derived(
    $connection.firmwareBuild ? `Build ${$connection.firmwareBuild}` : null,
  );

  const penConfigured = $derived(
    $activeProfile.pen.upCommand.length > 0 &&
      $activeProfile.pen.downCommand.length > 0,
  );

  const penStatus = $derived.by(() => {
    const { upCommand, downCommand } = $activeProfile.pen;
    if (upCommand.length > 0 && downCommand.length > 0) return 'Configured';
    if (upCommand.length > 0 || downCommand.length > 0) return 'Partly configured';
    return 'Not configured';
  });

  const workPosition = $derived($machineStatus?.wpos ?? null);
  const machinePosition = $derived($machineStatus?.mpos ?? null);

  const canDelete = $derived($profiles.length > 1);

  async function onConnect() {
    connecting = true;
    try {
      await connectFromUi();
    } catch {
      // The client reports the failure through the connection store and the
      // console; no second error surface is needed here.
    } finally {
      connecting = false;
    }
  }

  function startRename() {
    draftName = $activeProfile.name;
    renaming = true;
  }

  function commitRename() {
    renameProfile($activeProfile.id, draftName);
    renaming = false;
  }
</script>

<CompatibilityNotice />

<section class="panel">
  <div class="panel__header">
    <h2>{$activeProfile.name}</h2>
    <span class="badge {$isConnected ? 'badge--ok' : 'badge--soft'}">
      {$displayState}
    </span>
  </div>

  <dl class="grid">
    <div class="grid__item">
      <dt class="section-label">Profile</dt>
      <dd>{$activeProfile.name}</dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Machine type</dt>
      <dd>{typeLabel}</dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Firmware</dt>
      <dd>GRBL</dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Connection</dt>
      <dd>
        {#if $connection.kind === 'demo' && $isConnected}
          Demo connection
        {:else if $isConnected}
          Web Serial
        {:else}
          Disconnected
        {/if}
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Detected GRBL version</dt>
      <dd>
        {grblVersion}
        {#if buildInfo}<span class="muted"> · {buildInfo}</span>{/if}
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Protocol</dt>
      <dd>
        {$connection.protocolLabel}
        {#if $isConnected && !$connection.capabilities.supportsJogCommand}
          <span class="muted"> · legacy jogging</span>
        {:else if $isConnected && $connection.capabilities.supportsJogCommand}
          <span class="muted"> · $J= jogging</span>
        {/if}
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Startup banner</dt>
      <dd class="banner">
        {$connection.rawFirmwareBanner ?? '—'}
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Machine state</dt>
      <dd>{$machineStatus?.state ?? '—'}</dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Work position</dt>
      <dd>
        X {formatCoordinate(workPosition?.x)} &nbsp; Y {formatCoordinate(workPosition?.y)}
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Machine position</dt>
      <dd>
        X {formatCoordinate(machinePosition?.x)} &nbsp; Y {formatCoordinate(machinePosition?.y)}
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Workspace</dt>
      <dd>
        {$activeProfile.workspace.widthMm} × {$activeProfile.workspace.heightMm} mm
      </dd>
    </div>
    <div class="grid__item">
      <dt class="section-label">Pen configuration</dt>
      <dd>
        {penStatus}
        {#if !penConfigured}
          <span class="muted"> · set the commands in Pen</span>
        {/if}
      </dd>
    </div>
  </dl>

  <hr class="divider" />

  <div class="btn-row">
    {#if $isConnected}
      <button type="button" class="btn" onclick={() => void disconnectFromUi()}>
        Disconnect
      </button>
    {:else}
      <button
        type="button"
        class="btn btn--primary"
        disabled={connecting}
        onclick={() => void onConnect()}
      >
        {connecting ? 'Connecting…' : 'Connect'}
      </button>
    {/if}

    <button
      type="button"
      class="btn"
      onclick={() => machinesSection.set('manual-control')}
    >
      Open Manual Control
    </button>
  </div>

  <p class="overview__hint">
    {#if $isConnected && $connection.kind === 'demo'}
      Demo connection. Commands go to a simulated controller; no machine is
      attached.
    {:else if $isConnected}
      Connected through Web Serial. Commands remain local to this browser session.
    {:else}
      Connect the plotter through USB to begin testing movement and pen controls.
    {/if}
  </p>
</section>

<section class="panel panel--soft">
  <div class="panel__header">
    <h3>Profile management</h3>
  </div>

  {#if renaming}
    <div class="rename">
      <div class="field rename__field">
        <label class="field__label" for="profile-rename">Profile name</label>
        <input
          id="profile-rename"
          type="text"
          bind:value={draftName}
          maxlength="64"
          onkeydown={(event) => {
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') renaming = false;
          }}
        />
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" onclick={commitRename}>
          Save name
        </button>
        <button type="button" class="btn" onclick={() => (renaming = false)}>
          Cancel
        </button>
      </div>
    </div>
  {:else}
    <div class="btn-row">
      <button type="button" class="btn" onclick={startRename}>Rename</button>
      <button
        type="button"
        class="btn"
        onclick={() => duplicateProfile($activeProfile.id)}
      >
        Duplicate
      </button>
      <button
        type="button"
        class="btn btn--danger"
        disabled={!canDelete}
        onclick={() => deleteProfile($activeProfile.id)}
      >
        Delete
      </button>
    </div>
    {#if !canDelete}
      <p class="help-text">
        The last remaining profile cannot be deleted. Create another profile first.
      </p>
    {/if}
  {/if}
</section>

<style>
  .grid {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .grid__item dd {
    margin: 2px 0 0;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .banner {
    word-break: break-word;
  }

  .overview__hint {
    margin: var(--space-3) 0 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .rename {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .rename__field {
    max-width: 320px;
  }
</style>

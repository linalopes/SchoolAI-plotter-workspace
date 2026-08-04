<script lang="ts">
  import { connection, displayState, machineStatus } from '../../grbl/stores';
  import { formatCoordinate } from '../../utils/misc';

  /**
   * Live connection summary pinned to the bottom of the Machines sidebar.
   * Visible from every Machines section so the state is never more than a
   * glance away.
   */

  const firmware = $derived.by(() => {
    if ($connection.firmwareVersion) {
      return $connection.firmwareBuild
        ? `${$connection.firmwareVersion} · ${$connection.firmwareBuild}`
        : $connection.firmwareVersion;
    }
    return $connection.bannerVersion ?? 'Not detected';
  });

  const position = $derived($machineStatus?.wpos ?? $machineStatus?.mpos ?? null);
</script>

<dl class="summary">
  <div class="summary__row">
    <dt class="section-label">Status</dt>
    <dd class="summary__value">{$displayState}</dd>
  </div>

  <div class="summary__row">
    <dt class="section-label">Firmware</dt>
    <dd class="summary__value summary__value--small">{firmware}</dd>
  </div>

  <div class="summary__row">
    <dt class="section-label">Position</dt>
    <dd class="summary__value summary__value--small">
      X {formatCoordinate(position?.x)}&nbsp;&nbsp;Y {formatCoordinate(position?.y)}
    </dd>
  </div>
</dl>

<style>
  .summary {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .summary__row {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .summary__value {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
  }

  .summary__value--small {
    font-size: 12px;
    font-weight: 400;
    word-break: break-word;
  }
</style>

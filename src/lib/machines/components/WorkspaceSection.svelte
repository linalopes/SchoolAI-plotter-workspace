<script lang="ts">
  import { controllerTravel } from '../../grbl/stores';
  import {
    calculateWorkspaceGeometry,
    formatAxisRange,
    formatRectSize,
    validateWorkspaceGeometry,
    ZERO_INSETS,
    ZERO_MEDIA_PLACEMENT,
  } from '../workspaceGeometry';
  import { ORIGIN_OPTIONS, type OriginMode } from '../profiles/types';
  import { activeProfile, updateActiveProfile } from '../stores/profiles';
  import WorkspaceDiagram from './WorkspaceDiagram.svelte';

  /**
   * Workspace description for the active profile.
   *
   * Media size, media placement vs machine zero, additional insets, and safe
   * margin are separate. These values are never written to GRBL EEPROM.
   */

  const workspace = $derived($activeProfile.workspace);
  const insets = $derived(workspace.nonDrawableInsets ?? ZERO_INSETS);
  const mediaPlacement = $derived(
    workspace.mediaPlacement ?? ZERO_MEDIA_PLACEMENT,
  );

  const geometry = $derived(
    calculateWorkspaceGeometry(
      workspace.widthMm,
      workspace.heightMm,
      insets,
      workspace.safeMarginMm,
      mediaPlacement,
    ),
  );

  const geometryIssues = $derived(
    validateWorkspaceGeometry(
      workspace.widthMm,
      workspace.heightMm,
      insets,
      workspace.safeMarginMm,
      mediaPlacement,
    ),
  );

  const travelDiffers = $derived.by(() => {
    if (!$controllerTravel) return false;
    return (
      Math.abs($controllerTravel.widthMm - workspace.widthMm) > 0.05 ||
      Math.abs($controllerTravel.heightMm - workspace.heightMm) > 0.05
    );
  });

  function patch(update: Partial<typeof workspace>) {
    updateActiveProfile((profile) => ({
      ...profile,
      workspace: { ...profile.workspace, ...update },
    }));
  }

  function patchInsets(update: Partial<typeof insets>) {
    patch({
      nonDrawableInsets: { ...insets, ...update },
    });
  }

  function patchMediaPlacement(update: Partial<typeof mediaPlacement>) {
    patch({
      mediaPlacement: { ...mediaPlacement, ...update },
    });
  }

  function useControllerTravel() {
    if (!$controllerTravel) return;
    patch({
      widthMm: $controllerTravel.widthMm,
      heightMm: $controllerTravel.heightMm,
    });
  }

  function issueFor(...fields: string[]): string | null {
    const hit = geometryIssues.find((issue) =>
      fields.some((field) => issue.field.toLowerCase().includes(field.toLowerCase())),
    );
    return hit?.message ?? null;
  }
</script>

<section class="panel">
  <div class="panel__header">
    <h2>Workspace</h2>
    <span class="badge badge--soft">Profile settings</span>
  </div>

  <p>
    Physical media, where machine zero sits on that media, optional extra
    unreachable edges, and safe clearance. Editing these values does not change
    any firmware setting or GRBL work zero.
  </p>

  {#if $controllerTravel && travelDiffers}
    <div class="callout travel-suggestion" role="note">
      <span class="callout__arrow" aria-hidden="true">→</span>
      <div class="travel-suggestion__body">
        <p>
          Controller travel: {$controllerTravel.widthMm} × {$controllerTravel.heightMm} mm
        </p>
        <p>
          Profile page: {workspace.widthMm} × {workspace.heightMm} mm
        </p>
        <button type="button" class="btn btn--small" onclick={useControllerTravel}>
          Use controller values
        </button>
      </div>
    </div>
  {/if}

  <div class="layout">
    <div class="controls">
      <section class="block">
        <h3>Physical media</h3>
        <p class="block__lead">
          The physical sheet positioned relative to the machine origin.
        </p>
        <div class="field-grid">
          <div class="field">
            <label class="field__label" for="workspace-width">Width (mm)</label>
            <input
              id="workspace-width"
              type="number"
              min="1"
              max="10000"
              step="1"
              value={workspace.widthMm}
              onchange={(event) => patch({ widthMm: Number(event.currentTarget.value) })}
            />
          </div>
          <div class="field">
            <label class="field__label" for="workspace-height">Height (mm)</label>
            <input
              id="workspace-height"
              type="number"
              min="1"
              max="10000"
              step="1"
              value={workspace.heightMm}
              onchange={(event) => patch({ heightMm: Number(event.currentTarget.value) })}
            />
          </div>
          <div class="field">
            <label class="field__label" for="workspace-origin">Coordinate origin mode</label>
            <select
              id="workspace-origin"
              value={workspace.origin}
              onchange={(event) =>
                patch({ origin: event.currentTarget.value as OriginMode })}
            >
              {#each ORIGIN_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        </div>
        <p class="field__hint mono">
          Media · {workspace.widthMm} × {workspace.heightMm} mm
          {#if workspace.widthMm === 297 && workspace.heightMm === 210}
            · A4 landscape
          {/if}
        </p>
      </section>

      <section class="block">
        <h3>Machine origin on media</h3>
        <p class="block__lead">
          Defines where machine coordinate 0,0 is located on the physical sheet.
        </p>
        <div class="field-grid">
          <div class="field">
            <label class="field__label" for="media-origin-x">
              X position from media left edge (mm)
            </label>
            <input
              id="media-origin-x"
              type="number"
              min="0"
              max="10000"
              step="1"
              value={mediaPlacement.machineOriginOnMediaXmm}
              onchange={(event) =>
                patchMediaPlacement({
                  machineOriginOnMediaXmm: Number(event.currentTarget.value),
                })}
            />
          </div>
          <div class="field">
            <label class="field__label" for="media-origin-y">
              Y position from media bottom edge (mm)
            </label>
            <input
              id="media-origin-y"
              type="number"
              min="0"
              max="10000"
              step="1"
              value={mediaPlacement.machineOriginOnMediaYmm}
              onchange={(event) =>
                patchMediaPlacement({
                  machineOriginOnMediaYmm: Number(event.currentTarget.value),
                })}
            />
          </div>
        </div>
        <p class="field__hint">
          Machine X0 is {mediaPlacement.machineOriginOnMediaXmm} mm from the left
          edge of the paper. Machine Y0 is
          {mediaPlacement.machineOriginOnMediaYmm === 0
            ? 'aligned with the bottom edge of the paper'
            : `${mediaPlacement.machineOriginOnMediaYmm} mm above the bottom edge`}.
          Changing this does not rewrite the controller’s origin.
        </p>
        {#if issueFor('Machine origin', 'Media placement')}
          <p class="field-error" role="alert">
            {issueFor('Machine origin', 'Media placement')}
          </p>
        {/if}
      </section>

      <section class="block">
        <h3>Additional non-drawable insets</h3>
        <p class="block__lead">
          Optional extra unreachable strips inside the reachable part of the media.
          Separate from media placement. For the default XY Plotter these stay at 0.
        </p>
        <div class="inset-grid" aria-label="Additional non-drawable insets">
          <div class="field inset-grid__top">
            <label class="field__label" for="inset-top">Top (mm)</label>
            <input
              id="inset-top"
              type="number"
              min="0"
              max="10000"
              step="1"
              value={insets.topMm}
              onchange={(event) =>
                patchInsets({ topMm: Number(event.currentTarget.value) })}
            />
          </div>
          <div class="field inset-grid__left">
            <label class="field__label" for="inset-left">Left (mm)</label>
            <input
              id="inset-left"
              type="number"
              min="0"
              max="10000"
              step="1"
              value={insets.leftMm}
              onchange={(event) =>
                patchInsets({ leftMm: Number(event.currentTarget.value) })}
            />
          </div>
          <div class="inset-grid__center mono" aria-hidden="true">Media</div>
          <div class="field inset-grid__right">
            <label class="field__label" for="inset-right">Right (mm)</label>
            <input
              id="inset-right"
              type="number"
              min="0"
              max="10000"
              step="1"
              value={insets.rightMm}
              onchange={(event) =>
                patchInsets({ rightMm: Number(event.currentTarget.value) })}
            />
          </div>
          <div class="field inset-grid__bottom">
            <label class="field__label" for="inset-bottom">Bottom (mm)</label>
            <input
              id="inset-bottom"
              type="number"
              min="0"
              max="10000"
              step="1"
              value={insets.bottomMm}
              onchange={(event) =>
                patchInsets({ bottomMm: Number(event.currentTarget.value) })}
            />
          </div>
        </div>
        {#if issueFor('inset', 'Additional', 'Drawable')}
          <p class="field-error" role="alert">{issueFor('inset', 'Additional', 'Drawable')}</p>
        {/if}
      </section>

      <section class="block">
        <h3>Safe margin</h3>
        <p class="block__lead">
          Additional clearance inside the physically reachable part of the media.
        </p>
        <div class="field">
          <label class="field__label" for="workspace-margin">Safe margin (mm)</label>
          <input
            id="workspace-margin"
            type="number"
            min="0"
            max="1000"
            step="1"
            value={workspace.safeMarginMm}
            onchange={(event) =>
              patch({ safeMarginMm: Number(event.currentTarget.value) })}
          />
        </div>
        {#if issueFor('Safe margin')}
          <p class="field-error" role="alert">{issueFor('Safe margin')}</p>
        {/if}
      </section>

      <section class="block summary">
        <h3>Geometry summary (machine coordinates)</h3>
        <dl class="summary__list mono">
          <div>
            <dt>Physical media</dt>
            <dd>{formatRectSize(geometry.mediaRect)}</dd>
          </div>
          <div>
            <dt>Media in machine space</dt>
            <dd>
              X {formatAxisRange(
                geometry.mediaRect.x,
                geometry.mediaRect.x + geometry.mediaRect.width,
              )}
            </dd>
          </div>
          <div>
            <dt>Reachable media</dt>
            <dd>{formatRectSize(geometry.reachableRect)}</dd>
          </div>
          <div>
            <dt>Drawable area</dt>
            <dd>{formatRectSize(geometry.drawableRect)}</dd>
          </div>
          <div>
            <dt>Safe plotting area</dt>
            <dd>{formatRectSize(geometry.safePlotRect)}</dd>
          </div>
          <div>
            <dt>Safe X</dt>
            <dd>
              {formatAxisRange(
                geometry.safePlotRect.x,
                geometry.safePlotRect.x + geometry.safePlotRect.width,
              )}
            </dd>
          </div>
          <div>
            <dt>Safe Y</dt>
            <dd>
              {formatAxisRange(
                geometry.safePlotRect.y,
                geometry.safePlotRect.y + geometry.safePlotRect.height,
              )}
            </dd>
          </div>
        </dl>
        {#if geometryIssues.length}
          <ul class="summary__errors" role="alert">
            {#each geometryIssues as issue (issue.field + issue.message)}
              <li>{issue.message}</li>
            {/each}
          </ul>
        {/if}
      </section>

      <fieldset class="toggles">
        <legend class="field__label">Preview and hardware</legend>

        <label class="checkbox" for="invert-x">
          <input
            id="invert-x"
            type="checkbox"
            checked={workspace.invertXPreview}
            onchange={(event) => patch({ invertXPreview: event.currentTarget.checked })}
          />
          <span>
            Invert X preview
            <span class="toggle-hint">Preview only. Outgoing commands are unchanged.</span>
          </span>
        </label>

        <label class="checkbox" for="invert-y">
          <input
            id="invert-y"
            type="checkbox"
            checked={workspace.invertYPreview}
            onchange={(event) => patch({ invertYPreview: event.currentTarget.checked })}
          />
          <span>
            Invert Y preview
            <span class="toggle-hint">Preview only. Outgoing commands are unchanged.</span>
          </span>
        </label>

        <label class="checkbox" for="homing-switches">
          <input
            id="homing-switches"
            type="checkbox"
            checked={workspace.hasHomingSwitches}
            onchange={(event) => patch({ hasHomingSwitches: event.currentTarget.checked })}
          />
          <span>
            Has homing switches
            <span class="toggle-hint">
              Homing only works when the firmware also enables it ($22).
            </span>
          </span>
        </label>

        <label class="checkbox" for="soft-limits">
          <input
            id="soft-limits"
            type="checkbox"
            checked={workspace.useSoftLimits}
            onchange={(event) => patch({ useSoftLimits: event.currentTarget.checked })}
          />
          <span>
            Use soft limits
            <span class="toggle-hint">
              Records the intent for future plot checks. Firmware soft limits are
              set by $20.
            </span>
          </span>
        </label>
      </fieldset>
    </div>

    <div class="preview">
      <p class="section-label">Diagram</p>
      <WorkspaceDiagram
        widthMm={workspace.widthMm}
        heightMm={workspace.heightMm}
        origin={workspace.origin}
        invertX={workspace.invertXPreview}
        invertY={workspace.invertYPreview}
        safeMarginMm={workspace.safeMarginMm}
        nonDrawableInsets={insets}
        mediaPlacement={mediaPlacement}
      />
    </div>
  </div>

  <div class="callout">
    <span class="callout__arrow" aria-hidden="true">→</span>
    <span>
      GRBL travel limits ($130 / $131) are read-only in Calibration. This screen
      does not rewrite firmware settings.
    </span>
  </div>
</section>

<style>
  .travel-suggestion {
    margin-bottom: var(--space-4);
  }

  .travel-suggestion__body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .travel-suggestion__body p {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(240px, 440px);
    gap: var(--space-4);
    align-items: start;
    margin-bottom: var(--space-4);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .block h3 {
    margin: 0 0 var(--space-1);
    font-size: 15px;
    font-weight: 600;
  }

  .block__lead {
    margin: 0 0 var(--space-2);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .inset-grid {
    display: grid;
    grid-template-columns: 1fr 72px 1fr;
    grid-template-rows: auto auto auto;
    gap: var(--space-2);
    align-items: end;
  }

  .inset-grid__top {
    grid-column: 2;
    grid-row: 1;
  }

  .inset-grid__left {
    grid-column: 1;
    grid-row: 2;
  }

  .inset-grid__center {
    grid-column: 2;
    grid-row: 2;
    display: grid;
    place-items: center;
    min-height: 48px;
    border: var(--border);
    border-radius: var(--radius);
    background: var(--color-surface-soft);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .inset-grid__right {
    grid-column: 3;
    grid-row: 2;
  }

  .inset-grid__bottom {
    grid-column: 2;
    grid-row: 3;
  }

  .field-error {
    margin: var(--space-2) 0 0;
    color: var(--color-warning);
    font-size: 12px;
  }

  .summary__list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary__list div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 12px;
  }

  .summary__list dt {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .summary__list dd {
    margin: 0;
    text-align: right;
  }

  .summary__errors {
    margin: var(--space-2) 0 0;
    padding-left: 1.1em;
    color: var(--color-warning);
    font-size: 12px;
  }

  .toggles {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .toggles legend {
    padding: 0;
    margin-bottom: var(--space-1);
  }

  .toggle-hint {
    display: block;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .preview {
    border: var(--border);
    border-radius: var(--radius);
    padding: var(--space-3);
    background: var(--color-white);
  }

  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>

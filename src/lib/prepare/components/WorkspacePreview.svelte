<script lang="ts">
  import {
    calculateWorkspaceGeometry,
    rectContainsPoint,
    ZERO_INSETS,
    ZERO_MEDIA_PLACEMENT,
    type MediaPlacement,
    type NonDrawableInsets,
    type RectMm,
  } from '../../machines/workspaceGeometry';
  import type { TransformedPlot } from '../../plot/types';

  interface Props {
    plot: TransformedPlot | null;
    pageWidthMm: number;
    pageHeightMm: number;
    nonDrawableInsets?: NonDrawableInsets | null;
    mediaPlacement?: MediaPlacement | null;
    safeMarginMm: number;
    showPenUpTravel: boolean;
  }

  let {
    plot,
    pageWidthMm,
    pageHeightMm,
    nonDrawableInsets = null,
    mediaPlacement = null,
    safeMarginMm,
    showPenUpTravel,
  }: Props = $props();

  const pad = 8;
  const insets = $derived(nonDrawableInsets ?? ZERO_INSETS);
  const placement = $derived(mediaPlacement ?? ZERO_MEDIA_PLACEMENT);

  const geometry = $derived(
    calculateWorkspaceGeometry(
      pageWidthMm,
      pageHeightMm,
      insets,
      safeMarginMm,
      placement,
    ),
  );

  const media = $derived(geometry.mediaRect);

  const viewBox = $derived(
    `${media.x - pad} ${-pad} ${media.width + pad * 2} ${media.height + pad * 2}`,
  );

  /** Machine Y (up) → SVG Y (down), relative to media top. */
  function flipY(machineY: number): number {
    return media.y + media.height - machineY;
  }

  function svgRect(rect: RectMm) {
    return {
      x: rect.x,
      y: flipY(rect.y + rect.height),
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height),
    };
  }

  const mediaSvg = $derived(svgRect(media));
  const drawableSvg = $derived(svgRect(geometry.drawableRect));
  const safeSvg = $derived(svgRect(geometry.safePlotRect));
  const unreachableSvg = $derived(
    geometry.unreachableRects.map((rect) => svgRect(rect)),
  );

  function pathD(points: Array<{ x: number; y: number }>, closed: boolean): string {
    if (points.length === 0) return '';
    const [first, ...rest] = points;
    if (!first) return '';
    let d = `M ${first.x} ${flipY(first.y)}`;
    for (const point of rest) {
      d += ` L ${point.x} ${flipY(point.y)}`;
    }
    if (closed) d += ' Z';
    return d;
  }

  function pathOutsideSafe(points: Array<{ x: number; y: number }>): boolean {
    return points.some(
      (point) =>
        !rectContainsPoint(geometry.safePlotRect, point.x, point.y),
    );
  }
</script>

<div
  class="preview"
  role="img"
  aria-label="Machine-space preview with physical media, unreachable region, and prepared drawing"
>
  <svg class="preview__svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern
        id="prepare-dead-hatch"
        width="4"
        height="4"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="4"
          stroke="rgba(34, 17, 62, 0.22)"
          stroke-width="1.2"
        />
      </pattern>
    </defs>

    <rect
      class="preview__page"
      x={mediaSvg.x}
      y={mediaSvg.y}
      width={mediaSvg.width}
      height={mediaSvg.height}
      rx="1"
    />

    {#each unreachableSvg as rect, index (index)}
      <rect
        class="preview__dead"
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
      />
    {/each}

    {#if geometry.unreachableRects[0] && geometry.unreachableRects[0].width > 0}
      {@const strip = geometry.unreachableRects[0]}
      <text
        class="preview__dead-label"
        x={strip.x + strip.width / 2}
        y={flipY(media.y + media.height / 2)}
        text-anchor="middle"
        transform="rotate(-90 {strip.x + strip.width / 2} {flipY(media.y + media.height / 2)})"
      >
        Unreachable · machine X {strip.x.toFixed(0)} to 0
      </text>
    {/if}

    <rect
      class="preview__drawable"
      x={drawableSvg.x}
      y={drawableSvg.y}
      width={drawableSvg.width}
      height={drawableSvg.height}
    />

    <rect
      class="preview__safe"
      x={safeSvg.x}
      y={safeSvg.y}
      width={safeSvg.width}
      height={safeSvg.height}
    />

    <!-- Machine X = 0 axis -->
    <line
      class="preview__axis"
      x1="0"
      y1={flipY(media.y)}
      x2="0"
      y2={flipY(media.y + media.height)}
    />
    <text class="preview__label" x="1.5" y={flipY(media.y + media.height) + 4}>X=0</text>

    <!-- Media left edge label -->
    <text
      class="preview__label"
      x={media.x + 1}
      y={flipY(media.y) - 2}
    >
      X={media.x.toFixed(0)}
    </text>

    <g class="preview__origin" aria-hidden="true">
      <circle cx="0" cy={flipY(0)} r="1.8" />
      <line x1="0" y1={flipY(0)} x2="12" y2={flipY(0)} />
      <line x1="0" y1={flipY(0)} x2="0" y2={flipY(12)} />
      <text x="14" y={flipY(2)} class="preview__label">0,0</text>
    </g>

    {#if plot}
      {#if showPenUpTravel}
        {#each plot.penUpSegments as segment, index (index)}
          <line
            class="preview__travel"
            x1={segment.from.x}
            y1={flipY(segment.from.y)}
            x2={segment.to.x}
            y2={flipY(segment.to.y)}
          />
        {/each}
      {/if}

      {#each plot.paths as path (path.id)}
        <path
          class="preview__path"
          class:preview__path--invalid={pathOutsideSafe(path.points)}
          d={pathD(path.points, path.closed)}
        />
      {/each}

      <rect
        class="preview__bounds"
        x={plot.bounds.minX}
        y={flipY(plot.bounds.maxY)}
        width={Math.max(0, plot.bounds.maxX - plot.bounds.minX)}
        height={Math.max(0, plot.bounds.maxY - plot.bounds.minY)}
      />
    {/if}
  </svg>

  <p class="preview__caption mono">
    Media {pageWidthMm} × {pageHeightMm} mm · machine X {media.x.toFixed(0)} to {(media.x + media.width).toFixed(0)} ·
    safe {geometry.safePlotRect.x.toFixed(0)}–{(geometry.safePlotRect.x + geometry.safePlotRect.width).toFixed(0)} mm
  </p>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    height: 100%;
    min-height: 280px;
  }

  .preview__svg {
    flex: 1 1 auto;
    width: 100%;
    min-height: 240px;
    background:
      linear-gradient(135deg, rgba(202, 216, 216, 0.45), rgba(255, 255, 255, 0.9)),
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 11px,
        rgba(34, 17, 62, 0.03) 11px,
        rgba(34, 17, 62, 0.03) 12px
      );
    border: var(--border-strong);
    border-radius: var(--radius);
  }

  .preview__page {
    fill: #ffffff;
    stroke: var(--color-deep-purple);
    stroke-width: 0.6;
  }

  .preview__dead {
    fill: url(#prepare-dead-hatch);
  }

  .preview__dead-label {
    font-size: 3.2px;
    font-family: var(--font-mono);
    fill: var(--color-deep-purple);
    opacity: 0.8;
  }

  .preview__drawable {
    fill: none;
    stroke: rgba(34, 17, 62, 0.4);
    stroke-width: 0.35;
  }

  .preview__safe {
    fill: none;
    stroke: rgba(34, 17, 62, 0.35);
    stroke-width: 0.35;
    stroke-dasharray: 2 2;
  }

  .preview__axis {
    stroke: var(--color-turquoise);
    stroke-width: 0.35;
    stroke-dasharray: 1.5 1;
  }

  .preview__origin {
    fill: var(--color-pink);
    stroke: var(--color-deep-purple);
    stroke-width: 0.5;
  }

  .preview__label {
    font-size: 3.5px;
    font-family: var(--font-mono);
    fill: rgba(34, 17, 62, 0.7);
  }

  .preview__path {
    fill: none;
    stroke: var(--color-deep-purple);
    stroke-width: 0.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .preview__path--invalid {
    stroke: var(--color-warning);
    stroke-width: 0.55;
  }

  .preview__travel {
    stroke: rgba(234, 125, 255, 0.55);
    stroke-width: 0.35;
    stroke-dasharray: 1.5 1.2;
  }

  .preview__bounds {
    fill: none;
    stroke: var(--color-turquoise);
    stroke-width: 0.4;
  }

  .preview__caption {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>

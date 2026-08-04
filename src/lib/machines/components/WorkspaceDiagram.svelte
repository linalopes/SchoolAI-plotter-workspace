<script lang="ts">
  import {
    calculateWorkspaceGeometry,
    type MediaPlacement,
    type NonDrawableInsets,
  } from '../workspaceGeometry';
  import type { OriginMode } from '../profiles/types';

  interface Props {
    widthMm: number;
    heightMm: number;
    origin: OriginMode;
    invertX: boolean;
    invertY: boolean;
    safeMarginMm: number;
    nonDrawableInsets: NonDrawableInsets;
    mediaPlacement: MediaPlacement;
  }

  let {
    widthMm,
    heightMm,
    origin,
    invertX,
    invertY,
    safeMarginMm,
    nonDrawableInsets,
    mediaPlacement,
  }: Props = $props();

  /**
   * Scale drawing of physical media in machine coordinates.
   * SVG Y grows downward; machine Y grows upward.
   */

  const PAD = 28;

  const geometry = $derived(
    calculateWorkspaceGeometry(
      widthMm,
      heightMm,
      nonDrawableInsets,
      safeMarginMm,
      mediaPlacement,
    ),
  );

  const media = $derived(geometry.mediaRect);

  const viewBox = $derived(
    `${media.x - PAD} ${-PAD} ${media.width + PAD * 2} ${media.height + PAD * 2}`,
  );

  function svgY(machineY: number): number {
    return media.y + media.height - machineY;
  }

  function svgRect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    return {
      x: rect.x,
      y: svgY(rect.y + rect.height),
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

  /** Machine origin marker in SVG coords (always machine 0,0 for lower-left). */
  const originPoint = $derived.by(() => {
    switch (origin) {
      case 'upper-left':
        return { x: 0, y: svgY(media.y + media.height) };
      case 'center':
        return {
          x: media.x + media.width / 2,
          y: svgY(media.y + media.height / 2),
        };
      default:
        return { x: 0, y: svgY(0) };
    }
  });

  const axisDirection = $derived({
    x: invertX ? -1 : 1,
    y: invertY ? 1 : -1,
  });

  const ARROW = 34;

  const xArrow = $derived({
    x1: originPoint.x,
    y1: originPoint.y,
    x2: originPoint.x + ARROW * axisDirection.x,
    y2: originPoint.y,
  });

  const yArrow = $derived({
    x1: originPoint.x,
    y1: originPoint.y,
    x2: originPoint.x,
    y2: originPoint.y + ARROW * axisDirection.y,
  });

  const hasSafe =
    $derived(geometry.safePlotRect.width > 0 && geometry.safePlotRect.height > 0);

  const leftUnreachable = $derived(geometry.unreachableRects[0] ?? null);

  const description = $derived(
    `Media ${widthMm} by ${heightMm} millimetres in machine space ` +
      `from X ${media.x.toFixed(0)} to ${(media.x + media.width).toFixed(0)}. ` +
      `Safe plotting X ${geometry.safePlotRect.x.toFixed(0)} to ` +
      `${(geometry.safePlotRect.x + geometry.safePlotRect.width).toFixed(0)}. ` +
      `Machine origin inside the sheet.`,
  );
</script>

<figure class="diagram">
  <svg {viewBox} role="img" aria-label={description}>
    <defs>
      <marker
        id="axis-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-deep-purple)" />
      </marker>
      <pattern
        id="dead-hatch"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="6"
          stroke="rgba(34, 17, 62, 0.28)"
          stroke-width="1.5"
        />
      </pattern>
    </defs>

    <rect
      class="sheet"
      x={mediaSvg.x}
      y={mediaSvg.y}
      width={mediaSvg.width}
      height={mediaSvg.height}
      rx="1"
    />

    {#each unreachableSvg as rect, index (index)}
      <rect
        class="dead"
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
      />
    {/each}

    {#if leftUnreachable && leftUnreachable.width > 0}
      <text
        class="dead-label"
        x={leftUnreachable.x + leftUnreachable.width / 2}
        y={svgY(media.y + media.height / 2)}
        text-anchor="middle"
        transform="rotate(-90 {leftUnreachable.x + leftUnreachable.width / 2} {svgY(media.y + media.height / 2)})"
      >
        Unreachable · X {leftUnreachable.x.toFixed(0)} to 0
      </text>
    {/if}

    <rect
      class="drawable"
      x={drawableSvg.x}
      y={drawableSvg.y}
      width={drawableSvg.width}
      height={drawableSvg.height}
    />

    {#if hasSafe}
      <rect
        class="safe"
        x={safeSvg.x}
        y={safeSvg.y}
        width={safeSvg.width}
        height={safeSvg.height}
      />
    {/if}

    <!-- Machine X = 0 vertical -->
    <line
      class="zero-line"
      x1="0"
      y1={svgY(media.y)}
      x2="0"
      y2={svgY(media.y + media.height)}
    />
    <text class="edge-label" x="3" y={svgY(media.y + media.height) + 12}>X = 0</text>
    <text class="edge-label" x={media.x + 2} y={svgY(media.y + media.height) + 12}>
      X = {media.x.toFixed(0)}
    </text>

    <line class="axis" x1={xArrow.x1} y1={xArrow.y1} x2={xArrow.x2} y2={xArrow.y2} />
    <line class="axis" x1={yArrow.x1} y1={yArrow.y1} x2={yArrow.x2} y2={yArrow.y2} />

    <text
      class="axis-label"
      x={xArrow.x2 + 8 * axisDirection.x}
      y={xArrow.y2 + 4}
      text-anchor={axisDirection.x > 0 ? 'start' : 'end'}>X</text
    >
    <text
      class="axis-label"
      x={yArrow.x2}
      y={yArrow.y2 + 14 * axisDirection.y}
      text-anchor="middle">Y</text
    >

    <circle class="origin" cx={originPoint.x} cy={originPoint.y} r="4" />
    <text class="origin-label" x={originPoint.x + 8} y={originPoint.y - 6}>0,0</text>

    <text
      class="dimension"
      x={media.x + media.width / 2}
      y={svgY(media.y) + 18}
      text-anchor="middle"
    >
      {widthMm} mm
    </text>
    <text
      class="dimension"
      x={media.x - 12}
      y={svgY(media.y + media.height / 2)}
      text-anchor="middle"
      transform="rotate(-90 {media.x - 12} {svgY(media.y + media.height / 2)})"
    >
      {heightMm} mm
    </text>
  </svg>
  <figcaption class="help-text">{description}</figcaption>
</figure>

<style>
  .diagram {
    margin: 0;
  }

  svg {
    width: 100%;
    max-width: 480px;
    height: auto;
    display: block;
  }

  .sheet {
    fill: var(--color-white);
    stroke: var(--color-deep-purple);
    stroke-width: 1.4;
  }

  .dead {
    fill: url(#dead-hatch);
    fill-opacity: 1;
    stroke: none;
  }

  .dead-label {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--color-deep-purple);
    opacity: 0.85;
  }

  .drawable {
    fill: none;
    stroke: var(--color-deep-purple);
    stroke-width: 0.9;
    opacity: 0.55;
  }

  .safe {
    fill: none;
    stroke: var(--color-line-strong);
    stroke-width: 0.85;
    stroke-dasharray: 4 3;
  }

  .zero-line {
    stroke: var(--color-turquoise);
    stroke-width: 1.1;
    stroke-dasharray: 3 2;
  }

  .axis {
    stroke: var(--color-deep-purple);
    stroke-width: 1.6;
    marker-end: url(#axis-arrow);
  }

  .origin {
    fill: var(--color-pink);
    stroke: var(--color-deep-purple);
    stroke-width: 1.2;
  }

  .origin-label,
  .axis-label,
  .dimension,
  .edge-label {
    font-family: var(--font-mono);
    font-size: 11px;
    fill: var(--color-deep-purple);
  }

  .edge-label {
    font-size: 10px;
    fill: var(--color-text-muted);
  }

  .dimension {
    fill: var(--color-text-muted);
  }
</style>

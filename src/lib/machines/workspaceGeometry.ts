/**
 * Machine-space workspace geometry.
 *
 * Source of truth for Prepare, validation, and G-code is machine coordinates
 * (the same space as Manual Control / GRBL). Physical media may extend into
 * negative machine X/Y when the sheet begins before the axis origin.
 */

export type NonDrawableInsets = {
  leftMm: number;
  rightMm: number;
  topMm: number;
  bottomMm: number;
};

/** Where machine (0,0) sits on the physical sheet (from media left / bottom). */
export type MediaPlacement = {
  machineOriginOnMediaXmm: number;
  machineOriginOnMediaYmm: number;
};

export type PointMm = {
  x: number;
  y: number;
};

export type RectMm = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkspaceGeometry = {
  /** Physical media rectangle in machine coordinates (may start at negative X). */
  mediaRect: RectMm;
  /** @deprecated Prefer mediaRect — alias kept for call-site clarity. */
  pageRect: RectMm;
  /** Media ∩ machine-reachable half-plane (x ≥ 0, y ≥ 0). */
  reachableRect: RectMm;
  /** Reachable area after additional non-drawable insets. */
  drawableRect: RectMm;
  /** Drawable area after safe margin. */
  safePlotRect: RectMm;
  /** Media regions outside the reachable half-plane (for preview hatching). */
  unreachableRects: RectMm[];
};

export const ZERO_INSETS: NonDrawableInsets = {
  leftMm: 0,
  rightMm: 0,
  topMm: 0,
  bottomMm: 0,
};

export const ZERO_MEDIA_PLACEMENT: MediaPlacement = {
  machineOriginOnMediaXmm: 0,
  machineOriginOnMediaYmm: 0,
};

export type GeometryValidationIssue = {
  field: string;
  message: string;
};

export function mediaPointToMachinePoint(
  point: PointMm,
  placement: MediaPlacement,
): PointMm {
  return {
    x: point.x - placement.machineOriginOnMediaXmm,
    y: point.y - placement.machineOriginOnMediaYmm,
  };
}

export function machinePointToMediaPoint(
  point: PointMm,
  placement: MediaPlacement,
): PointMm {
  return {
    x: point.x + placement.machineOriginOnMediaXmm,
    y: point.y + placement.machineOriginOnMediaYmm,
  };
}

/**
 * Physical media rectangle expressed in machine coordinates.
 * Media lower-left is at (−originX, −originY).
 */
export function calculateMediaRectInMachineSpace(
  mediaWidthMm: number,
  mediaHeightMm: number,
  placement: MediaPlacement,
): RectMm {
  return {
    // Avoid signed-zero (−0) from negating a zero origin.
    x: -placement.machineOriginOnMediaXmm || 0,
    y: -placement.machineOriginOnMediaYmm || 0,
    width: mediaWidthMm,
    height: mediaHeightMm,
  };
}

function intersectAxisAligned(a: RectMm, b: RectMm): RectMm | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Machine-reachable half-plane used for cartesian XY machines. */
function machineReachableHalfPlane(): RectMm {
  // Large enough to contain any realistic media; not controller travel.
  const EXTENT = 1_000_000;
  return { x: 0, y: 0, width: EXTENT, height: EXTENT };
}

function unreachableMediaParts(media: RectMm, reachable: RectMm): RectMm[] {
  const parts: RectMm[] = [];
  // Left of reachable (typically machine X < 0).
  if (media.x < reachable.x) {
    parts.push({
      x: media.x,
      y: media.y,
      width: Math.min(media.width, reachable.x - media.x),
      height: media.height,
    });
  }
  // Below reachable (machine Y < 0).
  if (media.y < reachable.y) {
    const x0 = Math.max(media.x, reachable.x);
    const x1 = media.x + media.width;
    if (x1 > x0) {
      parts.push({
        x: x0,
        y: media.y,
        width: x1 - x0,
        height: Math.min(media.height, reachable.y - media.y),
      });
    }
  }
  return parts.filter((rect) => rect.width > 1e-9 && rect.height > 1e-9);
}

export function calculateWorkspaceGeometry(
  widthMm: number,
  heightMm: number,
  insets: NonDrawableInsets,
  safeMarginMm: number,
  mediaPlacement: MediaPlacement = ZERO_MEDIA_PLACEMENT,
): WorkspaceGeometry {
  const mediaRect = calculateMediaRectInMachineSpace(
    widthMm,
    heightMm,
    mediaPlacement,
  );

  const reachable =
    intersectAxisAligned(mediaRect, machineReachableHalfPlane()) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

  const drawableRect: RectMm = {
    x: reachable.x + insets.leftMm,
    y: reachable.y + insets.bottomMm,
    width: reachable.width - insets.leftMm - insets.rightMm,
    height: reachable.height - insets.topMm - insets.bottomMm,
  };

  const safePlotRect: RectMm = {
    x: drawableRect.x + safeMarginMm,
    y: drawableRect.y + safeMarginMm,
    width: drawableRect.width - safeMarginMm * 2,
    height: drawableRect.height - safeMarginMm * 2,
  };

  return {
    mediaRect,
    pageRect: mediaRect,
    reachableRect: reachable,
    drawableRect,
    safePlotRect,
    unreachableRects: unreachableMediaParts(mediaRect, reachable),
  };
}

export function validateWorkspaceGeometry(
  widthMm: number,
  heightMm: number,
  insets: NonDrawableInsets,
  safeMarginMm: number,
  mediaPlacement: MediaPlacement = ZERO_MEDIA_PLACEMENT,
): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];

  const checkFiniteNonNeg = (field: string, value: number) => {
    if (!Number.isFinite(value)) {
      issues.push({ field, message: `${field} must be a finite number.` });
      return false;
    }
    if (value < 0) {
      issues.push({ field, message: `${field} must be zero or greater.` });
      return false;
    }
    return true;
  };

  checkFiniteNonNeg('Media width', widthMm);
  checkFiniteNonNeg('Media height', heightMm);
  checkFiniteNonNeg('Left inset', insets.leftMm);
  checkFiniteNonNeg('Right inset', insets.rightMm);
  checkFiniteNonNeg('Top inset', insets.topMm);
  checkFiniteNonNeg('Bottom inset', insets.bottomMm);
  checkFiniteNonNeg('Safe margin', safeMarginMm);
  checkFiniteNonNeg(
    'Machine origin on media X',
    mediaPlacement.machineOriginOnMediaXmm,
  );
  checkFiniteNonNeg(
    'Machine origin on media Y',
    mediaPlacement.machineOriginOnMediaYmm,
  );

  if (issues.length > 0) return issues;

  if (widthMm <= 0) {
    issues.push({ field: 'Media width', message: 'Media width must be greater than zero.' });
  }
  if (heightMm <= 0) {
    issues.push({
      field: 'Media height',
      message: 'Media height must be greater than zero.',
    });
  }

  if (mediaPlacement.machineOriginOnMediaXmm > widthMm) {
    issues.push({
      field: 'Machine origin on media X',
      message: 'Machine origin X on media must not exceed media width.',
    });
  }
  if (mediaPlacement.machineOriginOnMediaYmm > heightMm) {
    issues.push({
      field: 'Machine origin on media Y',
      message: 'Machine origin Y on media must not exceed media height.',
    });
  }

  if (insets.leftMm + insets.rightMm >= widthMm) {
    issues.push({
      field: 'Additional non-drawable insets',
      message: 'Left + right insets must be smaller than the media width.',
    });
  }
  if (insets.topMm + insets.bottomMm >= heightMm) {
    issues.push({
      field: 'Additional non-drawable insets',
      message: 'Top + bottom insets must be smaller than the media height.',
    });
  }

  const geometry = calculateWorkspaceGeometry(
    widthMm,
    heightMm,
    insets,
    safeMarginMm,
    mediaPlacement,
  );

  if (geometry.reachableRect.width <= 0 || geometry.reachableRect.height <= 0) {
    issues.push({
      field: 'Media placement',
      message:
        'Media placement leaves no positive reachable area in machine coordinates (x ≥ 0, y ≥ 0).',
    });
  }
  if (geometry.drawableRect.width <= 0 || geometry.drawableRect.height <= 0) {
    issues.push({
      field: 'Drawable area',
      message: 'Additional non-drawable insets leave no positive drawable area.',
    });
  }
  if (geometry.safePlotRect.width <= 0 || geometry.safePlotRect.height <= 0) {
    issues.push({
      field: 'Safe margin',
      message:
        'Safe margin must leave a positive safe plotting area inside the reachable region.',
    });
  }

  return issues;
}

export function isGeometryValid(
  widthMm: number,
  heightMm: number,
  insets: NonDrawableInsets,
  safeMarginMm: number,
  mediaPlacement: MediaPlacement = ZERO_MEDIA_PLACEMENT,
): boolean {
  return (
    validateWorkspaceGeometry(
      widthMm,
      heightMm,
      insets,
      safeMarginMm,
      mediaPlacement,
    ).length === 0
  );
}

export function rectContainsPoint(
  rect: RectMm,
  x: number,
  y: number,
  epsilon = 1e-6,
): boolean {
  return (
    x >= rect.x - epsilon &&
    y >= rect.y - epsilon &&
    x <= rect.x + rect.width + epsilon &&
    y <= rect.y + rect.height + epsilon
  );
}

export function formatRectSize(rect: RectMm): string {
  return `${round1(rect.width)} × ${round1(rect.height)} mm`;
}

export function formatAxisRange(min: number, max: number): string {
  return `${round1(min)} to ${round1(max)} mm`;
}

function round1(n: number): string {
  return Number.parseFloat(n.toFixed(1)).toString();
}

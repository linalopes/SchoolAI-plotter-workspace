import { describe, expect, it } from 'vitest';
import {
  calculateMediaRectInMachineSpace,
  calculateWorkspaceGeometry,
  machinePointToMediaPoint,
  mediaPointToMachinePoint,
  ZERO_INSETS,
  ZERO_MEDIA_PLACEMENT,
} from './workspaceGeometry';
import { createDefaultProfile } from './profiles/defaults';
import { PROFILE_SCHEMA_VERSION } from './profiles/types';
import {
  migrateLegacyLeftInsetToMediaPlacement,
  sanitizeNonDrawableInsets,
  sanitizeProfile,
  sanitizeStoredProfiles,
} from './profiles/validation';

const XY_PLACEMENT = {
  machineOriginOnMediaXmm: 30,
  machineOriginOnMediaYmm: 0,
};

describe('media ↔ machine conversion', () => {
  it('maps paper and machine X for the XY Plotter placement', () => {
    expect(mediaPointToMachinePoint({ x: 0, y: 0 }, XY_PLACEMENT)).toEqual({
      x: -30,
      y: 0,
    });
    expect(mediaPointToMachinePoint({ x: 30, y: 0 }, XY_PLACEMENT)).toEqual({
      x: 0,
      y: 0,
    });
    expect(mediaPointToMachinePoint({ x: 35, y: 5 }, XY_PLACEMENT)).toEqual({
      x: 5,
      y: 5,
    });
    expect(mediaPointToMachinePoint({ x: 297, y: 210 }, XY_PLACEMENT)).toEqual({
      x: 267,
      y: 210,
    });
    expect(machinePointToMediaPoint({ x: 0, y: 0 }, XY_PLACEMENT)).toEqual({
      x: 30,
      y: 0,
    });
  });

  it('places the media rectangle at machine X = -30 … 267', () => {
    const media = calculateMediaRectInMachineSpace(297, 210, XY_PLACEMENT);
    expect(media).toEqual({ x: -30, y: 0, width: 297, height: 210 });
  });
});

describe('calculateWorkspaceGeometry (machine space)', () => {
  it('builds XY Plotter reachable and safe rects from media placement', () => {
    const geometry = calculateWorkspaceGeometry(
      297,
      210,
      ZERO_INSETS,
      5,
      XY_PLACEMENT,
    );
    expect(geometry.mediaRect).toEqual({
      x: -30,
      y: 0,
      width: 297,
      height: 210,
    });
    expect(geometry.reachableRect).toEqual({
      x: 0,
      y: 0,
      width: 267,
      height: 210,
    });
    expect(geometry.safePlotRect).toEqual({
      x: 5,
      y: 5,
      width: 257,
      height: 200,
    });
    expect(geometry.unreachableRects[0]).toEqual({
      x: -30,
      y: 0,
      width: 30,
      height: 210,
    });
  });

  it('keeps zero-offset media aligned with machine origin', () => {
    const geometry = calculateWorkspaceGeometry(
      297,
      210,
      ZERO_INSETS,
      5,
      ZERO_MEDIA_PLACEMENT,
    );
    expect(geometry.mediaRect.x).toBe(0);
    expect(geometry.safePlotRect).toEqual({
      x: 5,
      y: 5,
      width: 287,
      height: 200,
    });
  });

  it('applies additional insets inside the reachable region', () => {
    const geometry = calculateWorkspaceGeometry(
      100,
      100,
      { leftMm: 10, rightMm: 10, topMm: 5, bottomMm: 5 },
      2,
      ZERO_MEDIA_PLACEMENT,
    );
    expect(geometry.drawableRect).toEqual({
      x: 10,
      y: 5,
      width: 80,
      height: 90,
    });
    expect(geometry.safePlotRect).toEqual({
      x: 12,
      y: 7,
      width: 76,
      height: 86,
    });
  });
});

describe('profile defaults and migration', () => {
  it('default XY Plotter uses media placement 30 and zero insets', () => {
    const profile = createDefaultProfile();
    expect(profile.workspace.mediaPlacement).toEqual(XY_PLACEMENT);
    expect(profile.workspace.nonDrawableInsets).toEqual(ZERO_INSETS);
    expect(PROFILE_SCHEMA_VERSION).toBe(3);
  });

  it('generic profiles default to zero media offset', () => {
    const profile = createDefaultProfile('Custom');
    expect(profile.workspace.mediaPlacement).toEqual(ZERO_MEDIA_PLACEMENT);
    expect(profile.workspace.nonDrawableInsets).toEqual(ZERO_INSETS);
  });

  it('migrates legacy left inset 30 without mediaPlacement once', () => {
    const raw = {
      version: 2,
      profiles: [
        {
          id: 'p1',
          name: 'XY Plotter',
          type: 'cartesian-xy',
          firmware: 'grbl',
          connection: createDefaultProfile().connection,
          workspace: {
            widthMm: 297,
            heightMm: 210,
            units: 'mm',
            origin: 'lower-left',
            invertXPreview: false,
            invertYPreview: false,
            hasHomingSwitches: false,
            useSoftLimits: false,
            safeMarginMm: 5,
            nonDrawableInsets: {
              leftMm: 30,
              rightMm: 0,
              topMm: 0,
              bottomMm: 0,
            },
          },
          motion: createDefaultProfile().motion,
          pen: createDefaultProfile().pen,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const profiles = sanitizeStoredProfiles(raw);
    expect(profiles[0]!.workspace.nonDrawableInsets.leftMm).toBe(0);
    expect(profiles[0]!.workspace.mediaPlacement.machineOriginOnMediaXmm).toBe(
      30,
    );
    expect(profiles[0]!.workspace.safeMarginMm).toBe(5);
    expect(profiles[0]!.id).toBe('p1');
  });

  it('does not overwrite explicit mediaPlacement', () => {
    const profile = sanitizeProfile({
      name: 'XY Plotter',
      workspace: {
        mediaPlacement: {
          machineOriginOnMediaXmm: 12,
          machineOriginOnMediaYmm: 0,
        },
        nonDrawableInsets: {
          leftMm: 30,
          rightMm: 0,
          topMm: 0,
          bottomMm: 0,
        },
      },
    });
    expect(profile.workspace.mediaPlacement.machineOriginOnMediaXmm).toBe(12);
    expect(profile.workspace.nonDrawableInsets.leftMm).toBe(30);
  });

  it('migrate helper is idempotent after conversion', () => {
    const once = migrateLegacyLeftInsetToMediaPlacement(
      { leftMm: 30, rightMm: 0, topMm: 0, bottomMm: 0 },
      ZERO_MEDIA_PLACEMENT,
      false,
    );
    const twice = migrateLegacyLeftInsetToMediaPlacement(
      once.insets,
      once.mediaPlacement,
      true,
    );
    expect(twice.insets.leftMm).toBe(0);
    expect(twice.mediaPlacement.machineOriginOnMediaXmm).toBe(30);
  });

  it('sanitizeNonDrawableInsets no longer invents a 30 mm left inset', () => {
    const result = sanitizeNonDrawableInsets(undefined);
    expect(result.insets.leftMm).toBe(0);
  });
});

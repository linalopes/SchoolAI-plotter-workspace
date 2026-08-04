import { createId } from '../../utils/misc';
import type { MachineProfile } from './types';

/**
 * Factory for the default XY plotter profile.
 *
 * The workspace dimensions are editable defaults sized for A4 landscape. They
 * are a starting point, not a claim about the connected hardware.
 */
export function createDefaultProfile(
  name = 'XY Plotter',
  id = createId('profile'),
): MachineProfile {
  const now = Date.now();
  return {
    id,
    name,
    type: 'cartesian-xy',
    firmware: 'grbl',
    connection: {
      baudRate: 115200,
      lineEnding: 'lf',
      statusPollIntervalMs: 500,
      commandTimeoutMs: 10_000,
      motionIdleTimeoutMs: 30_000,
      protocolCompatibility: 'auto',
    },
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
      // XY Plotter: paper extends 30 mm left of machine X0. Generic: aligned.
      mediaPlacement: {
        machineOriginOnMediaXmm: name === 'XY Plotter' ? 30 : 0,
        machineOriginOnMediaYmm: 0,
      },
      nonDrawableInsets: {
        leftMm: 0,
        rightMm: 0,
        topMm: 0,
        bottomMm: 0,
      },
    },
    motion: {
      jogFeedRateMmPerMin: 1000,
    },
    pen: {
      preset: 'custom',
      upCommand: '',
      downCommand: '',
      upDelayMs: 300,
      downDelayMs: 300,
      safetyAcknowledged: false,
    },
    createdAt: now,
    updatedAt: now,
  };
}

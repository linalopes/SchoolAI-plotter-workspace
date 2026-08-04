/**
 * Persistent machine profile model.
 *
 * A profile describes how the application should talk to a machine and how it
 * should draw that machine's workspace. It is deliberately independent of any
 * live serial connection: a user must be able to prepare a profile in full
 * while the hardware is unplugged.
 */

import type {
  MediaPlacement,
  NonDrawableInsets,
} from '../workspaceGeometry';

export type { MediaPlacement, NonDrawableInsets };

export type MachineType = 'cartesian-xy' | 'polargraph';

export type FirmwareKind = 'grbl';

export type OriginMode = 'lower-left' | 'upper-left' | 'center';

export type LengthUnit = 'mm';

/** GRBL accepts either terminator; LF is the conventional default. */
export type LineEnding = 'lf' | 'crlf';

export type PenPreset = 'custom' | 'spindle' | 'servo';

/**
 * How the application should speak to the controller.
 *
 * Auto derives the protocol from the startup banner. The other values force
 * GRBL 0.9 legacy or GRBL 1.1+ behaviour when detection is incomplete.
 */
export type ProtocolCompatibility = 'auto' | 'grbl-0.9' | 'grbl-1.1';

export interface ConnectionSettings {
  baudRate: number;
  lineEnding: LineEnding;
  /** Interval between realtime `?` status queries while connected. */
  statusPollIntervalMs: number;
  /**
   * How long a queued command may wait for `ok` or `error:n` after it has
   * been written to the serial stream (acknowledgement timeout).
   */
  commandTimeoutMs: number;
  /**
   * How long to wait for GRBL to report Idle after motion before pen
   * transitions. Separate from command acknowledgement.
   */
  motionIdleTimeoutMs: number;
  /** Protocol dialect override. Default is Auto. */
  protocolCompatibility: ProtocolCompatibility;
}

export interface WorkspaceSettings {
  widthMm: number;
  heightMm: number;
  units: LengthUnit;
  origin: OriginMode;
  /** Preview-only axis flips. These never alter outgoing G-code. */
  invertXPreview: boolean;
  invertYPreview: boolean;
  hasHomingSwitches: boolean;
  useSoftLimits: boolean;
  /** Clearance inside the reachable part of the media. */
  safeMarginMm: number;
  /**
   * Where machine (0,0) sits on the physical sheet, measured from the media
   * left / bottom edges. Separate from GRBL work zero.
   */
  mediaPlacement: MediaPlacement;
  /**
   * Optional extra unreachable strips inside the reachable media region.
   * Not used for the default XY Plotter left overhang (that is media placement).
   */
  nonDrawableInsets: NonDrawableInsets;
}

export interface MotionSettings {
  jogFeedRateMmPerMin: number;
}

export interface PenSettings {
  preset: PenPreset;
  /**
   * Raw GRBL commands. Empty by default: pen mechanisms differ between
   * machines and the correct command must never be guessed on the user's
   * behalf.
   */
  upCommand: string;
  downCommand: string;
  upDelayMs: number;
  downDelayMs: number;
  /** Set once the user has acknowledged the pre-test safety confirmation. */
  safetyAcknowledged: boolean;
}

export interface MachineProfile {
  id: string;
  name: string;
  type: MachineType;
  firmware: FirmwareKind;
  connection: ConnectionSettings;
  workspace: WorkspaceSettings;
  motion: MotionSettings;
  pen: PenSettings;
  createdAt: number;
  updatedAt: number;
}

/** Bumped when the stored shape changes incompatibly. */
export const PROFILE_SCHEMA_VERSION = 3;

export interface StoredProfiles {
  version: number;
  profiles: MachineProfile[];
}

export const MACHINE_TYPE_OPTIONS: ReadonlyArray<{
  value: MachineType;
  label: string;
  available: boolean;
}> = [
  { value: 'cartesian-xy', label: 'Cartesian XY', available: true },
  { value: 'polargraph', label: 'Polargraph', available: false },
];

export const BAUD_RATE_OPTIONS = [
  9600, 19200, 38400, 57600, 115200, 230400,
] as const;

export const PROTOCOL_COMPATIBILITY_OPTIONS: ReadonlyArray<{
  value: ProtocolCompatibility;
  label: string;
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'grbl-0.9', label: 'GRBL 0.9 legacy' },
  { value: 'grbl-1.1', label: 'GRBL 1.1+' },
];

export const ORIGIN_OPTIONS: ReadonlyArray<{
  value: OriginMode;
  label: string;
}> = [
  { value: 'lower-left', label: 'Lower left' },
  { value: 'upper-left', label: 'Upper left' },
  { value: 'center', label: 'Center' },
];

export const JOG_STEP_OPTIONS = [0.1, 1, 10, 50] as const;

export type JogStep = (typeof JOG_STEP_OPTIONS)[number];

export interface PenPresetDefinition {
  value: PenPreset;
  label: string;
  description: string;
  upCommand: string;
  downCommand: string;
}

/**
 * Presets only populate the fields. They are starting points drawn from common
 * plotter builds, not verified values for any specific machine.
 */
export const PEN_PRESETS: readonly PenPresetDefinition[] = [
  {
    value: 'custom',
    label: 'Custom',
    description: 'Enter the commands your machine actually uses.',
    upCommand: '',
    downCommand: '',
  },
  {
    value: 'spindle',
    label: 'M3 / M5 spindle-style',
    description:
      'Used by builds that wire the pen lift to the spindle enable output.',
    upCommand: 'M5',
    downCommand: 'M3',
  },
  {
    value: 'servo',
    label: 'Servo using M3 S values',
    description:
      'Used by builds with a servo on the spindle PWM pin. S values are build-specific.',
    upCommand: 'M3 S0',
    downCommand: 'M3 S90',
  },
];

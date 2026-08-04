import {
  createId,
  isRecord,
  toFiniteNumber,
  toTrimmedString,
} from '../../utils/misc';
import {
  ZERO_INSETS,
  ZERO_MEDIA_PLACEMENT,
  type MediaPlacement,
} from '../workspaceGeometry';
import { createDefaultProfile } from './defaults';
import {
  BAUD_RATE_OPTIONS,
  PROFILE_SCHEMA_VERSION,
  type LineEnding,
  type MachineProfile,
  type MachineType,
  type NonDrawableInsets,
  type OriginMode,
  type PenPreset,
  type ProtocolCompatibility,
  type StoredProfiles,
} from './types';

/**
 * Profile sanitisation.
 *
 * Profiles arrive from LocalStorage and from user-supplied JSON files. Both are
 * untrusted. Every field is coerced field-by-field against a known-good
 * default, so unknown keys are dropped and nothing executable survives the
 * round trip.
 */

const MAX_NAME_LENGTH = 64;
/** Long enough for any realistic GRBL command, short enough to stay sane. */
const MAX_COMMAND_LENGTH = 120;

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function sanitizeCommand(value: unknown): string {
  // Newlines would let one field inject several GRBL commands at once.
  return toTrimmedString(value).replace(/[\r\n]+/g, ' ').slice(0, MAX_COMMAND_LENGTH);
}

function sanitizeBaudRate(value: unknown, fallback: number): number {
  const n = toFiniteNumber(value, fallback);
  return (BAUD_RATE_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

/**
 * Sanitises non-drawable insets.
 *
 * Absent / invalid fields become zero. The legacy XY Plotter left-30 meaning
 * is handled by media-placement migration, not by inventing a left inset here.
 */
export function sanitizeNonDrawableInsets(
  raw: unknown,
): { insets: NonDrawableInsets; warnings: string[] } {
  const warnings: string[] = [];

  if (raw === undefined || raw === null) {
    return { insets: { ...ZERO_INSETS }, warnings };
  }

  if (!isRecord(raw)) {
    warnings.push(
      'nonDrawableInsets was invalid and was replaced with zeros.',
    );
    return { insets: { ...ZERO_INSETS }, warnings };
  }

  const readEdge = (key: keyof NonDrawableInsets, label: string): number => {
    const value = raw[key];
    if (value === undefined || value === null) return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(
        `${label} inset was invalid (${String(value)}) and was set to 0 mm.`,
      );
      return 0;
    }
    return n;
  };

  return {
    insets: {
      leftMm: readEdge('leftMm', 'Left'),
      rightMm: readEdge('rightMm', 'Right'),
      topMm: readEdge('topMm', 'Top'),
      bottomMm: readEdge('bottomMm', 'Bottom'),
    },
    warnings,
  };
}

export function sanitizeMediaPlacement(
  raw: unknown,
): { placement: MediaPlacement; explicit: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === undefined || raw === null) {
    return {
      placement: { ...ZERO_MEDIA_PLACEMENT },
      explicit: false,
      warnings,
    };
  }
  if (!isRecord(raw)) {
    warnings.push(
      'mediaPlacement was invalid and was replaced with zeros.',
    );
    return {
      placement: { ...ZERO_MEDIA_PLACEMENT },
      explicit: false,
      warnings,
    };
  }

  const read = (key: keyof MediaPlacement, label: string): number => {
    const value = raw[key];
    if (value === undefined || value === null) return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(
        `${label} was invalid (${String(value)}) and was set to 0 mm.`,
      );
      return 0;
    }
    return n;
  };

  return {
    placement: {
      machineOriginOnMediaXmm: read(
        'machineOriginOnMediaXmm',
        'Machine origin on media X',
      ),
      machineOriginOnMediaYmm: read(
        'machineOriginOnMediaYmm',
        'Machine origin on media Y',
      ),
    },
    explicit: true,
    warnings,
  };
}

/**
 * One-time migration: temporary "left inset = 30" model → media placement.
 *
 * Only when media placement is absent and left inset is exactly 30.
 * Profiles that already carry mediaPlacement keep both fields as stored.
 */
export function migrateLegacyLeftInsetToMediaPlacement(
  insets: NonDrawableInsets,
  mediaPlacement: MediaPlacement,
  mediaPlacementExplicit: boolean,
): { insets: NonDrawableInsets; mediaPlacement: MediaPlacement } {
  if (mediaPlacementExplicit) {
    return { insets, mediaPlacement };
  }
  if (insets.leftMm === 30) {
    return {
      insets: { ...insets, leftMm: 0 },
      mediaPlacement: {
        machineOriginOnMediaXmm: 30,
        machineOriginOnMediaYmm: 0,
      },
    };
  }
  return { insets, mediaPlacement };
}

/**
 * Coerces arbitrary input into a valid profile.
 *
 * @param preserveId Keep the incoming id when it looks usable. Imports of an
 *   already-known profile should replace it rather than create a duplicate.
 */
export function sanitizeProfile(
  input: unknown,
  preserveId = true,
): MachineProfile {
  const base = createDefaultProfile();
  if (!isRecord(input)) return base;

  const id =
    preserveId && typeof input.id === 'string' && input.id.length > 0
      ? input.id.slice(0, 64)
      : createId('profile');

  const connection = isRecord(input.connection) ? input.connection : {};
  const workspace = isRecord(input.workspace) ? input.workspace : {};
  const motion = isRecord(input.motion) ? input.motion : {};
  const pen = isRecord(input.pen) ? input.pen : {};

  const name = toTrimmedString(input.name).slice(0, MAX_NAME_LENGTH);
  const resolvedName = name.length > 0 ? name : base.name;

  const rawInsets =
    workspace.nonDrawableInsets ??
    (isRecord(input.nonDrawableInsets) ? input.nonDrawableInsets : undefined);
  const { insets: sanitizedInsets } = sanitizeNonDrawableInsets(rawInsets);

  const rawPlacement =
    workspace.mediaPlacement ??
    (isRecord(input.mediaPlacement) ? input.mediaPlacement : undefined);
  const {
    placement: sanitizedPlacement,
    explicit: mediaPlacementExplicit,
  } = sanitizeMediaPlacement(rawPlacement);

  let insets = sanitizedInsets;
  let mediaPlacement = sanitizedPlacement;

  if (mediaPlacementExplicit) {
    // Keep explicit placement and insets as stored/sanitized.
  } else if (insets.leftMm === 30) {
    // Schema v2 temporary model → media placement (once).
    insets = { ...insets, leftMm: 0 };
    mediaPlacement = {
      machineOriginOnMediaXmm: 30,
      machineOriginOnMediaYmm: 0,
    };
  } else if (
    rawInsets === undefined &&
    rawPlacement === undefined &&
    resolvedName === 'XY Plotter'
  ) {
    // Factory defaults when XY Plotter geometry fields were omitted.
    mediaPlacement = {
      machineOriginOnMediaXmm: 30,
      machineOriginOnMediaYmm: 0,
    };
    insets = { ...ZERO_INSETS };
  }

  return {
    id,
    name: resolvedName,
    type: pickEnum<MachineType>(
      input.type,
      ['cartesian-xy', 'polargraph'],
      base.type,
    ),
    firmware: 'grbl',
    connection: {
      baudRate: sanitizeBaudRate(connection.baudRate, base.connection.baudRate),
      lineEnding: pickEnum<LineEnding>(
        connection.lineEnding,
        ['lf', 'crlf'],
        base.connection.lineEnding,
      ),
      statusPollIntervalMs: Math.round(
        toFiniteNumber(
          connection.statusPollIntervalMs,
          base.connection.statusPollIntervalMs,
          100,
          5000,
        ),
      ),
      commandTimeoutMs: Math.round(
        toFiniteNumber(
          connection.commandTimeoutMs,
          base.connection.commandTimeoutMs,
          500,
          60000,
        ),
      ),
      motionIdleTimeoutMs: Math.round(
        toFiniteNumber(
          connection.motionIdleTimeoutMs,
          base.connection.motionIdleTimeoutMs,
          1000,
          300000,
        ),
      ),
      protocolCompatibility: pickEnum<ProtocolCompatibility>(
        connection.protocolCompatibility,
        ['auto', 'grbl-0.9', 'grbl-1.1'],
        base.connection.protocolCompatibility,
      ),
    },
    workspace: {
      widthMm: toFiniteNumber(
        workspace.widthMm,
        base.workspace.widthMm,
        1,
        10000,
      ),
      heightMm: toFiniteNumber(
        workspace.heightMm,
        base.workspace.heightMm,
        1,
        10000,
      ),
      units: 'mm',
      origin: pickEnum<OriginMode>(
        workspace.origin,
        ['lower-left', 'upper-left', 'center'],
        base.workspace.origin,
      ),
      invertXPreview: workspace.invertXPreview === true,
      invertYPreview: workspace.invertYPreview === true,
      hasHomingSwitches: workspace.hasHomingSwitches === true,
      useSoftLimits: workspace.useSoftLimits === true,
      safeMarginMm: toFiniteNumber(
        workspace.safeMarginMm,
        base.workspace.safeMarginMm,
        0,
        1000,
      ),
      mediaPlacement,
      nonDrawableInsets: insets,
    },
    motion: {
      jogFeedRateMmPerMin: Math.round(
        toFiniteNumber(
          motion.jogFeedRateMmPerMin,
          base.motion.jogFeedRateMmPerMin,
          1,
          20000,
        ),
      ),
    },
    pen: {
      preset: pickEnum<PenPreset>(
        pen.preset,
        ['custom', 'spindle', 'servo'],
        base.pen.preset,
      ),
      upCommand: sanitizeCommand(pen.upCommand),
      downCommand: sanitizeCommand(pen.downCommand),
      upDelayMs: Math.round(
        toFiniteNumber(pen.upDelayMs, base.pen.upDelayMs, 0, 10000),
      ),
      downDelayMs: Math.round(
        toFiniteNumber(pen.downDelayMs, base.pen.downDelayMs, 0, 10000),
      ),
      safetyAcknowledged: false,
    },
    createdAt: toFiniteNumber(input.createdAt, base.createdAt, 0),
    updatedAt: Date.now(),
  };
}

export function isStoredProfiles(value: unknown): value is StoredProfiles {
  return (
    isRecord(value) &&
    typeof value.version === 'number' &&
    Array.isArray(value.profiles)
  );
}

/**
 * Normalises a persisted collection, guaranteeing at least one profile.
 *
 * Schema v2 → v3 migrates left inset 30 (without mediaPlacement) into
 * machineOriginOnMediaXmm = 30 once per profile.
 */
export function sanitizeStoredProfiles(value: unknown): MachineProfile[] {
  if (!isStoredProfiles(value)) return [createDefaultProfile()];
  const profiles = value.profiles.map((entry) => sanitizeProfile(entry));
  return profiles.length > 0 ? profiles : [createDefaultProfile()];
}

export function toStoredProfiles(profiles: MachineProfile[]): StoredProfiles {
  return { version: PROFILE_SCHEMA_VERSION, profiles };
}

export interface ProfileImportResult {
  ok: boolean;
  profile?: MachineProfile;
  error?: string;
  /** Soft warnings (e.g. invalid inset fields replaced during import). */
  warnings?: string[];
}

/**
 * Parses a user-supplied JSON profile.
 *
 * The import always produces a fresh id so it cannot silently overwrite an
 * existing profile the user still relies on.
 */
export function parseProfileImport(text: string): ProfileImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: 'A profile must be a JSON object.' };
  }
  if (typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
    return {
      ok: false,
      error: 'The file does not look like a machine profile: no "name" field.',
    };
  }
  const workspace = isRecord(parsed.workspace) ? parsed.workspace : {};
  const rawInsets =
    workspace.nonDrawableInsets ??
    (isRecord(parsed.nonDrawableInsets) ? parsed.nonDrawableInsets : undefined);
  const { warnings: insetWarnings } = sanitizeNonDrawableInsets(rawInsets);
  const rawPlacement =
    workspace.mediaPlacement ??
    (isRecord(parsed.mediaPlacement) ? parsed.mediaPlacement : undefined);
  const { warnings: placementWarnings } = sanitizeMediaPlacement(rawPlacement);
  const warnings = [...insetWarnings, ...placementWarnings];
  return {
    ok: true,
    profile: sanitizeProfile(parsed, false),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function serializeProfile(profile: MachineProfile): string {
  return JSON.stringify(
    { schemaVersion: PROFILE_SCHEMA_VERSION, ...profile },
    null,
    2,
  );
}

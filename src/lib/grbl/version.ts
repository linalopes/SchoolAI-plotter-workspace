/**
 * Firmware version and capability detection.
 *
 * Capabilities are derived from the startup banner's version token, not merely
 * from the word "Grbl". A profile override can force 0.9 or 1.1 behaviour when
 * auto-detection is incomplete or wrong.
 */

export type FirmwareFamily = 'grbl' | 'unknown';

/** Profile setting: how the application should speak to the controller. */
export type ProtocolCompatibility = 'auto' | 'grbl-0.9' | 'grbl-1.1';

/** The protocol in force after applying detection and any override. */
export type EffectiveProtocol = 'grbl-0.9' | 'grbl-1.1' | 'unknown';

export interface FirmwareCapabilities {
  /** True when the controller accepts `$J=` finite jog commands (GRBL 1.1+). */
  supportsJogCommand: boolean;
}

export interface FirmwareIdentity {
  /** Untouched startup banner line. */
  rawBanner: string;
  family: FirmwareFamily;
  /** Token after "Grbl", e.g. `0.9i` or `1.1h`. */
  versionLabel: string | null;
  major: number | null;
  minor: number | null;
  capabilities: FirmwareCapabilities;
}

export const PROTOCOL_COMPATIBILITY_OPTIONS: ReadonlyArray<{
  value: ProtocolCompatibility;
  label: string;
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'grbl-0.9', label: 'GRBL 0.9 legacy' },
  { value: 'grbl-1.1', label: 'GRBL 1.1+' },
];

export const UNKNOWN_IDENTITY: FirmwareIdentity = {
  rawBanner: '',
  family: 'unknown',
  versionLabel: null,
  major: null,
  minor: null,
  capabilities: { supportsJogCommand: false },
};

/**
 * Parses a GRBL startup banner such as `Grbl 0.9i ['$' for help]`.
 *
 * The version token is split into major and minor so `0.9i` and `1.1h` resolve
 * to different capability sets. A letter suffix is ignored for comparison.
 */
export function parseFirmwareBanner(raw: string): FirmwareIdentity {
  const trimmed = raw.trim();
  const match = /^Grbl\s+(\S+)/i.exec(trimmed);
  if (!match?.[1]) {
    return { ...UNKNOWN_IDENTITY, rawBanner: trimmed };
  }

  const versionLabel = match[1];
  const numeric = /^(\d+)\.(\d+)/.exec(versionLabel);
  const major = numeric?.[1] !== undefined ? Number.parseInt(numeric[1], 10) : null;
  const minor = numeric?.[2] !== undefined ? Number.parseInt(numeric[2], 10) : null;

  const family: FirmwareFamily = 'grbl';
  const capabilities = capabilitiesFromVersion(major, minor);

  return {
    rawBanner: trimmed,
    family,
    versionLabel,
    major: Number.isFinite(major) ? major : null,
    minor: Number.isFinite(minor) ? minor : null,
    capabilities,
  };
}

/** GRBL 1.1 and later support `$J=`; 0.9 and earlier do not. */
export function capabilitiesFromVersion(
  major: number | null,
  minor: number | null,
): FirmwareCapabilities {
  if (major === null) {
    return { supportsJogCommand: false };
  }
  if (major > 1) {
    return { supportsJogCommand: true };
  }
  if (major === 1 && (minor === null || minor >= 1)) {
    return { supportsJogCommand: true };
  }
  return { supportsJogCommand: false };
}

export interface ResolvedProtocol {
  effectiveProtocol: EffectiveProtocol;
  capabilities: FirmwareCapabilities;
  /** Human-readable label for Overview and Connection. */
  label: string;
  /** True when the profile override differed from the detected banner. */
  overridden: boolean;
}

/**
 * Applies the profile's protocol compatibility setting on top of the detected
 * firmware identity.
 */
export function resolveProtocol(
  identity: FirmwareIdentity | null,
  override: ProtocolCompatibility,
): ResolvedProtocol {
  if (override === 'grbl-0.9') {
    return {
      effectiveProtocol: 'grbl-0.9',
      capabilities: { supportsJogCommand: false },
      label: 'GRBL 0.9 legacy (profile override)',
      overridden: true,
    };
  }

  if (override === 'grbl-1.1') {
    return {
      effectiveProtocol: 'grbl-1.1',
      capabilities: { supportsJogCommand: true },
      label: 'GRBL 1.1+ (profile override)',
      overridden: true,
    };
  }

  // Auto
  if (!identity || identity.family === 'unknown' || identity.major === null) {
    return {
      effectiveProtocol: 'unknown',
      capabilities: { supportsJogCommand: false },
      label: 'Not detected',
      overridden: false,
    };
  }

  if (identity.capabilities.supportsJogCommand) {
    return {
      effectiveProtocol: 'grbl-1.1',
      capabilities: identity.capabilities,
      label: `GRBL ${identity.versionLabel ?? '1.1+'} (detected)`,
      overridden: false,
    };
  }

  return {
    effectiveProtocol: 'grbl-0.9',
    capabilities: identity.capabilities,
    label: `GRBL ${identity.versionLabel ?? '0.9'} (detected)`,
    overridden: false,
  };
}

export function formatProtocolLabel(resolved: ResolvedProtocol): string {
  return resolved.label;
}

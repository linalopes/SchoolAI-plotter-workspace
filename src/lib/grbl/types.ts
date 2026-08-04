/** GRBL protocol vocabulary. */

import type {
  EffectiveProtocol,
  FirmwareCapabilities,
  FirmwareIdentity,
  ProtocolCompatibility,
} from './version';

export type {
  EffectiveProtocol,
  FirmwareCapabilities,
  FirmwareIdentity,
  ProtocolCompatibility,
};

export type GrblMachineState =
  | 'Idle'
  | 'Run'
  | 'Hold'
  | 'Jog'
  | 'Alarm'
  | 'Door'
  | 'Check'
  | 'Home'
  | 'Sleep'
  | 'Unknown';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * One decoded status report.
 *
 * Every field beyond `state` and `raw` is optional: GRBL builds differ in which
 * fields they report, and reports omit unchanged values to save bandwidth.
 */
export interface GrblStatus {
  state: GrblMachineState;
  /** Sub-state digit, e.g. `Hold:0`. */
  subState: number | null;
  mpos: Vec3 | null;
  wpos: Vec3 | null;
  wco: Vec3 | null;
  feed: number | null;
  spindle: number | null;
  /** Limit and control pins currently asserted, as the raw `Pn:` payload. */
  pins: string | null;
  plannerBuffer: number | null;
  rxBuffer: number | null;
  lineNumber: number | null;
  overrides: { feed: number; rapid: number; spindle: number } | null;
  /** The untouched line, always retained for the console and for debugging. */
  raw: string;
  receivedAt: number;
}

export interface GrblSetting {
  key: number;
  value: string;
  /** Friendly name when the key is one of the documented settings. */
  label: string | null;
  unit: string | null;
}

/** Distance and units modes captured from a `$G` parser-state report. */
export interface ParserModalState {
  distanceMode: 'G90' | 'G91' | null;
  units: 'G20' | 'G21' | null;
  /** All modal tokens found in the report, for diagnostics. */
  modes: string[];
  raw: string;
}

/**
 * A controller error response.
 *
 * GRBL 1.1 uses numbered codes (`error:2`). GRBL 0.9 uses free text
 * (`error: Bad number format`). `numeric` distinguishes the two so the console
 * can avoid printing the same phrase twice.
 */
export interface GrblErrorMessage {
  kind: 'error';
  /** Numeric code when present; `-1` for textual GRBL 0.9 errors. */
  code: number;
  /** Human-readable explanation (lookup table, or the text after `error:`). */
  description: string;
  /** True when the controller sent a numeric `error:n`. */
  numeric: boolean;
  raw: string;
}

export type GrblMessage =
  | { kind: 'ok' }
  | GrblErrorMessage
  | { kind: 'alarm'; code: number; description: string; raw: string }
  | {
      kind: 'welcome';
      version: string;
      raw: string;
      identity: FirmwareIdentity;
    }
  | { kind: 'status'; status: GrblStatus }
  | { kind: 'setting'; setting: GrblSetting; raw: string }
  | { kind: 'version'; version: string; build: string | null; raw: string }
  | { kind: 'options'; options: string; raw: string }
  | { kind: 'message'; text: string; raw: string }
  | { kind: 'parserState'; state: ParserModalState; raw: string }
  | { kind: 'feedback'; raw: string }
  | { kind: 'unknown'; raw: string };

export type ConsoleDirection = 'TX' | 'RX' | 'SYSTEM' | 'ERROR';

export type ConsoleEntryType =
  | 'command'
  | 'realtime'
  | 'response'
  | 'status'
  | 'notice'
  | 'error'
  | 'alarm';

export interface ConsoleEntry {
  id: number;
  timestamp: Date;
  direction: ConsoleDirection;
  message: string;
  type: ConsoleEntryType;
}

export type ConnectionPhase =
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnecting';

export interface ConnectionInfo {
  phase: ConnectionPhase;
  /** Which transport backs the current session, if any. */
  kind: 'web-serial' | 'demo' | null;
  portDescription: string | null;
  baudRate: number | null;
  /** Version reported in the startup banner (e.g. `0.9i`). */
  bannerVersion: string | null;
  /** Untouched startup banner line. */
  rawFirmwareBanner: string | null;
  /** Parsed identity from the banner, when available. */
  firmwareIdentity: FirmwareIdentity | null;
  /** Profile override in force for this session. */
  protocolCompatibility: ProtocolCompatibility;
  /** Protocol after combining detection with the profile override. */
  effectiveProtocol: EffectiveProtocol;
  /** Capability flags for the effective protocol. */
  capabilities: FirmwareCapabilities;
  /** Display label for Overview and Connection. */
  protocolLabel: string;
  /** Version reported by `$I`, which also carries the build date. */
  firmwareVersion: string | null;
  firmwareBuild: string | null;
  options: string | null;
  lastError: string | null;
}

export interface QueuedCommandState {
  id: number;
  command: string;
  status: 'pending' | 'sent' | 'completed' | 'failed';
  error: string | null;
}

export type CommandResultCode =
  | 'TIMEOUT'
  | 'LATE_ACKNOWLEDGEMENT'
  | 'TIMEOUT_BLOCKED'
  | 'IDLE_TIMEOUT'
  | 'CANCELLED'
  | 'ALARM'
  | 'DISCONNECTED'
  | 'RESET';

export interface CommandResult {
  ok: boolean;
  command: string;
  /** Populated when the controller answered with an error or the command expired. */
  error?: string;
  /** Machine-readable failure class for job recovery and diagnostics. */
  code?: CommandResultCode;
}

export interface WaitForIdleOptions {
  timeoutMs?: number;
  pollingIntervalMs?: number;
  /** When true, the wait rejects as cancelled. */
  isCancelled?: () => boolean;
}

import { MockSerialTransport } from '../serial/mockSerialTransport';
import { serialLineEnding } from '../serial/transport';
import {
  TransportError,
  type Transport,
  type TransportHandlers,
  type TransportKind,
} from '../serial/types';
import { WebSerialTransport } from '../serial/webSerialTransport';
import type {
  LineEnding,
  ProtocolCompatibility,
} from '../machines/profiles/types';
import {
  COMMANDS,
  REALTIME_BYTES,
  type JogAxis,
  type RealtimeCommand,
} from './commands';
import { performJog } from './jog';
import { parseLine, resolvePositions } from './parser';
import type {
  CommandResult,
  ConnectionInfo,
  ConsoleDirection,
  ConsoleEntryType,
  FirmwareIdentity,
  GrblSetting,
  GrblStatus,
  ParserModalState,
  QueuedCommandState,
  Vec3,
  WaitForIdleOptions,
} from './types';
import { resolveProtocol } from './version';

export type { CommandResult, WaitForIdleOptions };

export interface GrblConnectOptions {
  kind: TransportKind;
  baudRate: number;
  lineEnding: LineEnding;
  statusPollIntervalMs: number;
  /** Acknowledgement timeout after the command is written to serial. */
  commandTimeoutMs: number;
  /** How long waitForIdle may wait for Idle (separate from ack timeout). */
  motionIdleTimeoutMs: number;
  protocolCompatibility: ProtocolCompatibility;
}

/**
 * Builds the transport for a connection mode.
 *
 * Injectable so tests can supply a stub, and so a future transport — a
 * WebSocket bridge, say — can be added without touching the client.
 */
export type TransportFactory = (
  kind: TransportKind,
  handlers: TransportHandlers,
) => Transport;

export const defaultTransportFactory: TransportFactory = (kind, handlers) =>
  kind === 'demo'
    ? new MockSerialTransport(handlers)
    : new WebSerialTransport(handlers);

export interface GrblClientCallbacks {
  onConsole: (
    direction: ConsoleDirection,
    message: string,
    type: ConsoleEntryType,
  ) => void;
  onConnectionChange: (patch: Partial<ConnectionInfo>) => void;
  onStatus: (status: GrblStatus) => void;
  onSettings: (settings: GrblSetting[]) => void;
  onQueueChange: (queue: QueuedCommandState[]) => void;
  /** Fired when a multi-step jog transaction starts or ends. */
  onJogBusyChange?: (busy: boolean) => void;
}

interface QueueEntry {
  id: number;
  command: string;
  /** Profile / caller acknowledgement budget (used for non-motion defaults). */
  timeoutMs: number;
  /** True when the caller passed an explicit per-send timeout (tests / special cases). */
  explicitTimeout: boolean;
  kind: QueuedCommandKind;
  resolve: (result: CommandResult) => void;
  state: QueuedCommandState;
  /** Set when the bytes have been written to the transport. */
  writtenAt: number | null;
}

interface TimedOutCommand {
  id: number;
  command: string;
  timedOutAt: number;
  writtenAt: number | null;
}

interface IdleWaiter {
  onStatus: () => void;
  reject: (error: Error) => void;
}

/** How long to wait for the startup banner before proceeding regardless. */
const BANNER_TIMEOUT_MS = 2500;

/** Homing traverses the whole machine, so it needs far longer than a jog. */
const HOMING_TIMEOUT_MS = 60_000;

const DEFAULT_ACK_TIMEOUT_MS = 10_000;
const DEFAULT_MOTION_IDLE_TIMEOUT_MS = 30_000;
/** Status younger than this means the controller is still talking. */
const RESPONSIVE_STATUS_WINDOW_MS = 2_500;
/** Pen command acknowledgement after an Idle barrier. */
const PEN_ACK_TIMEOUT_MS = 10_000;
/** Motion (G0/G1) acknowledgement while the controller may be planner-busy. */
const MOTION_ACK_TIMEOUT_MS = 30_000;
/** Fail when no RX of any kind arrives for this long. */
const SERIAL_SILENCE_TIMEOUT_MS = 10_000;
/** Absolute ceiling for a single motion command acknowledgement. */
const MOTION_PROGRESS_MAX_MS = 60_000;
/** Watchdog evaluation cadence while a command is in flight. */
const ACK_WATCHDOG_INTERVAL_MS = 250;

export type QueuedCommandKind = 'motion' | 'pen' | 'other';

/** Classifies a queued line for acknowledgement deadlines. */
export function classifyQueuedCommand(command: string): QueuedCommandKind {
  const trimmed = command.trim().toUpperCase();
  // G0 / G00 / G1 / G01 only — not G21, G90, G17, …
  if (/^G0*0(\s|$)/.test(trimmed) || /^G0*1(\s|$)/.test(trimmed)) {
    return 'motion';
  }
  if (/^M[345](\s|$)/.test(trimmed)) return 'pen';
  return 'other';
}

/**
 * Protocol-level GRBL client.
 *
 * Owns exactly one transport at a time and mediates every byte in both
 * directions. Two independent paths exist by design:
 *
 *   - the queued path, which sends one command at a time and waits for `ok` or
 *     `error:n` before releasing the next;
 *   - the realtime path, which writes a single byte straight to the device.
 *     Realtime bytes never produce `ok`, so they must never enter the queue.
 */
export class GrblClient {
  #callbacks: GrblClientCallbacks;
  #createTransport: TransportFactory;
  #transport: Transport | null = null;
  #options: GrblConnectOptions | null = null;

  #queue: QueueEntry[] = [];
  #inFlight: QueueEntry | null = null;
  #commandTimer: ReturnType<typeof setTimeout> | null = null;
  #nextCommandId = 1;

  #pollTimer: ReturnType<typeof setInterval> | null = null;
  #onVisibilityChange: (() => void) | null = null;

  #awaitBanner: (() => void) | null = null;
  #cachedWco: Vec3 | null = null;
  #settings = new Map<number, GrblSetting>();
  #collectingSettings = false;

  /** Status traffic is noisy; it only reaches the console when asked for. */
  #logStatusReports = false;
  /** Lets a manually requested `?` show its reply even when logging is off. */
  #logNextStatus = false;
  #phase: ConnectionInfo['phase'] = 'disconnected';

  #protocolCompatibility: ProtocolCompatibility = 'auto';
  #firmwareIdentity: FirmwareIdentity | null = null;
  #lastStatus: GrblStatus | null = null;
  #lastParserState: ParserModalState | null = null;
  #jogBusy = false;
  #lastSerialActivityAt = 0;
  #lastStatusAt = 0;
  /**
   * After an acknowledgement timeout, the queue stays blocked until a late
   * `ok` is consumed or the user clears the block (soft-reset / recover).
   */
  #timeoutBlock: TimedOutCommand | null = null;
  /**
   * After the user clears a timeout block without consuming a late `ok`, the
   * next `ok` is treated as LATE_ACKNOWLEDGEMENT and never completes a newer
   * in-flight command.
   */
  #orphanOkExpected = false;
  #idleWaiters: IdleWaiter[] = [];
  #idlePollOutstanding = false;

  constructor(
    callbacks: GrblClientCallbacks,
    createTransport: TransportFactory = defaultTransportFactory,
  ) {
    this.#callbacks = callbacks;
    this.#createTransport = createTransport;
  }

  // ------------------------------------------------------------- lifecycle

  isConnected(): boolean {
    return this.#phase === 'connected' || this.#phase === 'handshaking';
  }

  getPhase(): ConnectionInfo['phase'] {
    return this.#phase;
  }

  isJogBusy(): boolean {
    return this.#jogBusy;
  }

  supportsJogCommand(): boolean {
    return resolveProtocol(this.#firmwareIdentity, this.#protocolCompatibility)
      .capabilities.supportsJogCommand;
  }

  getFirmwareIdentity(): FirmwareIdentity | null {
    return this.#firmwareIdentity;
  }

  setLogStatusReports(enabled: boolean): void {
    this.#logStatusReports = enabled;
  }

  /** Applies a profile protocol override without reconnecting. */
  setProtocolCompatibility(value: ProtocolCompatibility): void {
    this.#protocolCompatibility = value;
    this.#publishProtocol();
  }

  /**
   * Creates the transport for the requested mode, disposing any previous one.
   * Kept separate from `connect` so the user can pick a port first.
   */
  async prepareTransport(kind: TransportKind): Promise<Transport> {
    if (this.#transport && this.#transport.kind === kind) {
      return this.#transport;
    }
    if (this.#transport) {
      await this.#transport.dispose();
      this.#transport = null;
    }

    const handlers: TransportHandlers = {
      onLine: (line) => this.#handleLine(line),
      onStateChange: (state) => {
        if (state === 'disconnected' && this.#phase !== 'disconnected') {
          this.#finalizeDisconnect();
        }
      },
      onError: (error) => this.#handleTransportError(error),
      onNotice: (message) => this.#log('SYSTEM', message, 'notice'),
    };

    this.#transport = this.#createTransport(kind, handlers);
    return this.#transport;
  }

  hasPort(): boolean {
    return this.#transport?.hasPort() ?? false;
  }

  /** Must be invoked directly from a user gesture. */
  async selectPort(kind: TransportKind): Promise<boolean> {
    const transport = await this.prepareTransport(kind);
    const selected = await transport.selectPort();
    if (selected) {
      this.#callbacks.onConnectionChange({
        portDescription: this.#describePort(),
      });
    }
    return selected;
  }

  #describePort(): string | null {
    if (this.#transport instanceof WebSerialTransport) {
      return this.#transport.describePort();
    }
    if (this.#transport?.kind === 'demo') return 'Simulated GRBL controller';
    return null;
  }

  async connect(options: GrblConnectOptions): Promise<void> {
    if (this.#phase !== 'disconnected') return;

    this.#options = options;
    this.#protocolCompatibility = options.protocolCompatibility;
    this.#firmwareIdentity = null;
    this.#lastStatus = null;
    this.#lastParserState = null;
    this.#setPhase('connecting');
    this.#callbacks.onConnectionChange({
      kind: options.kind,
      baudRate: options.baudRate,
      lastError: null,
      bannerVersion: null,
      rawFirmwareBanner: null,
      firmwareIdentity: null,
      protocolCompatibility: options.protocolCompatibility,
      firmwareVersion: null,
      firmwareBuild: null,
      options: null,
    });
    this.#publishProtocol();

    const transport = await this.prepareTransport(options.kind);

    try {
      await transport.open({ baudRate: options.baudRate });
    } catch (error) {
      this.#setPhase('disconnected');
      this.#reportError(error);
      throw error;
    }

    this.#callbacks.onConnectionChange({ portDescription: this.#describePort() });

    try {
      await this.#handshake();
    } catch (error) {
      // A failed handshake still leaves a usable port: the console and raw
      // command input remain available so the user can diagnose the baud rate.
      this.#reportError(error);
    }
  }

  /**
   * Post-open negotiation.
   *
   * No motion command is sent here. The controller is given time to finish its
   * auto-reset, then only identification and status queries are issued.
   */
  async #handshake(): Promise<void> {
    this.#setPhase('handshaking');
    this.#log(
      'SYSTEM',
      'Waiting for the GRBL startup banner. The controller may reset when the port opens.',
      'notice',
    );

    const sawBanner = await this.#waitForBanner();
    if (!sawBanner) {
      this.#log(
        'SYSTEM',
        'No startup banner received. The controller may already have been running, or the baud rate may be wrong.',
        'notice',
      );
    }

    const info = await this.send(COMMANDS.buildInfo);
    if (!info.ok) {
      this.#log(
        'SYSTEM',
        'The controller did not answer $I. Check that the baud rate matches the firmware.',
        'notice',
      );
    }

    await this.requestSettings();
    this.#setPhase('connected');
    this.requestStatus(true);
    this.#startPolling();
  }

  #waitForBanner(): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#awaitBanner = null;
        resolve(false);
      }, BANNER_TIMEOUT_MS);

      this.#awaitBanner = () => {
        clearTimeout(timer);
        this.#awaitBanner = null;
        resolve(true);
      };
    });
  }

  async disconnect(): Promise<void> {
    if (this.#phase === 'disconnected' || this.#phase === 'disconnecting') return;
    this.#setPhase('disconnecting');
    this.#stopPolling();
    this.#failPendingCommands('The connection was closed.');
    try {
      await this.#transport?.close();
    } finally {
      this.#finalizeDisconnect();
    }
  }

  /** Single place where the client returns to a clean disconnected state. */
  #finalizeDisconnect(): void {
    this.#stopPolling();
    this.#failPendingCommands('The connection was closed.', 'DISCONNECTED');
    this.#orphanOkExpected = false;
    this.#cachedWco = null;
    this.#collectingSettings = false;
    this.#firmwareIdentity = null;
    this.#lastStatus = null;
    this.#lastParserState = null;
    this.#jogBusy = false;
    this.#callbacks.onJogBusyChange?.(false);
    this.#setPhase('disconnected');
    this.#callbacks.onConnectionChange({
      portDescription: this.#transport?.hasPort()
        ? this.#describePort()
        : null,
      bannerVersion: null,
      rawFirmwareBanner: null,
      firmwareIdentity: null,
      firmwareVersion: null,
      firmwareBuild: null,
      options: null,
    });
    this.#publishProtocol();
  }

  #publishProtocol(): void {
    const resolved = resolveProtocol(
      this.#firmwareIdentity,
      this.#protocolCompatibility,
    );
    this.#callbacks.onConnectionChange({
      protocolCompatibility: this.#protocolCompatibility,
      effectiveProtocol: resolved.effectiveProtocol,
      capabilities: resolved.capabilities,
      protocolLabel: resolved.label,
      firmwareIdentity: this.#firmwareIdentity,
    });
  }

  async dispose(): Promise<void> {
    this.#stopPolling();
    this.#failPendingCommands('The application released the connection.');
    await this.#transport?.dispose();
    this.#transport = null;
    this.#setPhase('disconnected');
  }

  // --------------------------------------------------------- queued commands

  /**
   * Queues a command and resolves once the controller answers.
   *
   * Resolution, not rejection, carries controller-level failures: an
   * `error:20` is information for the user, not an exception for the caller.
   */
  send(command: string, timeoutMs?: number): Promise<CommandResult> {
    const trimmed = command.trim();

    if (trimmed.length === 0) {
      return Promise.resolve({
        ok: false,
        command: trimmed,
        error: 'Empty commands are not sent.',
      });
    }
    if (!this.isConnected()) {
      const error = 'Not connected. Commands are only sent to an open machine.';
      this.#log('ERROR', error, 'error');
      return Promise.resolve({
        ok: false,
        command: trimmed,
        error,
        code: 'DISCONNECTED',
      });
    }
    if (this.#timeoutBlock) {
      const error =
        `Previous command timed out (${this.#timeoutBlock.command}). Soft-reset or clear the timeout before continuing.`;
      this.#log('ERROR', error, 'error');
      return Promise.resolve({
        ok: false,
        command: trimmed,
        error,
        code: 'TIMEOUT_BLOCKED',
      });
    }

    const kind = classifyQueuedCommand(trimmed);
    const explicitTimeout = timeoutMs !== undefined;
    const resolvedTimeout =
      timeoutMs ??
      (trimmed.toUpperCase() === COMMANDS.home
        ? HOMING_TIMEOUT_MS
        : kind === 'motion'
          ? MOTION_ACK_TIMEOUT_MS
          : kind === 'pen'
            ? PEN_ACK_TIMEOUT_MS
            : (this.#options?.commandTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS));

    return new Promise<CommandResult>((resolve) => {
      const id = this.#nextCommandId++;
      this.#queue.push({
        id,
        command: trimmed,
        timeoutMs: resolvedTimeout,
        explicitTimeout,
        kind,
        resolve,
        state: { id, command: trimmed, status: 'pending', error: null },
        writtenAt: null,
      });
      this.#emitQueue();
      void this.#pump();
    });
  }

  /** True while a queued command is waiting for its response. */
  hasPendingCommand(): boolean {
    return this.#inFlight !== null || this.#queue.length > 0;
  }

  /** True after an acknowledgement timeout until late-ack or user recovery. */
  isTimeoutBlocked(): boolean {
    return this.#timeoutBlock !== null;
  }

  /**
   * Clears the post-timeout queue block so normal commands may resume.
   * Prefer soft-reset when the controller state is unknown.
   */
  clearTimeoutBlock(): void {
    if (!this.#timeoutBlock) return;
    this.#log(
      'SYSTEM',
      `Cleared timeout block for: ${this.#timeoutBlock.command}. Prefer soft-reset if controller state is unknown.`,
      'notice',
    );
    this.#orphanOkExpected = true;
    this.#timeoutBlock = null;
    void this.#pump();
  }

  getLastStatus(): GrblStatus | null {
    return this.#lastStatus;
  }

  /**
   * Waits until GRBL reports Idle using realtime `?` status requests.
   *
   * Requires a fresh Idle status received after this wait starts. A cached
   * Idle from before motion was queued must not skip the barrier — that race
   * was causing pen commands to be sent while the planner was still draining.
   * Does not enqueue a normal G-code command.
   */
  waitForIdle(options: WaitForIdleOptions = {}): Promise<void> {
    const timeoutMs =
      options.timeoutMs ??
      this.#options?.motionIdleTimeoutMs ??
      DEFAULT_MOTION_IDLE_TIMEOUT_MS;
    const pollingIntervalMs = options.pollingIntervalMs ?? 250;

    if (!this.isConnected()) {
      return Promise.reject(
        Object.assign(new Error('Not connected. Cannot wait for Idle.'), {
          code: 'DISCONNECTED' as const,
        }),
      );
    }
    if (options.isCancelled?.()) {
      return Promise.reject(
        Object.assign(new Error('Idle wait cancelled.'), {
          code: 'CANCELLED' as const,
        }),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      let settled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (pollTimer !== null) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        const index = this.#idleWaiters.indexOf(waiter);
        if (index >= 0) this.#idleWaiters.splice(index, 1);
        this.#idlePollOutstanding = false;
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const evaluate = () => {
        if (settled) return;
        if (options.isCancelled?.()) {
          fail(
            Object.assign(new Error('Idle wait cancelled.'), {
              code: 'CANCELLED' as const,
            }),
          );
          return;
        }
        if (!this.isConnected()) {
          fail(
            Object.assign(
              new Error('Disconnected while waiting for Idle.'),
              { code: 'DISCONNECTED' as const },
            ),
          );
          return;
        }

        const status = this.#lastStatus;
        const state = status?.state ?? null;
        if (state === 'Alarm') {
          fail(
            Object.assign(
              new Error('Controller entered Alarm while waiting for Idle.'),
              { code: 'ALARM' as const },
            ),
          );
          return;
        }
        // Only accept Idle reported after this wait began (strictly after, so a
        // same-millisecond cached Idle cannot skip the barrier).
        if (state === 'Idle' && this.#lastStatusAt > startedAt) {
          succeed();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          const position = status?.wpos ?? status?.mpos;
          const posLabel = position
            ? `X${position.x.toFixed(3)} Y${position.y.toFixed(3)}`
            : 'unknown';
          fail(
            Object.assign(
              new Error(
                `Motion did not reach Idle within ${Math.round(timeoutMs / 1000)} seconds. Last state: ${state ?? 'unknown'}; position: ${posLabel}.`,
              ),
              { code: 'IDLE_TIMEOUT' as const },
            ),
          );
        }
      };

      const waiter: IdleWaiter = {
        onStatus: () => {
          this.#idlePollOutstanding = false;
          evaluate();
        },
        reject: fail,
      };
      this.#idleWaiters.push(waiter);

      const requestPoll = () => {
        if (settled || this.#idlePollOutstanding) return;
        this.#idlePollOutstanding = true;
        this.requestStatus(false);
      };

      requestPoll();
      pollTimer = setInterval(() => {
        evaluate();
        requestPoll();
      }, pollingIntervalMs);
    });
  }

  /**
   * Finite jog for the active protocol.
   *
   * GRBL 1.1 uses `$J=`. GRBL 0.9 uses a temporary incremental G1 transaction
   * that restores modal state afterwards. See `jog.ts`.
   */
  async jog(
    axis: JogAxis,
    distanceMm: number,
    feedRateMmMin: number,
  ): Promise<CommandResult> {
    return performJog(
      {
        isConnected: () => this.isConnected(),
        isJogBusy: () => this.#jogBusy,
        setJogBusy: (busy) => {
          this.#jogBusy = busy;
          this.#callbacks.onJogBusyChange?.(busy);
        },
        supportsJogCommand: () => this.supportsJogCommand(),
        getMachineState: () => this.#lastStatus?.state ?? null,
        send: (command, timeoutMs) => this.send(command, timeoutMs),
        requestStatus: (manual) => this.requestStatus(manual ?? false),
        getLastParserState: () => this.#lastParserState,
        clearLastParserState: () => {
          this.#lastParserState = null;
        },
        logSystem: (message) => this.#log('SYSTEM', message, 'notice'),
        logError: (message) => this.#log('ERROR', message, 'error'),
      },
      axis,
      distanceMm,
      feedRateMmMin,
    );
  }

  async #pump(): Promise<void> {
    if (this.#timeoutBlock) return;
    if (this.#inFlight || this.#queue.length === 0) return;
    const entry = this.#queue.shift();
    if (!entry) return;

    this.#inFlight = entry;
    entry.state.status = 'sent';
    this.#emitQueue();

    const ending = serialLineEnding(this.#options?.lineEnding ?? 'lf');

    try {
      this.#log('TX', entry.command, 'command');
      await this.#transport?.write(entry.command + ending);
      this.#lastSerialActivityAt = Date.now();
      entry.writtenAt = Date.now();
    } catch (error) {
      if (this.#inFlight !== entry) return;
      this.#completeInFlight({
        ok: false,
        command: entry.command,
        error: error instanceof Error ? error.message : 'The command could not be sent.',
      });
      return;
    }

    // The reply can arrive while the write is still settling, in which case the
    // entry is already finished and no timer is needed. Every path that could
    // act on a stale entry checks identity first, so a timer armed for one
    // command can never fail the next one.
    if (this.#inFlight !== entry) return;

    // Status-aware acknowledgement watchdog begins after the write completes.
    this.#armAckWatchdog(entry);
  }

  #armAckWatchdog(entry: QueueEntry): void {
    if (this.#commandTimer !== null) {
      clearTimeout(this.#commandTimer);
      this.#commandTimer = null;
    }
    this.#commandTimer = setTimeout(() => {
      this.#evaluateAckWatchdog(entry);
    }, ACK_WATCHDOG_INTERVAL_MS);
  }

  #evaluateAckWatchdog(entry: QueueEntry): void {
    if (this.#inFlight !== entry) return;

    const now = Date.now();
    const writtenAt = entry.writtenAt ?? now;
    const elapsed = now - writtenAt;
    const silenceMs =
      this.#lastSerialActivityAt > 0
        ? now - this.#lastSerialActivityAt
        : elapsed;
    const statusFresh =
      this.#lastStatusAt > 0 &&
      now - this.#lastStatusAt < RESPONSIVE_STATUS_WINDOW_MS;
    const state = this.#lastStatus?.state ?? null;
    const motionBusy =
      state === 'Run' || state === 'Hold' || state === 'Jog' || state === 'Home';

    // Explicit per-send timeout (tests / special callers) is a hard ceiling.
    if (entry.explicitTimeout && elapsed >= entry.timeoutMs) {
      this.#failInFlightByTimeout(entry, statusFresh || silenceMs < RESPONSIVE_STATUS_WINDOW_MS);
      return;
    }

    // Genuine serial silence — reader/writer appears dead.
    if (silenceMs >= SERIAL_SILENCE_TIMEOUT_MS) {
      this.#failInFlightByTimeout(entry, false);
      return;
    }

    if (entry.kind === 'motion' && !entry.explicitTimeout) {
      if (elapsed >= MOTION_PROGRESS_MAX_MS) {
        this.#failInFlightByTimeout(entry, statusFresh);
        return;
      }
      // Planner backpressure: ok may arrive late while Run + status continue.
      if (statusFresh && motionBusy) {
        this.#armAckWatchdog(entry);
        return;
      }
      if (elapsed < MOTION_ACK_TIMEOUT_MS) {
        this.#armAckWatchdog(entry);
        return;
      }
      this.#failInFlightByTimeout(entry, statusFresh);
      return;
    }

    if (entry.kind === 'pen' && !entry.explicitTimeout) {
      if (elapsed < PEN_ACK_TIMEOUT_MS) {
        this.#armAckWatchdog(entry);
        return;
      }
      this.#failInFlightByTimeout(entry, statusFresh);
      return;
    }

    if (elapsed < entry.timeoutMs) {
      this.#armAckWatchdog(entry);
      return;
    }
    this.#failInFlightByTimeout(entry, statusFresh);
  }

  #failInFlightByTimeout(entry: QueueEntry, controllerResponsive: boolean): void {
    const elapsed = entry.writtenAt ? Date.now() - entry.writtenAt : entry.timeoutMs;
    const error = controllerResponsive
      ? `Command acknowledgement delayed while controller is responsive (${Math.round(elapsed)} ms). Pending: ${entry.command}`
      : `No serial activity — no response within ${Math.round(elapsed)} ms. Pending: ${entry.command}`;

    this.#timeoutBlock = {
      id: entry.id,
      command: entry.command,
      timedOutAt: Date.now(),
      writtenAt: entry.writtenAt,
    };

    if (this.#commandTimer !== null) {
      clearTimeout(this.#commandTimer);
      this.#commandTimer = null;
    }

    const state = this.#lastStatus?.state ?? 'unknown';
    const statusAge =
      this.#lastStatusAt > 0 ? Date.now() - this.#lastStatusAt : null;
    this.#log(
      'SYSTEM',
      [
        'TIMEOUT_DIAGNOSTIC',
        `pending=${entry.command}`,
        `kind=${entry.kind}`,
        `elapsedMs=${Math.round(elapsed)}`,
        `grblState=${state}`,
        `statusAgeMs=${statusAge ?? 'n/a'}`,
        `responsive=${controllerResponsive}`,
      ].join(' · '),
      'notice',
    );

    entry.state.status = 'failed';
    entry.state.error = error;
    this.#inFlight = null;
    this.#log('ERROR', `${entry.command} — ${error}`, 'error');
    entry.resolve({
      ok: false,
      command: entry.command,
      error,
      code: 'TIMEOUT',
    });
    this.#emitQueue();
    // Do not pump — a late ok must not be assigned to a later command.
  }

  #completeInFlight(result: CommandResult): void {
    const entry = this.#inFlight;
    if (!entry) return;

    if (this.#commandTimer !== null) {
      clearTimeout(this.#commandTimer);
      this.#commandTimer = null;
    }

    entry.state.status = result.ok ? 'completed' : 'failed';
    entry.state.error = result.error ?? null;
    this.#inFlight = null;

    if (!result.ok && result.error) {
      this.#log('ERROR', `${entry.command} — ${result.error}`, 'error');
    }

    entry.resolve(result);
    this.#emitQueue();
    void this.#pump();
  }

  #failPendingCommands(reason: string, code?: CommandResult['code']): void {
    if (this.#commandTimer !== null) {
      clearTimeout(this.#commandTimer);
      this.#commandTimer = null;
    }
    this.#timeoutBlock = null;
    const pending = this.#inFlight ? [this.#inFlight, ...this.#queue] : [...this.#queue];
    this.#inFlight = null;
    this.#queue = [];
    for (const entry of pending) {
      entry.state.status = 'failed';
      entry.state.error = reason;
      entry.resolve({ ok: false, command: entry.command, error: reason, code });
    }
    this.#emitQueue();
    this.#rejectIdleWaiters(
      Object.assign(new Error(reason), { code: code ?? 'RESET' }),
    );
  }

  #rejectIdleWaiters(error: Error): void {
    const waiters = this.#idleWaiters;
    this.#idleWaiters = [];
    this.#idlePollOutstanding = false;
    for (const waiter of waiters) waiter.reject(error);
  }

  #emitQueue(): void {
    const states: QueuedCommandState[] = [];
    if (this.#inFlight) states.push({ ...this.#inFlight.state });
    for (const entry of this.#queue) states.push({ ...entry.state });
    this.#callbacks.onQueueChange(states);
  }

  // ------------------------------------------------------ realtime commands

  /**
   * Writes a single realtime byte, bypassing the queue entirely.
   *
   * A soft reset restarts the controller, so anything still waiting for `ok`
   * will never be answered and is failed immediately.
   */
  async sendRealtime(command: RealtimeCommand): Promise<void> {
    if (!this.isConnected()) {
      this.#log(
        'ERROR',
        'Not connected. Realtime commands are only sent to an open machine.',
        'error',
      );
      return;
    }

    const byte = REALTIME_BYTES[command];
    const label = `0x${byte.toString(16).padStart(2, '0')}`;

    if (command !== 'statusReport' || this.#logStatusReports) {
      this.#log('TX', `${describeRealtime(command)} [${label}]`, 'realtime');
    }

    try {
      await this.#transport?.writeBytes(Uint8Array.of(byte));
    } catch (error) {
      this.#reportError(error);
      return;
    }

    if (command === 'softReset') {
      this.#failPendingCommands('The controller was soft reset.', 'RESET');
      this.#cachedWco = null;
    }
  }

  requestStatus(manual = false): void {
    if (!this.isConnected()) return;
    if (manual) this.#logNextStatus = true;
    void this.sendRealtime('statusReport');
  }

  async requestBuildInfo(): Promise<CommandResult> {
    return this.send(COMMANDS.buildInfo);
  }

  async requestSettings(): Promise<CommandResult> {
    this.#settings.clear();
    this.#collectingSettings = true;
    const result = await this.send(COMMANDS.settings);
    this.#collectingSettings = false;
    this.#callbacks.onSettings(
      [...this.#settings.values()].sort((a, b) => a.key - b.key),
    );
    return result;
  }

  // ---------------------------------------------------------------- polling

  #startPolling(): void {
    this.#stopPolling();
    const interval = this.#options?.statusPollIntervalMs ?? 500;

    this.#pollTimer = setInterval(() => {
      if (!this.isConnected()) return;
      void this.sendRealtime('statusReport');
    }, interval);

    // A hidden tab does not need live coordinates, and browsers throttle timers
    // there anyway. Polling resumes with an immediate query on return.
    this.#onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.#pausePolling();
      } else if (this.isConnected() && this.#pollTimer === null) {
        this.#startPolling();
        void this.sendRealtime('statusReport');
      }
    };
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  #pausePolling(): void {
    if (this.#pollTimer !== null) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  #stopPolling(): void {
    this.#pausePolling();
    if (this.#onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.#onVisibilityChange);
      this.#onVisibilityChange = null;
    }
  }

  /** Applies a changed polling interval without dropping the connection. */
  setPollInterval(intervalMs: number): void {
    if (this.#options) this.#options.statusPollIntervalMs = intervalMs;
    if (this.#pollTimer !== null) this.#startPolling();
  }

  setCommandTimeout(timeoutMs: number): void {
    if (this.#options) this.#options.commandTimeoutMs = timeoutMs;
  }

  setMotionIdleTimeout(timeoutMs: number): void {
    if (this.#options) this.#options.motionIdleTimeoutMs = timeoutMs;
  }

  setLineEnding(lineEnding: LineEnding): void {
    if (this.#options) this.#options.lineEnding = lineEnding;
  }

  // ------------------------------------------------------- incoming traffic

  #handleLine(line: string): void {
    this.#lastSerialActivityAt = Date.now();
    const message = parseLine(line);

    switch (message.kind) {
      case 'status': {
        const status = resolvePositions(message.status, this.#cachedWco);
        if (status.wco) this.#cachedWco = status.wco;
        this.#lastStatus = status;
        this.#lastStatusAt = Date.now();
        this.#callbacks.onStatus(status);
        if (this.#logStatusReports || this.#logNextStatus) {
          this.#logNextStatus = false;
          this.#log('RX', status.raw, 'status');
        }
        for (const waiter of [...this.#idleWaiters]) {
          waiter.onStatus();
        }
        return;
      }

      case 'ok':
        this.#log('RX', 'ok', 'response');
        if (this.#timeoutBlock && !this.#inFlight) {
          const blocked = this.#timeoutBlock;
          const delayMs = Date.now() - blocked.timedOutAt;
          this.#log(
            'SYSTEM',
            `LATE_ACKNOWLEDGEMENT for ${blocked.command} (+${delayMs} ms after timeout). Not applied to any later command.`,
            'notice',
          );
          this.#timeoutBlock = null;
          this.#orphanOkExpected = false;
          return;
        }
        if (this.#orphanOkExpected) {
          this.#orphanOkExpected = false;
          this.#log(
            'SYSTEM',
            'LATE_ACKNOWLEDGEMENT — discarded so it cannot acknowledge a later queued command.',
            'notice',
          );
          return;
        }
        this.#completeInFlight({
          ok: true,
          command: this.#inFlight?.command ?? '',
        });
        return;

      case 'error': {
        // Numeric GRBL 1.1 errors get a lookup description. Textual GRBL 0.9
        // errors already carry the full message in `raw`; logging that once
        // avoids "error: Bad number format — error: Bad number format".
        const rxMessage = message.numeric
          ? `${message.raw} — ${message.description}`
          : message.raw;
        this.#log('RX', rxMessage, 'error');
        this.#completeInFlight({
          ok: false,
          command: this.#inFlight?.command ?? '',
          error: message.description,
        });
        return;
      }

      case 'alarm':
        // An alarm is asynchronous: it may arrive with no command in flight.
        this.#log('RX', `${message.raw} — ${message.description}`, 'alarm');
        if (this.#inFlight) {
          this.#completeInFlight({
            ok: false,
            command: this.#inFlight.command,
            error: message.description,
          });
        }
        return;

      case 'welcome':
        this.#log('RX', message.raw, 'response');
        this.#firmwareIdentity = message.identity;
        this.#callbacks.onConnectionChange({
          bannerVersion: message.version,
          rawFirmwareBanner: message.raw,
          firmwareIdentity: message.identity,
        });
        this.#publishProtocol();
        this.#awaitBanner?.();
        return;

      case 'parserState':
        this.#lastParserState = message.state;
        this.#log('RX', message.raw, 'response');
        return;

      case 'version':
        this.#log('RX', message.raw, 'response');
        this.#callbacks.onConnectionChange({
          firmwareVersion: message.version,
          firmwareBuild: message.build,
        });
        return;

      case 'options':
        this.#log('RX', message.raw, 'response');
        this.#callbacks.onConnectionChange({ options: message.options });
        return;

      case 'setting':
        this.#settings.set(message.setting.key, message.setting);
        this.#log('RX', message.raw, 'response');
        if (!this.#collectingSettings) {
          this.#callbacks.onSettings(
            [...this.#settings.values()].sort((a, b) => a.key - b.key),
          );
        }
        return;

      case 'message':
        this.#log('RX', message.raw, 'notice');
        return;

      case 'feedback':
        this.#log('RX', message.raw, 'response');
        return;

      default:
        // Unrecognised output still reaches the user rather than disappearing.
        if (message.raw.length > 0) this.#log('RX', message.raw, 'response');
        return;
    }
  }

  #handleTransportError(error: TransportError): void {
    this.#reportError(error);
    if (error.code === 'device-lost' || error.code === 'read-failed') {
      this.#failPendingCommands(
        'The connection to the machine was lost.',
        'DISCONNECTED',
      );
      this.#stopPolling();
    }
  }

  #reportError(error: unknown): void {
    const isBenign = error instanceof TransportError && error.benign;
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';

    this.#callbacks.onConnectionChange({ lastError: isBenign ? null : message });
    this.#log(isBenign ? 'SYSTEM' : 'ERROR', message, isBenign ? 'notice' : 'error');
  }

  #setPhase(phase: ConnectionInfo['phase']): void {
    if (this.#phase === phase) return;
    this.#phase = phase;
    this.#callbacks.onConnectionChange({ phase });
  }

  #log(
    direction: ConsoleDirection,
    message: string,
    type: ConsoleEntryType,
  ): void {
    this.#callbacks.onConsole(direction, message, type);
  }
}

function describeRealtime(command: RealtimeCommand): string {
  switch (command) {
    case 'statusReport':
      return '?';
    case 'feedHold':
      return '!';
    case 'cycleStart':
      return '~';
    case 'softReset':
      return 'Ctrl-X soft reset';
  }
}

import { derived, get, writable } from 'svelte/store';
import { detectSerialEnvironment } from '../serial/transport';
import type { TransportKind } from '../serial/types';
import { activeProfile } from '../machines/stores/profiles';
import { GrblClient, type CommandResult } from './client';
import type {
  ConnectionInfo,
  ConsoleDirection,
  ConsoleEntry,
  ConsoleEntryType,
  GrblSetting,
  GrblStatus,
  QueuedCommandState,
} from './types';

/**
 * Svelte bindings for the GRBL client.
 *
 * The client itself is framework-agnostic; this module is the only place that
 * knows about stores. None of this state is persisted: a reload must never
 * leave the interface claiming a machine is still connected.
 */

const INITIAL_CONNECTION: ConnectionInfo = {
  phase: 'disconnected',
  kind: null,
  portDescription: null,
  baudRate: null,
  bannerVersion: null,
  rawFirmwareBanner: null,
  firmwareIdentity: null,
  protocolCompatibility: 'auto',
  effectiveProtocol: 'unknown',
  capabilities: { supportsJogCommand: false },
  protocolLabel: 'Not detected',
  firmwareVersion: null,
  firmwareBuild: null,
  options: null,
  lastError: null,
};

const connectionStore = writable<ConnectionInfo>({ ...INITIAL_CONNECTION });
const statusStore = writable<GrblStatus | null>(null);
const settingsStore = writable<GrblSetting[]>([]);
const queueStore = writable<QueuedCommandState[]>([]);
const consoleStore = writable<ConsoleEntry[]>([]);
const jogBusyStore = writable(false);

/** Bounded so a long session cannot grow the DOM without limit. */
export const CONSOLE_LIMIT = 1000;

let consoleSequence = 0;

function appendConsole(
  direction: ConsoleDirection,
  message: string,
  type: ConsoleEntryType,
): void {
  consoleStore.update((entries) => {
    const next = entries.concat({
      id: ++consoleSequence,
      timestamp: new Date(),
      direction,
      message,
      type,
    });
    return next.length > CONSOLE_LIMIT
      ? next.slice(next.length - CONSOLE_LIMIT)
      : next;
  });
}

export const grblClient = new GrblClient({
  onConsole: appendConsole,
  onConnectionChange: (patch) =>
    connectionStore.update((info) => ({ ...info, ...patch })),
  onStatus: (status) => statusStore.set(status),
  onSettings: (settings) => settingsStore.set(settings),
  onQueueChange: (queue) => queueStore.set(queue),
  onJogBusyChange: (busy) => jogBusyStore.set(busy),
});

export const connection = { subscribe: connectionStore.subscribe };
export const machineStatus = { subscribe: statusStore.subscribe };
export const grblSettings = { subscribe: settingsStore.subscribe };
export const commandQueue = { subscribe: queueStore.subscribe };
export const consoleEntries = { subscribe: consoleStore.subscribe };
export const jogBusy = { subscribe: jogBusyStore.subscribe };

/** Environment capability check, evaluated once at module load. */
export const serialEnvironment = detectSerialEnvironment();

export const isConnected = derived(
  connectionStore,
  ($connection) =>
    $connection.phase === 'connected' || $connection.phase === 'handshaking',
);

/**
 * Machine state as shown in the header.
 *
 * The connection phase takes precedence over the last received report: while
 * connecting there is no meaningful GRBL state yet, and after disconnecting the
 * previous state is stale.
 */
export const displayState = derived(
  [connectionStore, statusStore],
  ([$connection, $status]) => {
    if ($connection.phase === 'disconnected') return 'Disconnected';
    if ($connection.phase === 'connecting') return 'Connecting';
    if ($connection.phase === 'handshaking') return 'Connecting';
    if ($connection.phase === 'disconnecting') return 'Disconnecting';
    return $status?.state ?? 'Connected';
  },
);

/** True when the controller's `$22` setting reports homing as enabled. */
export const homingEnabled = derived(settingsStore, ($settings) => {
  const setting = $settings.find((entry) => entry.key === 22);
  if (!setting) return null;
  return setting.value.trim() !== '0';
});

/** Travel limits from `$130` / `$131`, when the controller has reported them. */
export const controllerTravel = derived(settingsStore, ($settings) => {
  const x = $settings.find((entry) => entry.key === 130);
  const y = $settings.find((entry) => entry.key === 131);
  if (!x || !y) return null;
  const widthMm = Number.parseFloat(x.value);
  const heightMm = Number.parseFloat(y.value);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return null;
  return { widthMm, heightMm };
});

export function clearConsole(): void {
  consoleStore.set([]);
}

export function logSystemMessage(message: string): void {
  appendConsole('SYSTEM', message, 'notice');
}

/** Resets everything a new connection should not inherit. */
function resetSessionState(): void {
  statusStore.set(null);
  settingsStore.set([]);
  queueStore.set([]);
  jogBusyStore.set(false);
}

export async function selectSerialPort(kind: TransportKind): Promise<boolean> {
  return grblClient.selectPort(kind);
}

export async function connectMachine(kind: TransportKind): Promise<void> {
  const profile = get(activeProfile);
  resetSessionState();
  await grblClient.connect({
    kind,
    baudRate: profile.connection.baudRate,
    lineEnding: profile.connection.lineEnding,
    statusPollIntervalMs: profile.connection.statusPollIntervalMs,
    commandTimeoutMs: profile.connection.commandTimeoutMs,
    motionIdleTimeoutMs: profile.connection.motionIdleTimeoutMs,
    protocolCompatibility: profile.connection.protocolCompatibility,
  });
}

export async function waitForIdle(
  options?: Parameters<GrblClient['waitForIdle']>[0],
): Promise<void> {
  return grblClient.waitForIdle(options);
}

export async function disconnectMachine(): Promise<void> {
  await grblClient.disconnect();
  statusStore.set(null);
}

export async function sendCommand(command: string): Promise<CommandResult> {
  return grblClient.send(command);
}

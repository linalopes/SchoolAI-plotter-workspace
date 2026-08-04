import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Transport,
  TransportHandlers,
  TransportState,
} from '../serial/types';
import { GrblClient } from './client';
import type {
  ConnectionInfo,
  ConsoleEntry,
  GrblSetting,
  GrblStatus,
  QueuedCommandState,
} from './types';

/**
 * End-to-end exercise of the client against the simulated controller.
 *
 * Both share the transport interface, so this covers the same code path a real
 * machine uses, minus the browser's serial implementation.
 */

interface Harness {
  client: GrblClient;
  connection: ConnectionInfo;
  console: Array<Pick<ConsoleEntry, 'direction' | 'message'>>;
  status: GrblStatus | null;
  settings: GrblSetting[];
  queue: QueuedCommandState[];
}

function createHarness(): Harness {
  const harness: Harness = {
    client: null as unknown as GrblClient,
    connection: {
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
    },
    console: [],
    status: null,
    settings: [],
    queue: [],
  };

  harness.client = new GrblClient({
    onConsole: (direction, message) => harness.console.push({ direction, message }),
    onConnectionChange: (patch) => Object.assign(harness.connection, patch),
    onStatus: (status) => (harness.status = status),
    onSettings: (settings) => (harness.settings = settings),
    onQueueChange: (queue) => (harness.queue = queue),
  });

  return harness;
}

async function connect(harness: Harness) {
  await harness.client.connect({
    kind: 'demo',
    baudRate: 115200,
    lineEnding: 'lf',
    statusPollIntervalMs: 60,
    commandTimeoutMs: 2000,
    motionIdleTimeoutMs: 5000,
    protocolCompatibility: 'auto',
  });
}

/** Polls a condition instead of guessing at a fixed delay. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for the expected condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('GrblClient with the simulated controller', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('completes the startup handshake without sending a motion command', async () => {
    await connect(harness);

    expect(harness.connection.phase).toBe('connected');
    expect(harness.connection.bannerVersion).toBe('1.1h');
    expect(harness.connection.firmwareVersion).toBe('1.1h.20190825');
    expect(harness.connection.options).toBe('V,15,128');

    const sent = harness.console
      .filter((entry) => entry.direction === 'TX')
      .map((entry) => entry.message);
    expect(sent).toContain('$I');
    expect(sent).toContain('$$');
    // Nothing in the handshake may command movement.
    expect(sent.some((command) => /^\$J=|^G0|^G1|^\$H/.test(command))).toBe(false);

    await harness.client.disconnect();
  });

  it('parses the settings reported by $$', async () => {
    await connect(harness);

    expect(harness.settings.length).toBeGreaterThan(0);
    const stepsPerMm = harness.settings.find((setting) => setting.key === 100);
    expect(stepsPerMm?.label).toBe('X steps/mm');
    expect(stepsPerMm?.value).toBe('80.000');

    await harness.client.disconnect();
  });

  it('polls for status and reports a position', async () => {
    await connect(harness);
    await waitFor(() => harness.status !== null);

    expect(harness.status?.state).toBe('Idle');
    expect(harness.status?.mpos).toEqual({ x: 0, y: 0, z: 0 });
    // WCO arrives only in occasional reports, and the client caches it.
    expect(harness.status?.wpos).not.toBeNull();

    await harness.client.disconnect();
  });

  it('moves the simulated machine with a jog command', async () => {
    await connect(harness);

    const result = await harness.client.send('$J=G91 X10 F1000');
    expect(result.ok).toBe(true);

    await waitFor(() => (harness.status?.mpos?.x ?? 0) > 9.9);
    expect(harness.status?.mpos?.x).toBeCloseTo(10, 3);

    await harness.client.disconnect();
  });

  it('reports a controller error without throwing', async () => {
    await connect(harness);

    const result = await harness.client.send('$notacommand');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not recognised/i);
    expect(harness.console.some((entry) => entry.direction === 'ERROR')).toBe(true);

    await harness.client.disconnect();
  });

  it('refuses to send anything while disconnected', async () => {
    const result = await harness.client.send('$I');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not connected/i);
  });

  it('ignores an empty command', async () => {
    await connect(harness);
    const result = await harness.client.send('   ');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
    await harness.client.disconnect();
  });

  it('holds and resumes through the realtime channel', async () => {
    await connect(harness);

    // A long move gives the hold something to interrupt.
    void harness.client.send('$J=G91 X100 F600');
    await waitFor(() => harness.status?.state === 'Jog');

    await harness.client.sendRealtime('feedHold');
    await waitFor(() => harness.status?.state === 'Hold');

    await harness.client.sendRealtime('cycleStart');
    await waitFor(() => harness.status?.state !== 'Hold');

    await harness.client.disconnect();
  });

  it('abandons pending commands on soft reset', async () => {
    await connect(harness);

    const pending = harness.client.send('$J=G91 Y80 F600');
    await waitFor(() => harness.status?.state === 'Jog');

    await harness.client.sendRealtime('softReset');
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/soft reset/i);
    expect(harness.client.hasPendingCommand()).toBe(false);

    await harness.client.disconnect();
  });

  it('fails outstanding commands and stops polling on disconnect', async () => {
    await connect(harness);
    await waitFor(() => harness.status !== null);

    await harness.client.disconnect();
    expect(harness.connection.phase).toBe('disconnected');
    expect(harness.client.hasPendingCommand()).toBe(false);

    const statusCount = harness.console.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    // No further traffic once the connection is closed.
    expect(harness.console.length).toBe(statusCount);
  });

  it('recovers the queue when a command is never answered', async () => {
    // A controller that accepts writes and says nothing: the failure mode of a
    // wrong baud rate or a wedged board.
    const silent = createHarness();
    const client = new GrblClient(
      {
        onConsole: (direction, message) =>
          silent.console.push({ direction, message }),
        onConnectionChange: (patch) => Object.assign(silent.connection, patch),
        onStatus: (status) => (silent.status = status),
        onSettings: (settings) => (silent.settings = settings),
        onQueueChange: (queue) => (silent.queue = queue),
      },
      (_kind, handlers) => createSilentTransport(handlers),
    );

    await client.connect({
      kind: 'demo',
      baudRate: 115200,
      lineEnding: 'lf',
      statusPollIntervalMs: 1000,
      commandTimeoutMs: 80,
      motionIdleTimeoutMs: 5000,
      protocolCompatibility: 'auto',
    });

    // Handshake identification may already have timed out on a silent link.
    if (client.isTimeoutBlocked()) client.clearTimeoutBlock();

    const first = await client.send('G0 X0 Y0', 80);
    expect(first.ok).toBe(false);
    expect(first.error).toMatch(/No serial activity|responsive/i);
    expect(first.code).toBe('TIMEOUT');
    expect(client.isTimeoutBlocked()).toBe(true);

    // A timed-out command blocks further sends until recovery so a late ok
    // cannot acknowledge the next queue entry.
    const blocked = await client.send('$$', 80);
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('TIMEOUT_BLOCKED');

    client.clearTimeoutBlock();
    const second = await client.send('$$', 80);
    expect(second.ok).toBe(false);
    expect(client.hasPendingCommand()).toBe(false);

    await client.disconnect();
  });
});

/** Opens successfully, accepts every write, and never replies. */
function createSilentTransport(handlers: TransportHandlers): Transport {
  let state: TransportState = 'disconnected';
  const setState = (next: TransportState) => {
    state = next;
    handlers.onStateChange(next);
  };

  return {
    kind: 'demo',
    getState: () => state,
    hasPort: () => true,
    selectPort: async () => true,
    open: async () => setState('connected'),
    close: async () => setState('disconnected'),
    write: async () => undefined,
    writeBytes: async () => undefined,
    dispose: async () => setState('disconnected'),
  };
}

import { beforeEach, describe, expect, it } from 'vitest';
import { MockSerialTransport } from '../serial/mockSerialTransport';
import type { TransportHandlers } from '../serial/types';
import { GrblClient } from './client';
import { parseLine, parseStatusReport } from './parser';
import type {
  ConnectionInfo,
  ConsoleEntry,
  GrblSetting,
  GrblStatus,
  QueuedCommandState,
} from './types';

/**
 * GRBL 0.9 / 1.1 compatibility coverage.
 *
 * Complements the existing safety tests in client.test.ts rather than replacing
 * them: no handshake motion, queue recovery, and soft-reset behaviour stay put.
 */

interface Harness {
  client: GrblClient;
  connection: ConnectionInfo;
  console: Array<Pick<ConsoleEntry, 'direction' | 'message' | 'type'>>;
  status: GrblStatus | null;
  settings: GrblSetting[];
  queue: QueuedCommandState[];
  jogBusy: boolean;
  transport: MockSerialTransport | null;
}

function emptyConnection(): ConnectionInfo {
  return {
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
}

function createHarness(firmwareVersion: '0.9i' | '1.1h'): Harness {
  const harness: Harness = {
    client: null as unknown as GrblClient,
    connection: emptyConnection(),
    console: [],
    status: null,
    settings: [],
    queue: [],
    jogBusy: false,
    transport: null,
  };

  harness.client = new GrblClient(
    {
      onConsole: (direction, message, type) =>
        harness.console.push({ direction, message, type }),
      onConnectionChange: (patch) => Object.assign(harness.connection, patch),
      onStatus: (status) => (harness.status = status),
      onSettings: (settings) => (harness.settings = settings),
      onQueueChange: (queue) => (harness.queue = queue),
      onJogBusyChange: (busy) => (harness.jogBusy = busy),
    },
    (_kind, handlers: TransportHandlers) => {
      harness.transport = new MockSerialTransport(handlers, { firmwareVersion });
      return harness.transport;
    },
  );

  return harness;
}

async function connect(harness: Harness) {
  await harness.client.connect({
    kind: 'demo',
    baudRate: 115200,
    lineEnding: 'lf',
    statusPollIntervalMs: 40,
    commandTimeoutMs: 2000,
    motionIdleTimeoutMs: 5000,
    protocolCompatibility: 'auto',
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for the expected condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('status report dialects', () => {
  it('parses comma-delimited GRBL 0.9 reports', () => {
    const status = parseStatusReport(
      '<Idle,MPos:0.000,0.000,0.000,WPos:1.000,2.000,0.000>',
    );
    expect(status?.state).toBe('Idle');
    expect(status?.mpos).toEqual({ x: 0, y: 0, z: 0 });
    expect(status?.wpos).toEqual({ x: 1, y: 2, z: 0 });
  });

  it('parses pipe-delimited GRBL 1.1 reports', () => {
    const status = parseStatusReport(
      '<Idle|MPos:0.000,0.000,0.000|WPos:1.000,2.000,0.000>',
    );
    expect(status?.state).toBe('Idle');
    expect(status?.mpos).toEqual({ x: 0, y: 0, z: 0 });
    expect(status?.wpos).toEqual({ x: 1, y: 2, z: 0 });
  });

  it('does not confuse coordinate commas with field separators', () => {
    const status = parseStatusReport(
      '<Run,MPos:10.500,-3.250,0.000,WPos:10.500,-3.250,0.000,Buf:12>',
    );
    expect(status?.mpos).toEqual({ x: 10.5, y: -3.25, z: 0 });
    expect(status?.plannerBuffer).toBe(12);
  });
});

describe('textual GRBL 0.9 errors', () => {
  it('parses textual errors without inventing a numeric code', () => {
    const message = parseLine('error: Bad number format');
    expect(message.kind).toBe('error');
    if (message.kind !== 'error') throw new Error('expected error');
    expect(message.numeric).toBe(false);
    expect(message.code).toBe(-1);
    expect(message.description).toBe('Bad number format');
    expect(message.raw).toBe('error: Bad number format');
  });

  it('still parses numbered GRBL 1.1 errors', () => {
    const message = parseLine('error:2');
    if (message.kind !== 'error') throw new Error('expected error');
    expect(message.numeric).toBe(true);
    expect(message.code).toBe(2);
  });

  it('does not duplicate textual errors in the console', async () => {
    const harness = createHarness('0.9i');
    await connect(harness);

    await harness.client.send('$J=G91 X1 F1000');

    const errorLines = harness.console
      .filter((entry) => entry.message.includes('Bad number format'))
      .map((entry) => entry.message);

    expect(errorLines.length).toBeGreaterThan(0);
    for (const line of errorLines) {
      expect(line).not.toMatch(
        /error: Bad number format — error: Bad number format/,
      );
      // The RX line is the raw controller text once; the ERROR line may mention
      // the command, but must not repeat the phrase after an em dash.
      const rxHits = (line.match(/error: Bad number format/gi) ?? []).length;
      expect(rxHits).toBeLessThanOrEqual(1);
    }

    await harness.client.disconnect();
  });
});

describe('protocol-aware jogging', () => {
  let harness09: Harness;
  let harness11: Harness;

  beforeEach(() => {
    harness09 = createHarness('0.9i');
    harness11 = createHarness('1.1h');
  });

  it('detects 0.9 from the banner and disables $J=', async () => {
    await connect(harness09);
    expect(harness09.connection.bannerVersion).toBe('0.9i');
    expect(harness09.connection.capabilities.supportsJogCommand).toBe(false);
    expect(harness09.connection.effectiveProtocol).toBe('grbl-0.9');
    expect(harness09.client.supportsJogCommand()).toBe(false);
    await harness09.client.disconnect();
  });

  it('detects 1.1 from the banner and enables $J=', async () => {
    await connect(harness11);
    expect(harness11.connection.bannerVersion).toBe('1.1h');
    expect(harness11.connection.capabilities.supportsJogCommand).toBe(true);
    expect(harness11.connection.effectiveProtocol).toBe('grbl-1.1');
    await harness11.client.disconnect();
  });

  it('never sends $J= when jogging on GRBL 0.9', async () => {
    await connect(harness09);
    await waitFor(() => harness09.status?.state === 'Idle');

    const before = harness09.console.length;
    const result = await harness09.client.jog('X', 1, 1000);
    expect(result.ok).toBe(true);

    const sent = harness09.console
      .slice(before)
      .filter((entry) => entry.direction === 'TX')
      .map((entry) => entry.message);

    expect(sent.some((command) => command.startsWith('$J='))).toBe(false);
    expect(sent).toContain('$G');
    expect(sent).toContain('G91');
    expect(sent).toContain('G1 X1 F1000');
    expect(sent).toContain('G90');

    await harness09.client.disconnect();
  });

  it('continues to send $J= when jogging on GRBL 1.1', async () => {
    await connect(harness11);
    await waitFor(() => harness11.status?.state === 'Idle');

    const before = harness11.console.length;
    const result = await harness11.client.jog('X', 1, 1000);
    expect(result.ok).toBe(true);

    const sent = harness11.console
      .slice(before)
      .filter((entry) => entry.direction === 'TX')
      .map((entry) => entry.message);

    expect(sent).toContain('$J=G91 X1 F1000');
    expect(sent.some((command) => command === 'G1 X1 F1000')).toBe(false);

    await harness11.client.disconnect();
  });

  it('restores modal state after a legacy jog', async () => {
    await connect(harness09);
    await waitFor(() => harness09.status?.state === 'Idle');

    await harness09.client.jog('Y', -1, 1000);

    // After the transaction the controller should be back in absolute mode.
    harness09.console.length = 0;
    await harness09.client.send('$G');
    const parserLine = harness09.console.find(
      (entry) => entry.direction === 'RX' && entry.message.includes('G90'),
    );
    expect(parserLine?.message).toMatch(/G90/);
    expect(parserLine?.message).not.toMatch(/G91/);

    await harness09.client.disconnect();
  });

  it('keeps jogBusy true until the legacy move returns to Idle', async () => {
    await connect(harness09);
    await waitFor(() => harness09.status?.state === 'Idle');

    const jogPromise = harness09.client.jog('X', 10, 600);
    await waitFor(() => harness09.jogBusy === true);
    expect(harness09.client.isJogBusy()).toBe(true);

    // While busy, a second jog must be refused.
    const blocked = await harness09.client.jog('Y', 1, 1000);
    expect(blocked.ok).toBe(false);

    await jogPromise;
    expect(harness09.jogBusy).toBe(false);
    await waitFor(() => harness09.status?.state === 'Idle');

    await harness09.client.disconnect();
  });

  it('sends no motion during version detection or connection', async () => {
    await connect(harness09);

    const sent = harness09.console
      .filter((entry) => entry.direction === 'TX')
      .map((entry) => entry.message);

    expect(sent.some((command) => /^\$J=|^G0|^G1|^\$H|^G91/.test(command))).toBe(
      false,
    );
    expect(harness09.connection.rawFirmwareBanner).toMatch(/Grbl 0\.9i/);

    await harness09.client.disconnect();
  });
});

describe('homing disabled when $22=0', () => {
  it('reports $22=0 from the settings dump', async () => {
    const harness = createHarness('0.9i');
    await connect(harness);

    const setting = harness.settings.find((entry) => entry.key === 22);
    expect(setting?.value).toBe('0');

    await harness.client.disconnect();
  });
});

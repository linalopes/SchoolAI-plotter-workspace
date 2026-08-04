import { describe, expect, it } from 'vitest';
import type { Transport, TransportHandlers, TransportState } from '../serial/types';
import { classifyQueuedCommand, GrblClient } from './client';
import type { GrblStatus } from './types';

/**
 * Status-aware acknowledgement: delayed ok while Run must not look like a
 * dead serial link. Genuine silence still fails.
 */

describe('classifyQueuedCommand', () => {
  it('classifies motion, pen, and other lines', () => {
    expect(classifyQueuedCommand('G0 X10 Y10')).toBe('motion');
    expect(classifyQueuedCommand('G1 X10 Y10 F1000')).toBe('motion');
    expect(classifyQueuedCommand('G01 X1')).toBe('motion');
    expect(classifyQueuedCommand('M3 S0')).toBe('pen');
    expect(classifyQueuedCommand('M5')).toBe('pen');
    expect(classifyQueuedCommand('G21')).toBe('other');
    expect(classifyQueuedCommand('G90')).toBe('other');
  });
});

describe('motion acknowledgement watchdog', () => {
  it(
    'keeps a G1 pending beyond 5s while GRBL reports Run and status continues',
    async () => {
      const { client, emit, pendingWrites } = await createBridgeClient();
      pendingWrites.length = 0;

      const promise = client.send('G1 X100 Y0 F1000');
      await waitFor(() => pendingWrites.includes('G1 X100 Y0 F1000'));

      const statusPulse = setInterval(() => {
        emit('<Run|MPos:1.000,0.000,0.000|FS:1000,0>');
      }, 400);

      await sleep(5_500);
      let settled = false;
      void promise.then(() => {
        settled = true;
      });
      await sleep(50);
      expect(settled).toBe(false);

      clearInterval(statusPulse);
      emit('ok');
      await expect(promise).resolves.toMatchObject({
        ok: true,
        command: 'G1 X100 Y0 F1000',
      });

      await client.disconnect();
    },
    15_000,
  );

  it(
    'does not classify continued status as “no serial activity”',
    async () => {
      const { client, emit, logs, pendingWrites } = await createBridgeClient();
      pendingWrites.length = 0;
      logs.length = 0;

      const promise = client.send('G1 X50 Y0 F1000');
      await waitFor(() => pendingWrites.at(-1) === 'G1 X50 Y0 F1000');

      const statusPulse = setInterval(() => {
        emit('<Run|MPos:2.000,0.000,0.000|FS:1000,0>');
      }, 300);
      await sleep(5_500);
      clearInterval(statusPulse);
      emit('ok');
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(logs.some((line) => /No serial activity/i.test(line))).toBe(false);

      await client.disconnect();
    },
    15_000,
  );

  it(
    'fails on genuine serial silence',
    async () => {
      const { client, pendingWrites } = await createBridgeClient();
      pendingWrites.length = 0;

      const promise = client.send('G1 X10 Y0 F1000');
      await waitFor(() => pendingWrites.at(-1)?.startsWith('G1') === true);

      // No status, no ok — silence watchdog (~10s).
      const result = await promise;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('TIMEOUT');
      expect(result.error).toMatch(/No serial activity/i);
      expect(client.isTimeoutBlocked()).toBe(true);

      await client.disconnect();
    },
    20_000,
  );

  it(
    'completes the correct command when ok is planner-delayed',
    async () => {
      const { client, emit, pendingWrites } = await createBridgeClient();
      pendingWrites.length = 0;

      const first = client.send('G1 X10 Y0 F1000');
      await waitFor(() => pendingWrites.at(-1) === 'G1 X10 Y0 F1000');

      const pulse = setInterval(() => {
        emit('<Run|MPos:0.000,0.000,0.000|FS:1000,0>');
      }, 400);
      await sleep(6_000);
      clearInterval(pulse);
      emit('ok');
      await expect(first).resolves.toMatchObject({
        ok: true,
        command: 'G1 X10 Y0 F1000',
      });

      const second = client.send('G1 X20 Y0 F1000');
      await waitFor(() => pendingWrites.at(-1) === 'G1 X20 Y0 F1000');
      emit('ok');
      await expect(second).resolves.toMatchObject({
        ok: true,
        command: 'G1 X20 Y0 F1000',
      });

      await client.disconnect();
    },
    20_000,
  );

  it('never lets a late ok complete a later command', async () => {
    const { client, emit, logs, pendingWrites } = await createBridgeClient();
    pendingWrites.length = 0;
    logs.length = 0;

    const first = client.send('G1 X10 Y0 F1000', 120);
    await waitFor(() => pendingWrites.at(-1) === 'G1 X10 Y0 F1000');
    emit('<Run|MPos:0.000,0.000,0.000|FS:1000,0>');
    const firstResult = await first;
    expect(firstResult.ok).toBe(false);
    expect(client.isTimeoutBlocked()).toBe(true);

    emit('ok');
    await sleep(20);
    expect(logs.some((line) => line.includes('LATE_ACKNOWLEDGEMENT'))).toBe(
      true,
    );

    const second = client.send('G1 X20 Y0 F1000', 500);
    await waitFor(() => pendingWrites.at(-1) === 'G1 X20 Y0 F1000');
    emit('ok');
    await expect(second).resolves.toMatchObject({
      ok: true,
      command: 'G1 X20 Y0 F1000',
    });

    await client.disconnect();
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await sleep(10);
  }
}

async function createBridgeClient() {
  const bridge: { onLine: ((line: string) => void) | null } = { onLine: null };
  const pendingWrites: string[] = [];
  const logs: string[] = [];
  let status: GrblStatus | null = null;

  const client = new GrblClient(
    {
      onConsole: (_d, message) => logs.push(message),
      onConnectionChange: () => undefined,
      onStatus: (next) => {
        status = next;
      },
      onSettings: () => undefined,
      onQueueChange: () => undefined,
    },
    (_kind, handlers: TransportHandlers): Transport => {
      bridge.onLine = handlers.onLine;
      let state: TransportState = 'disconnected';
      return {
        kind: 'demo',
        getState: () => state,
        hasPort: () => true,
        selectPort: async () => true,
        open: async () => {
          state = 'connected';
          handlers.onStateChange(state);
          handlers.onLine("Grbl 1.1h ['$' for help]");
        },
        close: async () => {
          state = 'disconnected';
          handlers.onStateChange(state);
        },
        write: async (data: string) => {
          const command = data.replace(/\r?\n$/, '');
          pendingWrites.push(command);
          if (command === '$I') {
            handlers.onLine('[VER:1.1h.20190825:]');
            handlers.onLine('ok');
          } else if (command === '$$') {
            handlers.onLine('$0=10');
            handlers.onLine('ok');
          }
        },
        writeBytes: async () => undefined,
        dispose: async () => {
          state = 'disconnected';
          handlers.onStateChange(state);
        },
      };
    },
  );

  await client.connect({
    kind: 'demo',
    baudRate: 115200,
    lineEnding: 'lf',
    statusPollIntervalMs: 60_000,
    commandTimeoutMs: 5_000,
    motionIdleTimeoutMs: 5_000,
    protocolCompatibility: 'grbl-1.1',
  });

  return {
    client,
    pendingWrites,
    logs,
    status: () => status,
    emit: (line: string) => bridge.onLine?.(line),
  };
}

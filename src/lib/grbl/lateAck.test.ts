import { describe, expect, it } from 'vitest';
import type { Transport, TransportHandlers, TransportState } from '../serial/types';
import { GrblClient } from './client';
import type { GrblStatus } from './types';

/**
 * Late acknowledgement must never complete a later queued command.
 */

describe('late acknowledgement safety', () => {
  it('does not apply a late ok to a later command', async () => {
    const bridge: { onLine: ((line: string) => void) | null } = { onLine: null };
    const logs: string[] = [];
    const pendingWrites: string[] = [];

    const client = new GrblClient(
      {
        onConsole: (_d, message) => logs.push(message),
        onConnectionChange: () => undefined,
        onStatus: (_s: GrblStatus) => undefined,
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
            // User commands (M3 S0, G0 …) are not auto-acked.
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

    pendingWrites.length = 0;
    const firstPromise = client.send('M3 S0', 80);

    // Status keeps arriving while acknowledgement is delayed (Circles case).
    bridge.onLine?.('<Run|MPos:1.000,0.000,0.000|FS:1000,0>');

    const firstResult = await firstPromise;
    expect(firstResult.ok).toBe(false);
    expect(firstResult.code).toBe('TIMEOUT');
    expect(firstResult.error).toMatch(/responsive|No serial activity/i);
    expect(client.isTimeoutBlocked()).toBe(true);

    // Late ok for the timed-out pen command — must not unlock a later send.
    bridge.onLine?.('ok');
    expect(logs.some((entry) => entry.includes('LATE_ACKNOWLEDGEMENT'))).toBe(
      true,
    );
    expect(client.isTimeoutBlocked()).toBe(false);

    const secondPromise = client.send('G0 X0 Y0', 80);
    // Give the pump a tick to write, then ack the new command only.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pendingWrites.at(-1)).toBe('G0 X0 Y0');
    bridge.onLine?.('ok');
    const secondResult = await secondPromise;
    expect(secondResult.ok).toBe(true);
    expect(secondResult.command).toBe('G0 X0 Y0');

    await client.disconnect();
  });
});

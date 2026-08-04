import { describe, expect, it } from 'vitest';
import { GrblClient } from './client';

describe('GrblClient.waitForIdle', () => {
  it('ignores a stale cached Idle and waits for a fresh Idle report', async () => {
    const { client, emit } = await createConnectedClient();
    emit('<Idle|MPos:0.000,0.000,0.000|FS:0,0>');

    let resolved = false;
    const wait = client
      .waitForIdle({ timeoutMs: 1_000, pollingIntervalMs: 40 })
      .then(() => {
        resolved = true;
      });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(resolved).toBe(false);

    emit('<Idle|MPos:0.000,0.000,0.000|FS:0,0>');
    await expect(wait).resolves.toBeUndefined();
    expect(resolved).toBe(true);
    await client.disconnect();
  });

  it('resolves when status transitions from Run to Idle', async () => {
    const { client, emit } = await createConnectedClient();
    emit('<Run|MPos:1.000,0.000,0.000|FS:1000,0>');

    const wait = client.waitForIdle({ timeoutMs: 2_000, pollingIntervalMs: 40 });
    setTimeout(() => {
      emit('<Idle|MPos:2.000,0.000,0.000|FS:0,0>');
    }, 60);
    await expect(wait).resolves.toBeUndefined();
    await client.disconnect();
  });

  it('rejects on Alarm', async () => {
    const { client, emit } = await createConnectedClient();
    emit('<Run|MPos:1.000,0.000,0.000|FS:1000,0>');
    const wait = client.waitForIdle({ timeoutMs: 2_000, pollingIntervalMs: 40 });
    setTimeout(() => {
      emit('<Alarm|MPos:1.000,0.000,0.000|FS:0,0>');
    }, 40);
    await expect(wait).rejects.toThrow(/Alarm/i);
    await client.disconnect();
  });

  it('rejects when cancelled', async () => {
    const { client, emit } = await createConnectedClient();
    emit('<Run|MPos:1.000,0.000,0.000|FS:1000,0>');
    let cancelled = false;
    const wait = client.waitForIdle({
      timeoutMs: 2_000,
      pollingIntervalMs: 40,
      isCancelled: () => cancelled,
    });
    setTimeout(() => {
      cancelled = true;
    }, 20);
    await expect(wait).rejects.toThrow(/cancelled/i);
    await client.disconnect();
  });
});

async function createConnectedClient() {
  const bridge: { onLine: ((line: string) => void) | null } = { onLine: null };

  const client = new GrblClient(
    {
      onConsole: () => undefined,
      onConnectionChange: () => undefined,
      onStatus: () => undefined,
      onSettings: () => undefined,
      onQueueChange: () => undefined,
    },
    (_kind, handlers) => {
      bridge.onLine = handlers.onLine;
      let state: 'disconnected' | 'connected' = 'disconnected';
      return {
        kind: 'demo' as const,
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
    emit: (line: string) => bridge.onLine?.(line),
  };
}

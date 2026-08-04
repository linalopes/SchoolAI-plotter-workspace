import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../grbl/types';
import { createDefaultProfile } from '../machines/profiles/defaults';
import { generateGCode } from '../plot/gcode';
import type { TransformedPlot } from '../plot/types';
import { streamPlotSteps } from './plotJob';

/**
 * Regression coverage for Idle barriers around pen transitions and the
 * physical Circles timing failure (M3 S0 ok after ~6s of planner drain).
 */

function circlesLikePlot(pathCount = 8): TransformedPlot {
  const paths = Array.from({ length: pathCount }, (_, index) => {
    const cx = 40 + (index % 4) * 50;
    const cy = 40 + Math.floor(index / 4) * 50;
    return {
      id: `c${index}`,
      closed: true,
      points: [
        { x: cx + 20, y: cy },
        { x: cx, y: cy + 20 },
        { x: cx - 20, y: cy },
        { x: cx, y: cy - 20 },
      ],
    };
  });
  return {
    paths,
    bounds: { minX: 20, minY: 20, maxX: 210, maxY: 110 },
    penUpSegments: [],
    metrics: {
      pathCount,
      pointCount: pathCount * 4,
      penDownLengthMm: 500,
      penUpLengthMm: 100,
      bounds: { minX: 20, minY: 20, maxX: 210, maxY: 110 },
    },
  };
}

describe('plot motion barriers + Circles timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for Idle before pen-up and pen-down; not before each draw', async () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M3 S0';
    profile.pen.downCommand = 'M3 S90';
    profile.pen.upDelayMs = 0;
    profile.pen.downDelayMs = 0;

    const program = generateGCode(circlesLikePlot(2), profile, {
      feedRateMmPerMin: 2000,
      dryRun: false,
    });

    const events: string[] = [];
    let idleCalls = 0;

    const run = streamPlotSteps(program.steps, {
      profile,
      isCancelled: () => false,
      onProgress: () => undefined,
      onStatusLabel: (label) => events.push(`label:${label}`),
      send: async (line) => {
        events.push(`send:${line}`);
        return { ok: true, command: line } satisfies CommandResult;
      },
      waitIdle: async () => {
        idleCalls += 1;
        events.push('wait-idle');
      },
      sleep: async () => undefined,
    });

    await run;

    expect(idleCalls).toBeGreaterThan(0);

    // Every pen command is preceded by an Idle wait (labels may sit between).
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i]!;
      if (event === 'send:M3 S0' || event === 'send:M3 S90') {
        let sawIdle = false;
        for (let j = i - 1; j >= 0; j -= 1) {
          if (events[j] === 'wait-idle') {
            sawIdle = true;
            break;
          }
          if (events[j]?.startsWith('send:')) break;
        }
        expect(sawIdle).toBe(true);
      }
    }

    // Drawing commands are never immediately preceded by Idle.
    const drawSends = events.filter((event) => event.startsWith('send:G1'));
    expect(drawSends.length).toBeGreaterThan(2);
    for (let i = 0; i < events.length; i += 1) {
      if (!events[i]?.startsWith('send:G1')) continue;
      let j = i - 1;
      while (j >= 0 && events[j]?.startsWith('label:')) j -= 1;
      expect(events[j]).not.toBe('wait-idle');
    }
  });

  it('does not fail when path motion exceeds 5s before pen-up (Circles trace)', async () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M3 S0';
    profile.pen.downCommand = 'M3 S90';
    profile.pen.upDelayMs = 0;
    profile.pen.downDelayMs = 0;
    profile.connection.commandTimeoutMs = 5_000;
    profile.connection.motionIdleTimeoutMs = 30_000;

    const program = generateGCode(circlesLikePlot(8), profile, {
      feedRateMmPerMin: 1000,
      dryRun: false,
    });

    let machineState: 'Idle' | 'Run' = 'Idle';
    let pendingPenAck: ((result: CommandResult) => void) | null = null;
    const sent: string[] = [];

    const runPromise = streamPlotSteps(program.steps, {
      profile,
      isCancelled: () => false,
      onProgress: () => undefined,
      onStatusLabel: () => undefined,
      send: (line) => {
        sent.push(line);
        // G0/G1: planner accept is immediate; physical motion continues.
        if (line.startsWith('G0') || line.startsWith('G1')) {
          machineState = 'Run';
          return Promise.resolve({ ok: true, command: line });
        }
        // Physical trace: M3 S0 only acks after motion finishes (~6s).
        if (line === 'M3 S0') {
          expect(machineState).toBe('Idle');
          return new Promise<CommandResult>((resolve) => {
            pendingPenAck = resolve;
            // Acknowledge promptly once Idle barrier already waited.
            queueMicrotask(() => {
              pendingPenAck?.({ ok: true, command: line });
              pendingPenAck = null;
            });
          });
        }
        return Promise.resolve({ ok: true, command: line });
      },
      waitIdle: async () => {
        // Simulate 6.025s of planner drain with status still arriving.
        await vi.advanceTimersByTimeAsync(6_025);
        machineState = 'Idle';
      },
      sleep: async () => undefined,
    });

    const outcome = await runPromise;
    expect(outcome.kind).toBe('completed');
    if (outcome.kind === 'completed') {
      expect(outcome.executed).toBe(program.commandCount);
    }

    const penUps = sent.filter((line) => line === 'M3 S0');
    // initial + one per path
    expect(penUps).toHaveLength(9);
    expect(sent.filter((line) => line === 'M3 S90')).toHaveLength(8);
  });

  it('fails clearly when Alarm arrives during waitForIdle', async () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M3 S0';
    profile.pen.downCommand = 'M3 S90';
    profile.pen.upDelayMs = 0;
    profile.pen.downDelayMs = 0;

    const program = generateGCode(circlesLikePlot(1), profile, {
      feedRateMmPerMin: 1000,
      dryRun: false,
    });

    const outcome = await streamPlotSteps(program.steps, {
      profile,
      isCancelled: () => false,
      onProgress: () => undefined,
      onStatusLabel: () => undefined,
      send: async (line) => ({ ok: true, command: line }),
      waitIdle: async () => {
        throw Object.assign(
          new Error('Controller entered Alarm while waiting for Idle.'),
          { code: 'ALARM' },
        );
      },
      sleep: async () => undefined,
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.error).toMatch(/Alarm/i);
    }
  });

  it('stops waitForIdle on cancellation', async () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M3 S0';
    profile.pen.downCommand = 'M3 S90';
    profile.pen.upDelayMs = 0;
    profile.pen.downDelayMs = 0;

    const program = generateGCode(circlesLikePlot(1), profile, {
      feedRateMmPerMin: 1000,
      dryRun: false,
    });

    let cancelled = false;
    const outcome = await streamPlotSteps(program.steps, {
      profile,
      isCancelled: () => cancelled,
      onProgress: () => undefined,
      onStatusLabel: () => undefined,
      send: async (line) => ({ ok: true, command: line }),
      waitIdle: async ({ isCancelled } = {}) => {
        cancelled = true;
        if (isCancelled?.()) {
          throw Object.assign(new Error('Idle wait cancelled.'), {
            code: 'CANCELLED',
          });
        }
      },
      sleep: async () => undefined,
    });

    expect(outcome.kind).toBe('cancelled');
  });
});

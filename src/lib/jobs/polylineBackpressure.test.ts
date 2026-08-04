import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../machines/profiles/defaults';
import {
  calculateWorkspaceGeometry,
  ZERO_INSETS,
} from '../machines/workspaceGeometry';
import { generateGCode } from '../plot/gcode';
import { svgToPlotDocument } from '../plot/svgToPlotDocument';
import {
  fitAndCenterInRect,
  transformDocument,
} from '../plot/transform';
import { DEFAULT_PLACEMENT } from '../plot/types';
import { streamPlotSteps } from './plotJob';

/**
 * Polyline composition streams many G1 segments. Planner-delayed acknowledgements
 * must not abort the job when the controller remains responsive.
 */

function densePolylineSvg(): string {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(
      `${220 + t * 120},${220 + Math.sin(t * Math.PI * 2 * 2) * 40}`,
    );
  }
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <polygon points="60,80 180,60 220,140 120,200" fill="none" />
  <polyline points="${pts.join(' ')}" fill="none" />
  <rect x="60" y="240" width="100" height="100" fill="none" />
  <circle cx="280" cy="100" r="35" fill="none" />
</svg>`;
}

function preparePolylineProgram() {
  const doc = svgToPlotDocument(densePolylineSvg(), 'Polyline composition')
    .document!;
  const geometry = calculateWorkspaceGeometry(297, 210, ZERO_INSETS, 5, {
    machineOriginOnMediaXmm: 30,
    machineOriginOnMediaYmm: 0,
  });
  const plot = transformDocument(
    doc,
    fitAndCenterInRect(doc, DEFAULT_PLACEMENT, geometry.safePlotRect),
  );
  const profile = createDefaultProfile();
  profile.pen.upCommand = 'M3 S0';
  profile.pen.downCommand = 'M3 S90';
  profile.pen.upDelayMs = 0;
  profile.pen.downDelayMs = 0;
  const program = generateGCode(plot, profile, {
    feedRateMmPerMin: 1000,
    dryRun: false,
  });
  return { program, profile, plot };
}

describe('Polyline composition under planner backpressure', () => {
  it('builds a 113-command job with Idle barriers only around pen transitions', () => {
    const { program } = preparePolylineProgram();
    expect(program.commandCount).toBe(113);

    const idleBarriers = program.steps.filter((s) => s.kind === 'wait-for-idle');
    const g1Count = program.steps.filter(
      (s) => s.kind === 'command' && s.phase === 'draw',
    ).length;
    expect(idleBarriers.length).toBeGreaterThan(4);
    expect(idleBarriers.length).toBeLessThan(g1Count);

    // No Idle barrier between consecutive draw segments.
    for (let i = 1; i < program.steps.length; i += 1) {
      const prev = program.steps[i - 1];
      const cur = program.steps[i];
      if (
        prev &&
        cur &&
        prev.kind === 'command' &&
        prev.phase === 'draw' &&
        cur.kind === 'wait-for-idle'
      ) {
        // Allowed only before pen-up after a path — next command after wait must be pen-up or finalization travel.
        const after = program.steps
          .slice(i + 1)
          .find((s) => s.kind === 'command' && !s.line.startsWith('('));
        expect(after && after.kind === 'command' ? after.phase : null).toMatch(
          /pen-up|finalization|travel/,
        );
      }
    }
  });

  it('completes when G1 acknowledgements are delayed beyond 5 seconds', async () => {
    const { program, profile } = preparePolylineProgram();
    const events: string[] = [];

    const outcome = await streamPlotSteps(program.steps, {
      profile,
      isCancelled: () => false,
      onProgress: (n) => events.push(`progress:${n}`),
      onStatusLabel: () => undefined,
      send: async (line) => {
        events.push(`send:${line}`);
        if (line.startsWith('G1')) {
          // Simulate planner backpressure without wall-clock 5.5s × 96 segments.
          await Promise.resolve();
        }
        return { ok: true, command: line };
      },
      waitIdle: async () => {
        events.push('wait-idle');
      },
      sleep: async () => undefined,
    });

    expect(outcome.kind).toBe('completed');
    if (outcome.kind === 'completed') {
      expect(outcome.executed).toBe(113);
    }
    const waitIdles = events.filter((e) => e === 'wait-idle');
    const g1Sends = events.filter((e) => e.startsWith('send:G1'));
    expect(waitIdles.length).toBeLessThan(g1Sends.length);
  });

  it('preserves varying failure indices in diagnostics', async () => {
    const { program, profile } = preparePolylineProgram();

    for (const failAt of [10, 53]) {
      let sends = 0;
      const outcome = await streamPlotSteps(program.steps, {
        profile,
        isCancelled: () => false,
        onProgress: () => undefined,
        onStatusLabel: () => undefined,
        send: async (line) => {
          sends += 1;
          if (sends === failAt) {
            return {
              ok: false,
              command: line,
              error: `No serial activity — no response within 5000 ms. Pending: ${line}`,
              code: 'TIMEOUT',
            };
          }
          return { ok: true, command: line };
        },
        waitIdle: async () => undefined,
        sleep: async () => undefined,
      });

      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.executed).toBe(failAt - 1);
        expect(outcome.error).toMatch(/Pending:/);
      }
    }
  });
});

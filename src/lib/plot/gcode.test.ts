import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../machines/profiles/defaults';
import { countPenUpCommands, generateGCode } from './gcode';
import type { TransformedPlot } from './types';

function samplePlot(pathCount = 1): TransformedPlot {
  const paths = Array.from({ length: pathCount }, (_, index) => ({
    id: `p${index}`,
    closed: false,
    points: [
      { x: 10 + index * 30, y: 10 },
      { x: 20 + index * 30, y: 10 },
      { x: 20 + index * 30, y: 20 },
    ],
  }));
  return {
    paths,
    bounds: { minX: 10, minY: 10, maxX: 20 + (pathCount - 1) * 30, maxY: 20 },
    penUpSegments: [],
    metrics: {
      pathCount,
      pointCount: pathCount * 3,
      penDownLengthMm: 20 * pathCount,
      penUpLengthMm: 0,
      bounds: { minX: 10, minY: 10, maxX: 20 + (pathCount - 1) * 30, maxY: 20 },
    },
  };
}

describe('generateGCode', () => {
  it('emits absolute millimetre moves with pen commands when configured', () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M5';
    profile.pen.downCommand = 'M3';

    const program = generateGCode(samplePlot(), profile, {
      feedRateMmPerMin: 1000,
      dryRun: false,
    });

    expect(program.lines).toContain('G21');
    expect(program.lines).toContain('G90');
    expect(program.lines).toContain('M5');
    expect(program.lines).toContain('M3');
    expect(program.lines.some((line) => line.startsWith('G0 X10'))).toBe(true);
    expect(program.lines.some((line) => line.startsWith('G1 X20'))).toBe(true);
    expect(program.dryRun).toBe(false);
  });

  it('omits pen commands in dry run', () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M5';
    profile.pen.downCommand = 'M3';

    const program = generateGCode(samplePlot(), profile, {
      feedRateMmPerMin: 800,
      dryRun: true,
    });

    expect(program.lines).not.toContain('M3');
    expect(program.lines).not.toContain('M5');
    expect(program.dryRun).toBe(true);
  });

  it('inserts Idle barriers before every pen-up and pen-down', () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M3 S0';
    profile.pen.downCommand = 'M3 S90';

    const program = generateGCode(samplePlot(2), profile, {
      feedRateMmPerMin: 1000,
      dryRun: false,
    });

    const phases = program.steps.map((step) =>
      step.kind === 'wait-for-idle' ? 'wait-for-idle' : `${step.phase}:${step.line}`,
    );

    // Initial pen-up barrier
    expect(phases.indexOf('wait-for-idle')).toBeLessThan(
      phases.indexOf('pen-up:M3 S0'),
    );

    // Travel → Idle → pen-down for first path
    const travel = phases.indexOf('travel:G0 X10 Y10');
    const firstDown = phases.indexOf('pen-down:M3 S90');
    expect(phases.slice(travel, firstDown)).toContain('wait-for-idle');

    // Consecutive drawing commands never insert Idle between them.
    for (let i = 0; i < phases.length - 1; i += 1) {
      if (phases[i]?.startsWith('draw:') && phases[i + 1] === 'wait-for-idle') {
        expect(phases[i + 2]).toMatch(/^pen-up:/);
      }
    }

    // Path motion Idle before pen-up
    const lastUp = phases.lastIndexOf('pen-up:M3 S0');
    expect(phases[lastUp - 1]).toBe('wait-for-idle');
  });

  it('emits final pen-up exactly once per path plus initial (never duplicated at end)', () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = 'M3 S0';
    profile.pen.downCommand = 'M3 S90';

    const program = generateGCode(samplePlot(3), profile, {
      feedRateMmPerMin: 1000,
      dryRun: false,
    });

    // initial + one after each of 3 paths = 4
    expect(countPenUpCommands(program, 'M3 S0')).toBe(4);
    const lastCommand = [...program.steps]
      .reverse()
      .find(
        (step): step is Extract<(typeof program.steps)[number], { kind: 'command' }> =>
          step.kind === 'command' && !step.line.startsWith('('),
      );
    expect(lastCommand?.phase).toBe('finalization');
    // Parks at safe-rect lower-left (5,5) for default XY Plotter — machine space.
    expect(lastCommand?.line).toBe('G0 X5 Y5');
  });

  it('emits machine-space path coordinates unchanged (no +30 paper offset)', () => {
    const profile = createDefaultProfile();
    profile.pen.upCommand = '';
    profile.pen.downCommand = '';
    const program = generateGCode(
      {
        paths: [
          {
            id: 'a',
            closed: false,
            points: [
              { x: 5, y: 5 },
              { x: 40, y: 5 },
            ],
          },
        ],
        bounds: { minX: 5, minY: 5, maxX: 40, maxY: 5 },
        penUpSegments: [],
        metrics: {
          pathCount: 1,
          pointCount: 2,
          penDownLengthMm: 35,
          penUpLengthMm: 0,
          bounds: { minX: 5, minY: 5, maxX: 40, maxY: 5 },
        },
      },
      profile,
      { feedRateMmPerMin: 1000, dryRun: true },
    );
    expect(program.lines).toContain('G0 X5 Y5');
    expect(program.lines.some((line) => line.startsWith('G1 X40'))).toBe(true);
    expect(program.lines.some((line) => /G[01] X35\b/.test(line))).toBe(false);
  });
});

import type { MachineProfile } from '../machines/profiles/types';
import {
  calculateWorkspaceGeometry,
  ZERO_MEDIA_PLACEMENT,
} from '../machines/workspaceGeometry';
import type { TransformedPlot } from './types';

export interface GCodeOptions {
  feedRateMmPerMin: number;
  /** When true, pen commands are omitted and only travel moves are emitted. */
  dryRun: boolean;
}

export type PlotCommandPhase =
  | 'initialization'
  | 'travel'
  | 'draw'
  | 'wait-for-idle'
  | 'pen-up'
  | 'pen-down'
  | 'finalization';

export type PlotStep =
  | {
      kind: 'command';
      phase: Exclude<PlotCommandPhase, 'wait-for-idle'>;
      line: string;
      /** 1-based path index when the step belongs to a path. */
      pathIndex?: number;
      pathCount?: number;
      label: string;
    }
  | {
      kind: 'wait-for-idle';
      phase: 'wait-for-idle';
      label: string;
    };

export interface GCodeProgram {
  steps: PlotStep[];
  /** Flat G-code lines for display (comments + commands; no wait barriers). */
  lines: string[];
  /** Count of queued G-code commands (excludes comments and Idle waits). */
  commandCount: number;
  dryRun: boolean;
}

/**
 * Already-transformed page-space paths → GRBL program.
 *
 * `plot` points are absolute page millimetres (origin lower-left). This
 * generator must emit `X`/`Y` from those points directly — it must not add
 * `nonDrawableInsets`, `drawableRect.x`, or `safePlotRect.x`. Workspace
 * geometry is used only for the final park corner (machine space).
 *
 * Pen up/down come from the machine profile and are never guessed. Delays are
 * applied by the job streamer after each pen command, not as G4 dwells.
 *
 * Motion Idle barriers are inserted before every pen-state transition so
 * synchronized M3/M5 commands are not issued while the planner is draining.
 */
export function generateGCode(
  plot: TransformedPlot,
  profile: MachineProfile,
  options: GCodeOptions,
): GCodeProgram {
  const steps: PlotStep[] = [];
  const feed = Math.max(1, Math.round(options.feedRateMmPerMin));
  const format = (n: number) => Number.parseFloat(n.toFixed(3)).toString();
  // Page-space emit — never offset by profile insets here.
  const emitMove = (prefix: 'G0' | 'G1', x: number, y: number, feedSuffix = '') =>
    `${prefix} X${format(x)} Y${format(y)}${feedSuffix}`;

  const pushComment = (text: string) => {
    steps.push({
      kind: 'command',
      phase: 'initialization',
      line: text,
      label: text,
    });
  };

  pushComment('(Plotter Workspace generated job)');
  pushComment(`(Paths: ${plot.metrics.pathCount})`);

  steps.push({
    kind: 'command',
    phase: 'initialization',
    line: 'G21',
    label: 'Set millimetre units',
  });
  steps.push({
    kind: 'command',
    phase: 'initialization',
    line: 'G90',
    label: 'Absolute positioning',
  });
  steps.push({
    kind: 'command',
    phase: 'initialization',
    line: 'G94',
    label: 'Feed per minute',
  });

  const penUp = profile.pen.upCommand.trim();
  const penDown = profile.pen.downCommand.trim();
  const canPen = !options.dryRun && penUp.length > 0 && penDown.length > 0;
  const pathCount = plot.paths.filter((path) => path.points[0]).length;

  if (canPen) {
    steps.push({
      kind: 'wait-for-idle',
      phase: 'wait-for-idle',
      label: 'Waiting for Idle before initial pen-up',
    });
    steps.push({
      kind: 'command',
      phase: 'pen-up',
      line: penUp,
      label: 'Raising pen',
    });
  } else if (options.dryRun) {
    pushComment('(Dry run — pen commands omitted)');
  }

  let pathIndex = 0;
  for (const path of plot.paths) {
    const first = path.points[0];
    if (!first) continue;
    pathIndex += 1;

    steps.push({
      kind: 'command',
      phase: 'travel',
      line: emitMove('G0', first.x, first.y),
      pathIndex,
      pathCount,
      label: `Travelling to path ${pathIndex} of ${pathCount}`,
    });

    if (canPen) {
      steps.push({
        kind: 'wait-for-idle',
        phase: 'wait-for-idle',
        label: 'Waiting for travel motion to finish',
      });
      steps.push({
        kind: 'command',
        phase: 'pen-down',
        line: penDown,
        pathIndex,
        pathCount,
        label: 'Lowering pen',
      });
    }

    for (let i = 1; i < path.points.length; i += 1) {
      const point = path.points[i];
      if (!point) continue;
      steps.push({
        kind: 'command',
        phase: 'draw',
        line: emitMove('G1', point.x, point.y, ` F${feed}`),
        pathIndex,
        pathCount,
        label: `Drawing path ${pathIndex} of ${pathCount}`,
      });
    }

    if (path.closed && path.points.length > 2) {
      steps.push({
        kind: 'command',
        phase: 'draw',
        line: emitMove('G1', first.x, first.y, ` F${feed}`),
        pathIndex,
        pathCount,
        label: `Drawing path ${pathIndex} of ${pathCount}`,
      });
    }

    if (canPen) {
      steps.push({
        kind: 'wait-for-idle',
        phase: 'wait-for-idle',
        label: 'Waiting for path motion to finish',
      });
      steps.push({
        kind: 'command',
        phase: 'pen-up',
        line: penUp,
        pathIndex,
        pathCount,
        label: 'Raising pen',
      });
    }
  }

  // Park at the lower-left of the safe plotting rectangle (machine coordinates).
  // Final pen-up already happened after the last path — do not duplicate it.
  const geometry = calculateWorkspaceGeometry(
    profile.workspace.widthMm,
    profile.workspace.heightMm,
    profile.workspace.nonDrawableInsets,
    profile.workspace.safeMarginMm,
    profile.workspace.mediaPlacement ?? ZERO_MEDIA_PLACEMENT,
  );
  const parkX = Math.max(0, geometry.safePlotRect.x);
  const parkY = Math.max(0, geometry.safePlotRect.y);
  steps.push({
    kind: 'wait-for-idle',
    phase: 'wait-for-idle',
    label: 'Waiting for Idle before park move',
  });
  steps.push({
    kind: 'command',
    phase: 'finalization',
    line: emitMove('G0', parkX, parkY),
    label: 'Parking at safe corner',
  });
  steps.push({
    kind: 'wait-for-idle',
    phase: 'wait-for-idle',
    label: 'Verifying Idle after park',
  });
  pushComment('(End of job)');

  const lines = steps
    .filter((step): step is Extract<PlotStep, { kind: 'command' }> => step.kind === 'command')
    .map((step) => step.line);

  return {
    steps,
    lines,
    commandCount: lines.filter((line) => !line.startsWith('(')).length,
    dryRun: options.dryRun || !canPen,
  };
}

/** Counts pen-up command steps (for tests — must be exactly once per path + initial). */
export function countPenUpCommands(program: GCodeProgram, penUp: string): number {
  const trimmed = penUp.trim();
  if (!trimmed) return 0;
  return program.steps.filter(
    (step) => step.kind === 'command' && step.phase === 'pen-up' && step.line === trimmed,
  ).length;
}

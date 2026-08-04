import { derived, get, writable } from 'svelte/store';
import { COMMANDS } from '../grbl/commands';
import {
  grblClient,
  isConnected,
  logSystemMessage,
  sendCommand,
  waitForIdle,
} from '../grbl/stores';
import type { MachineProfile } from '../machines/profiles/types';
import {
  calculateWorkspaceGeometry,
  isGeometryValid,
  ZERO_MEDIA_PLACEMENT,
} from '../machines/workspaceGeometry';
import { assertCoordinateConsistency } from '../plot/coordinateConsistency';
import { generateGCode, type GCodeProgram, type PlotStep } from '../plot/gcode';
import { assessPlotGeometry } from '../plot/plotValidation';
import type { TransformedPlot } from '../plot/types';
import {
  pauseMachine,
  resumeMachine,
  softReset,
} from '../machines/actions';

/**
 * Single active plot job.
 *
 * Commands are streamed one-at-a-time through the existing GRBL queue. Before
 * every pen-state transition the streamer waits for GRBL Idle so synchronized
 * M3/M5 commands are not raced against planner drain. Pause/Resume use realtime
 * feed hold / cycle start. Cancel stops sending further lines, sends pen-up
 * when configured, and soft-resets the controller.
 */

export type JobPhase =
  | 'idle'
  | 'confirming'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface PlotJobSummary {
  documentName: string;
  /** PlotDocument id when known — used to block deletion while plotting. */
  documentId: string | null;
  pathCount: number;
  penDownLengthMm: number;
  penUpLengthMm: number;
  boundsLabel: string;
  profileName: string;
  penConfigured: boolean;
  dryRun: boolean;
  commandCount: number;
}

export interface PlotJobState {
  phase: JobPhase;
  summary: PlotJobSummary | null;
  progressIndex: number;
  progressTotal: number;
  lastError: string | null;
  /** Human-readable plot phase for diagnostics (not a G-code line). */
  statusLabel: string | null;
}

const INITIAL: PlotJobState = {
  phase: 'idle',
  summary: null,
  progressIndex: 0,
  progressTotal: 0,
  lastError: null,
  statusLabel: null,
};

const stateStore = writable<PlotJobState>({ ...INITIAL });
export const plotJob = { subscribe: stateStore.subscribe };

export const jobIsActive = derived(stateStore, ($job) =>
  ['running', 'paused', 'cancelling'].includes($job.phase),
);

/** Confirming / streaming / paused — document deletion is unsafe. */
export function jobBlocksDocumentDeletion(phase: JobPhase = get(stateStore).phase): boolean {
  return ['confirming', 'running', 'paused', 'cancelling'].includes(phase);
}

/**
 * True when a plot job holds this document (including pause and confirmation).
 * Pause does not make deletion safe.
 */
export function isDocumentLockedByPlotJob(documentId: string): boolean {
  const job = get(stateStore);
  if (!jobBlocksDocumentDeletion(job.phase)) return false;
  return job.summary?.documentId === documentId;
}

let activeProgram: GCodeProgram | null = null;
let activeProfile: MachineProfile | null = null;
let cancelRequested = false;
let runToken = 0;

function setState(patch: Partial<PlotJobState>): void {
  stateStore.update((current) => ({ ...current, ...patch }));
}

function executableCommandCount(program: GCodeProgram): number {
  return program.steps.filter(
    (step) => step.kind === 'command' && !step.line.startsWith('('),
  ).length;
}

export function prepareJob(
  plot: TransformedPlot,
  profile: MachineProfile,
  documentName: string,
  options: {
    dryRun: boolean;
    feedRateMmPerMin: number;
    documentId?: string | null;
  },
): PlotJobSummary {
  // Defensive gate — UI state must not bypass workspace constraints.
  const { workspace } = profile;
  if (
    !isGeometryValid(
      workspace.widthMm,
      workspace.heightMm,
      workspace.nonDrawableInsets,
      workspace.safeMarginMm,
      workspace.mediaPlacement ?? ZERO_MEDIA_PLACEMENT,
    )
  ) {
    throw new Error(
      'Machine workspace geometry is invalid. Fix media placement, insets, or safe margin before plotting.',
    );
  }
  const geometry = calculateWorkspaceGeometry(
    workspace.widthMm,
    workspace.heightMm,
    workspace.nonDrawableInsets,
    workspace.safeMarginMm,
    workspace.mediaPlacement ?? ZERO_MEDIA_PLACEMENT,
  );
  const assessment = assessPlotGeometry(
    plot,
    geometry.drawableRect,
    geometry.safePlotRect,
  );
  if (!assessment.canPlot) {
    throw new Error(
      assessment.headline ??
        'Drawing is outside the safe plotting area for this machine profile.',
    );
  }

  const program = generateGCode(plot, profile, options);
  // Preview and G-code must share the same final page-space points.
  assertCoordinateConsistency(plot, program);
  activeProgram = program;
  activeProfile = profile;

  const summary: PlotJobSummary = {
    documentName,
    documentId: options.documentId ?? null,
    pathCount: plot.metrics.pathCount,
    penDownLengthMm: plot.metrics.penDownLengthMm,
    penUpLengthMm: plot.metrics.penUpLengthMm,
    boundsLabel: `${plot.bounds.minX.toFixed(1)}, ${plot.bounds.minY.toFixed(1)} → ${plot.bounds.maxX.toFixed(1)}, ${plot.bounds.maxY.toFixed(1)} mm`,
    profileName: profile.name,
    penConfigured:
      profile.pen.upCommand.trim().length > 0 &&
      profile.pen.downCommand.trim().length > 0,
    dryRun: program.dryRun,
    commandCount: program.commandCount,
  };

  setState({
    phase: 'confirming',
    summary,
    progressIndex: 0,
    progressTotal: executableCommandCount(program),
    lastError: null,
    statusLabel: null,
  });

  return summary;
}

export function dismissJobConfirmation(): void {
  if (get(stateStore).phase !== 'confirming') return;
  activeProgram = null;
  setState({ ...INITIAL });
}

export async function startPreparedJob(): Promise<void> {
  if (!activeProgram || !activeProfile) {
    setState({ phase: 'failed', lastError: 'No prepared plot job.', statusLabel: null });
    return;
  }
  if (!get(isConnected)) {
    setState({
      phase: 'failed',
      lastError: 'Connect a machine in the Machines tab before plotting.',
      statusLabel: null,
    });
    return;
  }

  cancelRequested = false;
  const token = ++runToken;
  const program = activeProgram;
  const profile = activeProfile;
  const total = executableCommandCount(program);

  setState({
    phase: 'running',
    progressIndex: 0,
    progressTotal: total,
    lastError: null,
    statusLabel: 'Starting plot…',
  });

  logSystemMessage(`Starting plot job (${total} commands).`);

  const outcome = await streamPlotSteps(program.steps, {
    profile,
    isCancelled: () => cancelRequested || token !== runToken,
    onProgress: (executed, label) => {
      if (token !== runToken) return;
      setState({ progressIndex: executed, statusLabel: label });
    },
    onStatusLabel: (label) => {
      if (token !== runToken) return;
      setState({ statusLabel: label });
    },
  });

  if (token !== runToken) return;

  if (outcome.kind === 'cancelled') {
    await finalizeCancel(profile);
    return;
  }

  if (outcome.kind === 'failed') {
    setState({
      phase: 'failed',
      lastError: outcome.error,
      progressIndex: outcome.executed,
      statusLabel: outcome.label,
    });
    logSystemMessage(`Plot job failed: ${outcome.error}`);
    return;
  }

  setState({
    phase: 'completed',
    progressIndex: outcome.executed,
    progressTotal: total,
    statusLabel: 'Plot completed',
  });
  logSystemMessage('Plot job completed.');
}

export type PlotStreamHost = {
  profile: MachineProfile;
  isCancelled: () => boolean;
  onProgress: (executed: number, label: string) => void;
  onStatusLabel: (label: string) => void;
  send?: typeof sendCommand;
  waitIdle?: typeof waitForIdle;
  sleep?: (ms: number) => Promise<void>;
};

export type PlotStreamOutcome =
  | { kind: 'completed'; executed: number }
  | { kind: 'cancelled'; executed: number }
  | { kind: 'failed'; executed: number; error: string; label: string | null };

/**
 * Streams structured plot steps. Exported for regression tests.
 * Realtime Idle waits are not counted as G-code progress.
 */
export async function streamPlotSteps(
  steps: PlotStep[],
  host: PlotStreamHost,
): Promise<PlotStreamOutcome> {
  const send = host.send ?? sendCommand;
  const waitIdle = host.waitIdle ?? waitForIdle;
  const sleepFn = host.sleep ?? sleep;
  const profile = host.profile;
  const idleTimeoutMs = profile.connection.motionIdleTimeoutMs;
  const penUp = profile.pen.upCommand.trim();
  const penDown = profile.pen.downCommand.trim();

  let executed = 0;

  for (const step of steps) {
    if (host.isCancelled()) {
      return { kind: 'cancelled', executed };
    }

    // Wait while paused.
    while (get(stateStore).phase === 'paused') {
      if (host.isCancelled()) return { kind: 'cancelled', executed };
      await sleepFn(50);
    }
    if (host.isCancelled()) return { kind: 'cancelled', executed };

    if (step.kind === 'wait-for-idle') {
      host.onStatusLabel(step.label);
      try {
        await waitIdle({
          timeoutMs: idleTimeoutMs,
          pollingIntervalMs: 250,
          isCancelled: host.isCancelled,
        });
      } catch (error) {
        if (
          host.isCancelled() ||
          (error instanceof Error &&
            'code' in error &&
            (error as { code?: string }).code === 'CANCELLED')
        ) {
          return { kind: 'cancelled', executed };
        }
        const message =
          error instanceof Error ? error.message : 'Failed while waiting for Idle.';
        return {
          kind: 'failed',
          executed,
          error: message,
          label: step.label,
        };
      }
      continue;
    }

    if (step.line.startsWith('(')) continue;

    host.onStatusLabel(step.label);
    const result = await send(step.line);
    if (!result.ok) {
      return {
        kind: 'failed',
        executed,
        error: result.error ?? `Command failed: ${step.line}`,
        label: step.label,
      };
    }

    if (step.phase === 'pen-up' && step.line === penUp && profile.pen.upDelayMs > 0) {
      await sleepFn(profile.pen.upDelayMs);
    }
    if (
      step.phase === 'pen-down' &&
      step.line === penDown &&
      profile.pen.downDelayMs > 0
    ) {
      await sleepFn(profile.pen.downDelayMs);
    }

    executed += 1;
    host.onProgress(executed, step.label);
  }

  if (host.isCancelled()) return { kind: 'cancelled', executed };
  return { kind: 'completed', executed };
}

export async function pausePlotJob(): Promise<void> {
  if (get(stateStore).phase !== 'running') return;
  setState({ phase: 'paused', statusLabel: 'Paused' });
  await pauseMachine();
  logSystemMessage('Plot job paused (feed hold).');
}

export async function resumePlotJob(): Promise<void> {
  if (get(stateStore).phase !== 'paused') return;
  setState({ phase: 'running', statusLabel: 'Resuming…' });
  await resumeMachine();
  logSystemMessage('Plot job resumed.');
}

export async function cancelPlotJob(): Promise<void> {
  const phase = get(stateStore).phase;
  if (!['running', 'paused', 'confirming'].includes(phase)) return;

  if (phase === 'confirming') {
    dismissJobConfirmation();
    return;
  }

  cancelRequested = true;
  setState({ phase: 'cancelling', statusLabel: 'Cancelling…' });
  logSystemMessage('Plot job cancel requested.');
}

async function finalizeCancel(profile: MachineProfile): Promise<void> {
  setState({ phase: 'cancelling', statusLabel: 'Raising pen and resetting…' });

  // Cancel path may send a safety pen-up; success path never duplicates the
  // generator's final path pen-up here.
  const penUp = profile.pen.upCommand.trim();
  if (penUp && !grblClient.isTimeoutBlocked()) {
    try {
      await waitForIdle({
        timeoutMs: Math.min(profile.connection.motionIdleTimeoutMs, 10_000),
        pollingIntervalMs: 250,
        isCancelled: () => false,
      });
    } catch {
      // Best effort — still attempt pen-up / soft-reset.
    }
    await sendCommand(penUp);
    if (profile.pen.upDelayMs > 0) await sleep(profile.pen.upDelayMs);
  } else if (grblClient.isTimeoutBlocked()) {
    grblClient.clearTimeoutBlock();
  }

  await softReset();
  await sleep(200);
  await sendCommand(COMMANDS.unlock).catch(() => undefined);

  setState({
    phase: 'cancelled',
    lastError: null,
    statusLabel: 'Plot cancelled',
  });
  logSystemMessage('Plot job cancelled. Controller soft-reset.');
  runToken += 1;
  activeProgram = null;
}

export function clearJobState(): void {
  if (['running', 'paused', 'cancelling'].includes(get(stateStore).phase)) return;
  activeProgram = null;
  activeProfile = null;
  setState({ ...INITIAL });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the GRBL client currently has a plot-related busy state. */
export function isPlotStreaming(): boolean {
  return get(jobIsActive);
}

/** Test helper — replaces job state without streaming. */
export function __setPlotJobStateForTests(next: Partial<PlotJobState>): void {
  const phase = next.phase ?? 'idle';
  if (!jobBlocksDocumentDeletion(phase) && phase !== 'paused') {
    activeProgram = null;
    activeProfile = null;
  }
  stateStore.set({
    ...INITIAL,
    ...next,
    phase,
  });
}

void grblClient;

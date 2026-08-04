import { createId } from '../utils/misc';
import { hashSource } from '../sketches/sourceHash';

/** Immutable snapshot of a Generate preview run at click time. */
export type RunSnapshot = {
  runId: string;
  runtimeId: string;
  sketchId: string;
  source: string;
  sourceHash: string;
  startedAt: number;
};

export type RunTerminalState =
  | 'success'
  | 'error'
  | 'cancelled'
  | 'timeout';

export type RuntimeCanvasInfo = {
  widthUnits: number;
  heightUnits: number;
  renderer: '2d' | 'webgl' | 'unknown';
};

export type RunOutcome = {
  ok: boolean;
  state: RunTerminalState;
  runId: string;
  runtimeId: string;
  sketchId: string;
  sourceHash: string;
  error?: string;
  canvas?: RuntimeCanvasInfo;
};

/** Successful preview ownership — never show under a different sketch/source. */
export type PreviewOwnership = {
  sketchId: string;
  sourceHash: string;
  renderedAt: number;
};

export function createRunSnapshot(input: {
  sketchId: string;
  source: string;
  runtimeId: string;
}): RunSnapshot {
  return {
    runId: createId('run'),
    runtimeId: input.runtimeId,
    sketchId: input.sketchId,
    source: input.source,
    sourceHash: hashSource(input.source),
    startedAt: Date.now(),
  };
}

export function ownershipMatches(
  ownership: PreviewOwnership | null,
  sketchId: string,
  source: string,
): boolean {
  if (!ownership) return false;
  return (
    ownership.sketchId === sketchId &&
    ownership.sourceHash === hashSource(source)
  );
}

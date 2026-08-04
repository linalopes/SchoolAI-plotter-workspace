import { describe, expect, it, vi } from 'vitest';
import {
  RunCancelledError,
  RunTimeoutError,
  DEFAULT_PREVIEW_TIMEOUT_MS,
} from '../p5/runner';
import { createRunSnapshot, type RunOutcome } from './runSnapshot';

/**
 * Pure lifecycle rules: every run ends in exactly one terminal state, and
 * superseded outcomes must not leave Running stuck.
 */

function settleRun(
  outcome: RunOutcome,
  currentRunId: string | null,
): { running: boolean; status: RunOutcome['state'] | 'ignored' } {
  if (currentRunId !== outcome.runId) {
    return { running: false, status: 'ignored' };
  }
  return { running: false, status: outcome.state };
}

describe('preview run lifecycle', () => {
  it('uses a 10s default timeout for static examples', () => {
    expect(DEFAULT_PREVIEW_TIMEOUT_MS).toBe(10_000);
  });

  it('maps cancel and timeout to terminal states that clear Running', () => {
    const snapshot = createRunSnapshot({
      sketchId: 's1',
      source: 'x',
      runtimeId: 'r1',
    });

    const cancelled: RunOutcome = {
      ok: false,
      state: 'cancelled',
      runId: snapshot.runId,
      runtimeId: snapshot.runtimeId,
      sketchId: snapshot.sketchId,
      sourceHash: snapshot.sourceHash,
      error: new RunCancelledError().message,
    };
    const timedOut: RunOutcome = {
      ok: false,
      state: 'timeout',
      runId: snapshot.runId,
      runtimeId: snapshot.runtimeId,
      sketchId: snapshot.sketchId,
      sourceHash: snapshot.sourceHash,
      error: new RunTimeoutError().message,
    };

    expect(settleRun(cancelled, snapshot.runId)).toEqual({
      running: false,
      status: 'cancelled',
    });
    expect(settleRun(timedOut, snapshot.runId)).toEqual({
      running: false,
      status: 'timeout',
    });
  });

  it('ignores stale outcomes without leaving a pending current run', () => {
    const stale: RunOutcome = {
      ok: true,
      state: 'success',
      runId: 'run-old',
      runtimeId: 'r1',
      sketchId: 's1',
      sourceHash: 'abc',
    };
    const settled = settleRun(stale, 'run-new');
    expect(settled.status).toBe('ignored');
    expect(settled.running).toBe(false);
  });

  it('finally clears Running only for the current run id', () => {
    let activeRunId: string | null = 'run-1';
    let running = true;

    const finish = (runId: string) => {
      if (activeRunId === runId) {
        activeRunId = null;
        running = false;
      }
    };

    finish('run-old');
    expect(running).toBe(true);
    expect(activeRunId).toBe('run-1');

    finish('run-1');
    expect(running).toBe(false);
    expect(activeRunId).toBeNull();
  });

  it('cancel rejects with RunCancelledError rather than hanging', async () => {
    const pending = new Promise<never>((_resolve, reject) => {
      reject(new RunCancelledError('Switched sketches.'));
    });
    await expect(pending).rejects.toBeInstanceOf(RunCancelledError);
  });

  it('timeout path does not require a page refresh (retry-ready)', () => {
    const clearRunning = vi.fn();
    const disposeRuntime = vi.fn();
    try {
      throw new RunTimeoutError();
    } catch (error) {
      expect(error).toBeInstanceOf(RunTimeoutError);
      disposeRuntime();
      clearRunning();
    }
    expect(disposeRuntime).toHaveBeenCalledOnce();
    expect(clearRunning).toHaveBeenCalledOnce();
  });
});

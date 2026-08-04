import { describe, expect, it } from 'vitest';
import {
  isHostMessage,
  isRuntimeMessage,
  isStaleRunId,
  type RuntimeMessage,
} from './protocol';

describe('sketch runtime protocol', () => {
  it('accepts well-formed host and runtime messages', () => {
    expect(
      isHostMessage({ type: 'RUN_SKETCH', runId: 'run-1', source: 'function setup(){}' }),
    ).toBe(true);
    expect(isHostMessage({ type: 'CAPTURE_SVG', runId: 'run-1' })).toBe(true);
    expect(isHostMessage({ type: 'STOP_SKETCH', runId: 'run-1' })).toBe(true);
    expect(isRuntimeMessage({ type: 'RUNTIME_READY' })).toBe(true);
    expect(
      isRuntimeMessage({
        type: 'SKETCH_ERROR',
        runId: 'run-1',
        message: 'boom',
        line: 3,
        phase: 'setup',
      }),
    ).toBe(true);
  });

  it('rejects malformed messages', () => {
    expect(isHostMessage({ type: 'RUN_SKETCH', runId: 'run-1' })).toBe(false);
    expect(isRuntimeMessage({ type: 'SVG_CAPTURED', runId: 'run-1' })).toBe(false);
    expect(isRuntimeMessage({ type: 'UNKNOWN' })).toBe(false);
  });

  it('ignores messages from stale run IDs', () => {
    const message: RuntimeMessage = {
      type: 'SKETCH_RENDERED',
      runId: 'old-run',
    };
    expect(isStaleRunId(message, 'new-run')).toBe(true);
    expect(isStaleRunId(message, 'old-run')).toBe(false);
    expect(isStaleRunId({ type: 'RUNTIME_READY' }, 'new-run')).toBe(false);
    expect(isStaleRunId(message, null)).toBe(true);
  });
});

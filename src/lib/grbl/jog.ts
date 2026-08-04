import {
  COMMANDS,
  buildJogCommand,
  buildLegacyJogMove,
  type JogAxis,
} from './commands';
import type { CommandResult, GrblStatus, ParserModalState } from './types';

/**
 * Finite jogging for GRBL 1.1 (`$J=`) and GRBL 0.9 (legacy G-code).
 *
 * Kept out of Svelte components so both protocol paths share one transaction
 * model: connect checks, concurrency guards, modal capture/restore, and the
 * Idle wait that keeps the next jog from overlapping the previous move.
 */

export interface JogHost {
  isConnected(): boolean;
  isJogBusy(): boolean;
  setJogBusy(busy: boolean): void;
  supportsJogCommand(): boolean;
  getMachineState(): GrblStatus['state'] | null;
  send(command: string, timeoutMs?: number): Promise<CommandResult>;
  requestStatus(manual?: boolean): void;
  getLastParserState(): ParserModalState | null;
  clearLastParserState(): void;
  logSystem(message: string): void;
  logError(message: string): void;
}

/** How long a legacy move may take before the Idle wait gives up. */
const LEGACY_IDLE_TIMEOUT_MS = 30_000;
const IDLE_POLL_MS = 50;

export function motionPermitsJog(state: GrblStatus['state'] | null): {
  ok: boolean;
  reason: string | null;
} {
  switch (state) {
    case null:
    case 'Idle':
    case 'Check':
    case 'Sleep':
    case 'Unknown':
      return { ok: true, reason: null };
    case 'Alarm':
      return {
        ok: false,
        reason:
          'The machine is alarmed. Use Unlock, or home the machine, before jogging.',
      };
    case 'Run':
    case 'Jog':
      return { ok: false, reason: 'The machine is running a motion.' };
    case 'Hold':
      return {
        ok: false,
        reason: 'The machine is paused. Resume before jogging.',
      };
    case 'Door':
      return { ok: false, reason: 'A safety door is reported as open.' };
    case 'Home':
      return { ok: false, reason: 'A homing cycle is running.' };
    default:
      return { ok: true, reason: null };
  }
}

/**
 * Sends one finite jog using the protocol the host currently supports.
 *
 * For GRBL 1.1 this is a single `$J=` command. For GRBL 0.9 it is a multi-step
 * transaction that temporarily switches to incremental millimetres, moves with
 * G1 at the configured feed, waits for Idle, and restores the previous modes.
 */
export async function performJog(
  host: JogHost,
  axis: JogAxis,
  distanceMm: number,
  feedRateMmMin: number,
): Promise<CommandResult> {
  if (!host.isConnected()) {
    const error = 'Not connected. Commands are only sent to an open machine.';
    host.logError(error);
    return { ok: false, command: '', error };
  }

  if (host.isJogBusy()) {
    const error = 'A jog transaction is already in progress.';
    host.logError(error);
    return { ok: false, command: '', error };
  }

  const permit = motionPermitsJog(host.getMachineState());
  if (!permit.ok) {
    host.logError(permit.reason ?? 'Jogging is not available.');
    return { ok: false, command: '', error: permit.reason ?? 'Jogging is not available.' };
  }

  host.setJogBusy(true);
  try {
    if (host.supportsJogCommand()) {
      return await host.send(
        buildJogCommand(axis, distanceMm, feedRateMmMin),
      );
    }
    return await legacyJog(host, axis, distanceMm, feedRateMmMin);
  } finally {
    host.setJogBusy(false);
  }
}

async function legacyJog(
  host: JogHost,
  axis: JogAxis,
  distanceMm: number,
  feedRateMmMin: number,
): Promise<CommandResult> {
  const moveCommand = buildLegacyJogMove(axis, distanceMm, feedRateMmMin);

  host.clearLastParserState();
  const parserResult = await host.send(COMMANDS.parserState);
  let previous = host.getLastParserState();

  if (!parserResult.ok || !previous) {
    host.logSystem(
      'Previous modal state could not be confirmed from $G. Using a conservative G21 / G91 → move → G90 sequence.',
    );
    previous = null;
  }

  const unitsToRestore = previous?.units ?? null;
  const distanceToRestore = previous?.distanceMode ?? 'G90';
  const needUnits = !previous || previous.units !== 'G21';
  const needIncremental = !previous || previous.distanceMode !== 'G91';

  let moveResult: CommandResult = { ok: false, command: moveCommand };
  let restoreFailed = false;

  try {
    if (needUnits) {
      const units = await host.send(COMMANDS.unitsMm);
      if (!units.ok) {
        return {
          ok: false,
          command: moveCommand,
          error: units.error ?? 'Could not set millimetre units (G21).',
        };
      }
    }

    if (needIncremental) {
      const incremental = await host.send(COMMANDS.incrementalMode);
      if (!incremental.ok) {
        // Best effort: put absolute mode back if we changed units only.
        await restoreModalState(host, distanceToRestore, unitsToRestore, previous);
        return {
          ok: false,
          command: moveCommand,
          error: incremental.error ?? 'Could not set incremental mode (G91).',
        };
      }
    }

    moveResult = await host.send(moveCommand);
    if (!moveResult.ok) {
      return moveResult;
    }

    const idle = await waitForIdle(host, LEGACY_IDLE_TIMEOUT_MS);
    if (!idle) {
      host.logError(
        'The machine did not return to Idle after the legacy jog. Check the controller and soft-reset if needed.',
      );
      moveResult = {
        ok: false,
        command: moveCommand,
        error: 'Timed out waiting for Idle after the legacy jog.',
      };
    }
  } finally {
    // Modal state must be restored even when the move failed mid-transaction.
    restoreFailed = !(await restoreModalState(
      host,
      distanceToRestore,
      unitsToRestore,
      previous,
    ));
  }

  if (restoreFailed) {
    const error =
      'Modal state restoration failed after the legacy jog. Check G90/G91 and G20/G21 before sending further motion.';
    host.logError(error);
    return { ok: false, command: moveCommand, error };
  }

  return moveResult;
}

async function restoreModalState(
  host: JogHost,
  distanceMode: 'G90' | 'G91',
  units: 'G20' | 'G21' | null,
  previous: ParserModalState | null,
): Promise<boolean> {
  let ok = true;

  const distanceResult = await host.send(
    distanceMode === 'G91' ? COMMANDS.incrementalMode : COMMANDS.absoluteMode,
  );
  if (!distanceResult.ok) {
    host.logError(
      `Could not restore distance mode (${distanceMode}): ${distanceResult.error ?? 'unknown error'}`,
    );
    ok = false;
  }

  // Only restore units when a confirmed previous state used inches. If modal
  // state was never obtained, leave G21 in place — that is the safer default
  // for this application.
  if (previous && units === 'G20') {
    const unitsResult = await host.send(COMMANDS.unitsInch);
    if (!unitsResult.ok) {
      host.logError(
        `Could not restore units (G20): ${unitsResult.error ?? 'unknown error'}`,
      );
      ok = false;
    }
  }

  return ok;
}

async function waitForIdle(host: JogHost, timeoutMs: number): Promise<boolean> {
  // G1 is acknowledged as soon as the planner accepts it, so the last cached
  // status may still say Idle. At least two fresh samples after the move are
  // required before Idle is trusted, which also covers moves that finish
  // between polls without ever exposing a Run sample to the client.
  const start = Date.now();
  let samples = 0;
  while (Date.now() - start < timeoutMs) {
    host.requestStatus(false);
    await sleep(IDLE_POLL_MS);
    samples += 1;
    const state = host.getMachineState();
    if (state === 'Alarm' || state === 'Door') return false;
    if (samples >= 2 && state === 'Idle') return true;
  }
  return host.getMachineState() === 'Idle';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

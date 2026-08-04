import { derived, get } from 'svelte/store';
import { COMMANDS, type JogAxis } from '../grbl/commands';
import type { CommandResult } from '../grbl/client';
import {
  commandQueue,
  connectMachine,
  connection,
  disconnectMachine,
  grblClient,
  homingEnabled,
  jogBusy,
  logSystemMessage,
  machineStatus,
  selectSerialPort,
  sendCommand,
} from '../grbl/stores';
import type { TransportKind } from '../serial/types';
import { preferences } from '../stores/preferences';
import { activeProfile } from './stores/profiles';

/**
 * Machine actions and their guard conditions.
 *
 * Keeping the rules here rather than in the components means the Overview,
 * Manual Control, and Console screens cannot drift apart about when a
 * movement is allowed.
 */

/** True while a queued command is waiting for `ok` or `error`. */
export const hasPendingCommand = derived(commandQueue, ($queue) =>
  $queue.some((entry) => entry.status === 'pending' || entry.status === 'sent'),
);

export interface JogAvailability {
  enabled: boolean;
  /** Why jogging is blocked, written for display next to the controls. */
  reason: string | null;
}

export const jogAvailability = derived(
  [connection, machineStatus, hasPendingCommand, jogBusy],
  ([$connection, $status, $pending, $jogBusy]): JogAvailability => {
    switch ($connection.phase) {
      case 'disconnected':
        return { enabled: false, reason: 'Connect the machine to enable jogging.' };
      case 'connecting':
      case 'handshaking':
        return { enabled: false, reason: 'Waiting for the controller to respond.' };
      case 'disconnecting':
        return { enabled: false, reason: 'The connection is closing.' };
      default:
        break;
    }

    if ($jogBusy) {
      return {
        enabled: false,
        reason: 'Waiting for the current jog to finish and return to Idle.',
      };
    }

    if ($pending) {
      return { enabled: false, reason: 'A command is still in progress.' };
    }

    switch ($status?.state) {
      case 'Alarm':
        return {
          enabled: false,
          reason: 'The machine is alarmed. Use Unlock, or home the machine, before jogging.',
        };
      case 'Run':
        return { enabled: false, reason: 'The machine is running a motion.' };
      case 'Jog':
        return { enabled: false, reason: 'The machine is running a motion.' };
      case 'Hold':
        return {
          enabled: false,
          reason: 'The machine is paused. Resume before jogging.',
        };
      case 'Door':
        return { enabled: false, reason: 'A safety door is reported as open.' };
      case 'Home':
        return { enabled: false, reason: 'A homing cycle is running.' };
      default:
        return { enabled: true, reason: null };
    }
  },
);

export interface HomeAvailability {
  enabled: boolean;
  reason: string | null;
}

/**
 * Homing is refused when the controller reports `$22=0`.
 *
 * The application never writes EEPROM to enable homing — that requires
 * correctly wired switches and a deliberate firmware change.
 */
export const homeAvailability = derived(
  [connection, machineStatus, hasPendingCommand, jogBusy, homingEnabled],
  ([$connection, $status, $pending, $jogBusy, $homing]): HomeAvailability => {
    if ($connection.phase !== 'connected' && $connection.phase !== 'handshaking') {
      return { enabled: false, reason: 'Connect the machine first.' };
    }
    if ($homing === false) {
      return {
        enabled: false,
        reason: 'Homing is disabled in the controller settings ($22=0).',
      };
    }
    if ($homing === null) {
      return {
        enabled: false,
        reason: 'Homing availability is unknown until GRBL settings are read.',
      };
    }
    if ($pending || $jogBusy) {
      return { enabled: false, reason: 'A command is still in progress.' };
    }
    if (
      $status?.state === 'Run' ||
      $status?.state === 'Jog' ||
      $status?.state === 'Home'
    ) {
      return { enabled: false, reason: 'The machine is already moving.' };
    }
    return { enabled: true, reason: null };
  },
);

export function currentTransportKind(): TransportKind {
  return get(preferences).demoMode ? 'demo' : 'web-serial';
}

/**
 * Opens the port picker. Must be called directly from a click handler so the
 * browser still recognises the user gesture.
 */
export async function chooseSerialPort(): Promise<boolean> {
  return selectSerialPort(currentTransportKind());
}

/**
 * Connect action used by both Overview and Connection.
 *
 * When no port has been chosen yet, the picker is opened first so a single
 * click covers the whole flow. Cancelling the picker simply stops, without
 * raising an error.
 */
export async function connectFromUi(): Promise<void> {
  const kind = currentTransportKind();

  if (kind === 'web-serial' && !grblClient.hasPort()) {
    const selected = await chooseSerialPort();
    if (!selected) return;
  }

  await connectMachine(kind);
}

export async function disconnectFromUi(): Promise<void> {
  await disconnectMachine();
}

/**
 * Sends one finite jog.
 *
 * Protocol selection (GRBL 1.1 `$J=` vs GRBL 0.9 legacy G-code) lives in the
 * GRBL client. Continuous jogging is out of scope for this milestone.
 */
export async function jog(
  axis: JogAxis,
  direction: 1 | -1,
  stepMm: number,
): Promise<CommandResult> {
  const feedRate = get(activeProfile).motion.jogFeedRateMmPerMin;
  return grblClient.jog(axis, stepMm * direction, feedRate);
}

export async function homeMachine(): Promise<CommandResult> {
  const availability = get(homeAvailability);
  if (!availability.enabled) {
    const error = availability.reason ?? 'Homing is not available.';
    logSystemMessage(error);
    return { ok: false, command: COMMANDS.home, error };
  }
  logSystemMessage('Homing cycle requested. The machine moves towards its limit switches.');
  return sendCommand(COMMANDS.home);
}

export async function unlockMachine(): Promise<CommandResult> {
  return sendCommand(COMMANDS.unlock);
}

export async function setWorkZero(): Promise<CommandResult> {
  return sendCommand(COMMANDS.setWorkZero);
}

export async function goToWorkZero(): Promise<CommandResult> {
  return sendCommand(COMMANDS.goToWorkZero);
}

/** Feed hold. Named for what it does; it is not an emergency stop. */
export async function pauseMachine(): Promise<void> {
  await grblClient.sendRealtime('feedHold');
}

export async function resumeMachine(): Promise<void> {
  await grblClient.sendRealtime('cycleStart');
}

/**
 * Soft reset. Restarts the controller's interpreter and abandons any motion in
 * the planner. The position may be lost, which is why the caller confirms first.
 */
export async function softReset(): Promise<void> {
  await grblClient.sendRealtime('softReset');
}

export async function requestStatusNow(): Promise<void> {
  grblClient.requestStatus(true);
}

/**
 * Sends a configured pen command followed by its dwell.
 *
 * The delay is applied in the application rather than as a G4 dwell so the
 * command sent to the machine stays exactly what the user typed.
 */
export async function sendPenCommand(
  command: string,
  delayMs: number,
): Promise<CommandResult> {
  const result = await sendCommand(command);
  if (result.ok && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return result;
}

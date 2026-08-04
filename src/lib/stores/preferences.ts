import { get, writable } from 'svelte/store';
import { STORAGE_KEYS, readStoredRaw, writeStored } from '../utils/storage';
import { isRecord } from '../utils/misc';
import { JOG_STEP_OPTIONS, type JogStep } from '../machines/profiles/types';
import type { ConsoleDirection } from '../grbl/types';

/**
 * Durable interface preferences.
 *
 * Only inert display choices belong here. Connection state, the serial port
 * object, and the command queue are deliberately excluded: restoring them would
 * let the interface claim a machine is connected when it is not.
 */

export interface Preferences {
  jogStep: JogStep;
  consoleAutoScroll: boolean;
  consoleFilters: Record<ConsoleDirection, boolean>;
  demoMode: boolean;
  /** Editor share of the Generate split (0.35–0.75). */
  generateEditorRatio: number;
}

const DEFAULTS: Preferences = {
  jogStep: 1,
  consoleAutoScroll: true,
  consoleFilters: { TX: true, RX: true, SYSTEM: true, ERROR: true },
  demoMode: false,
  generateEditorRatio: 0.55,
};

function sanitize(value: unknown): Preferences {
  if (!isRecord(value)) return { ...DEFAULTS };
  const filters = isRecord(value.consoleFilters) ? value.consoleFilters : {};
  const jogStep = (JOG_STEP_OPTIONS as readonly number[]).includes(
    value.jogStep as number,
  )
    ? (value.jogStep as JogStep)
    : DEFAULTS.jogStep;

  const ratio =
    typeof value.generateEditorRatio === 'number' &&
    Number.isFinite(value.generateEditorRatio)
      ? Math.min(0.75, Math.max(0.35, value.generateEditorRatio))
      : DEFAULTS.generateEditorRatio;

  return {
    jogStep,
    consoleAutoScroll: value.consoleAutoScroll !== false,
    consoleFilters: {
      TX: filters.TX !== false,
      RX: filters.RX !== false,
      SYSTEM: filters.SYSTEM !== false,
      ERROR: filters.ERROR !== false,
    },
    // Demo mode is a connection choice, but persisting the preference avoids
    // re-selecting it on every reload during development. It never
    // auto-connects.
    demoMode: value.demoMode === true,
    generateEditorRatio: ratio,
  };
}

const store = writable<Preferences>(sanitize(readStoredRaw(STORAGE_KEYS.preferences)));

export const preferences = { subscribe: store.subscribe };

export function updatePreferences(patch: Partial<Preferences>): void {
  const next = sanitize({ ...get(store), ...patch });
  store.set(next);
  writeStored(STORAGE_KEYS.preferences, next);
}

export function toggleConsoleFilter(direction: ConsoleDirection): void {
  const current = get(store);
  updatePreferences({
    consoleFilters: {
      ...current.consoleFilters,
      [direction]: !current.consoleFilters[direction],
    },
  });
}

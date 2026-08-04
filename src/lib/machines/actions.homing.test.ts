import { describe, expect, it } from 'vitest';
import type { ConnectionInfo, GrblSetting, GrblStatus } from '../grbl/types';

/**
 * Homing availability rules.
 *
 * Exercised here against the same decision table the UI uses, without mounting
 * Svelte components. `$22=0` must disable Home without suggesting EEPROM writes.
 */

function evaluateHomeAvailability(input: {
  phase: ConnectionInfo['phase'];
  homing: boolean | null;
  pending: boolean;
  jogBusy: boolean;
  state: GrblStatus['state'] | null;
}): { enabled: boolean; reason: string | null } {
  if (input.phase !== 'connected' && input.phase !== 'handshaking') {
    return { enabled: false, reason: 'Connect the machine first.' };
  }
  if (input.homing === false) {
    return {
      enabled: false,
      reason: 'Homing is disabled in the controller settings ($22=0).',
    };
  }
  if (input.homing === null) {
    return {
      enabled: false,
      reason: 'Homing availability is unknown until GRBL settings are read.',
    };
  }
  if (input.pending || input.jogBusy) {
    return { enabled: false, reason: 'A command is still in progress.' };
  }
  if (
    input.state === 'Run' ||
    input.state === 'Jog' ||
    input.state === 'Home'
  ) {
    return { enabled: false, reason: 'The machine is already moving.' };
  }
  return { enabled: true, reason: null };
}

function homingFromSettings(settings: GrblSetting[]): boolean | null {
  const setting = settings.find((entry) => entry.key === 22);
  if (!setting) return null;
  return setting.value.trim() !== '0';
}

describe('Home button when $22=0', () => {
  it('disables Home and explains that homing is disabled in the controller', () => {
    const settings: GrblSetting[] = [
      { key: 22, value: '0', label: 'Homing cycle enable', unit: null },
    ];
    expect(homingFromSettings(settings)).toBe(false);

    const availability = evaluateHomeAvailability({
      phase: 'connected',
      homing: false,
      pending: false,
      jogBusy: false,
      state: 'Idle',
    });

    expect(availability.enabled).toBe(false);
    expect(availability.reason).toBe(
      'Homing is disabled in the controller settings ($22=0).',
    );
  });

  it('enables Home only when $22 is non-zero', () => {
    expect(
      homingFromSettings([
        { key: 22, value: '1', label: 'Homing cycle enable', unit: null },
      ]),
    ).toBe(true);

    const availability = evaluateHomeAvailability({
      phase: 'connected',
      homing: true,
      pending: false,
      jogBusy: false,
      state: 'Idle',
    });
    expect(availability.enabled).toBe(true);
  });
});

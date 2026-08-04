/**
 * GRBL command construction and reference tables.
 *
 * Realtime characters are kept strictly apart from queued commands: realtime
 * bytes are consumed by the controller's interrupt handler and never produce an
 * `ok`, so mixing them into the queue would stall it forever.
 */

/** Single-byte commands that bypass the serial receive buffer entirely. */
export const REALTIME_BYTES = {
  /** `?` — request a status report. */
  statusReport: 0x3f,
  /** `!` — feed hold. */
  feedHold: 0x21,
  /** `~` — cycle start / resume. */
  cycleStart: 0x7e,
  /** Ctrl-X — soft reset. Sent as the byte 0x18, never as literal text. */
  softReset: 0x18,
} as const;

export type RealtimeCommand = keyof typeof REALTIME_BYTES;

export const REALTIME_LABELS: Record<RealtimeCommand, string> = {
  statusReport: 'Status request (?)',
  feedHold: 'Feed hold (!)',
  cycleStart: 'Cycle start (~)',
  softReset: 'Soft reset (Ctrl-X, 0x18)',
};

/** Queued system and G-code commands used by this milestone. */
export const COMMANDS = {
  buildInfo: '$I',
  settings: '$$',
  /** Parser modal state — used to restore G90/G91 and G20/G21 after legacy jogs. */
  parserState: '$G',
  home: '$H',
  unlock: '$X',
  absoluteMode: 'G90',
  incrementalMode: 'G91',
  unitsMm: 'G21',
  unitsInch: 'G20',
  /** Sets the current position as work zero in coordinate system G54. */
  setWorkZero: 'G10 L20 P1 X0 Y0',
  goToWorkZero: 'G90 G0 X0 Y0',
} as const;

export type JogAxis = 'X' | 'Y';

/**
 * Builds a GRBL 1.1 incremental jog command.
 *
 * Jogging uses the `$J=` prefix rather than a plain G1 so the move can be
 * cancelled without flushing the planner and without altering modal state.
 */
export function buildJogCommand(
  axis: JogAxis,
  distanceMm: number,
  feedRateMmPerMin: number,
): string {
  const distance = formatNumber(distanceMm);
  const feed = Math.max(1, Math.round(feedRateMmPerMin));
  return `$J=G91 ${axis}${distance} F${feed}`;
}

/**
 * Builds a controlled-feed incremental move for GRBL 0.9 legacy jogging.
 *
 * Uses G1 rather than G0 so the configured jog feed rate is honoured instead of
 * the controller's maximum rapid rate.
 */
export function buildLegacyJogMove(
  axis: JogAxis,
  distanceMm: number,
  feedRateMmPerMin: number,
): string {
  const distance = formatNumber(distanceMm);
  const feed = Math.max(1, Math.round(feedRateMmPerMin));
  return `G1 ${axis}${distance} F${feed}`;
}

/** Trims trailing zeros so `10.000` is sent as `10`. */
export function formatNumber(value: number): string {
  return Number.parseFloat(value.toFixed(3)).toString();
}

export interface SettingDefinition {
  label: string;
  unit: string | null;
}

/**
 * Documented `$$` settings. Only used to label the read-only calibration table;
 * unknown keys are still displayed with their raw value.
 */
export const SETTING_DEFINITIONS: Record<number, SettingDefinition> = {
  0: { label: 'Step pulse time', unit: 'µs' },
  1: { label: 'Step idle delay', unit: 'ms' },
  2: { label: 'Step pulse invert mask', unit: null },
  3: { label: 'Step direction invert mask', unit: null },
  4: { label: 'Invert step enable pin', unit: null },
  5: { label: 'Invert limit pins', unit: null },
  6: { label: 'Invert probe pin', unit: null },
  10: { label: 'Status report options', unit: null },
  11: { label: 'Junction deviation', unit: 'mm' },
  12: { label: 'Arc tolerance', unit: 'mm' },
  13: { label: 'Report in inches', unit: null },
  20: { label: 'Soft limits enable', unit: null },
  21: { label: 'Hard limits enable', unit: null },
  22: { label: 'Homing cycle enable', unit: null },
  23: { label: 'Homing direction invert mask', unit: null },
  24: { label: 'Homing locate feed rate', unit: 'mm/min' },
  25: { label: 'Homing search seek rate', unit: 'mm/min' },
  26: { label: 'Homing switch debounce delay', unit: 'ms' },
  27: { label: 'Homing switch pull-off distance', unit: 'mm' },
  30: { label: 'Maximum spindle speed', unit: 'RPM' },
  31: { label: 'Minimum spindle speed', unit: 'RPM' },
  32: { label: 'Laser mode enable', unit: null },
  100: { label: 'X steps/mm', unit: 'steps/mm' },
  101: { label: 'Y steps/mm', unit: 'steps/mm' },
  102: { label: 'Z steps/mm', unit: 'steps/mm' },
  110: { label: 'X maximum rate', unit: 'mm/min' },
  111: { label: 'Y maximum rate', unit: 'mm/min' },
  112: { label: 'Z maximum rate', unit: 'mm/min' },
  120: { label: 'X acceleration', unit: 'mm/s²' },
  121: { label: 'Y acceleration', unit: 'mm/s²' },
  122: { label: 'Z acceleration', unit: 'mm/s²' },
  130: { label: 'X maximum travel', unit: 'mm' },
  131: { label: 'Y maximum travel', unit: 'mm' },
  132: { label: 'Z maximum travel', unit: 'mm' },
};

/** `error:n` descriptions from the GRBL 1.1 documentation. */
export const GRBL_ERRORS: Record<number, string> = {
  1: 'Expected a G-code command letter but none was found.',
  2: 'A numeric value in the command was missing or malformed.',
  3: 'The $ system command is not recognised.',
  4: 'A negative value was supplied where only positive values are valid.',
  5: 'Homing is disabled in the GRBL settings ($22).',
  6: 'The step pulse time is below the allowed minimum.',
  7: 'EEPROM read failed. Default values were restored.',
  8: 'This $ command requires the machine to be idle.',
  9: 'G-code commands are locked out while the machine is alarmed or in jog mode.',
  10: 'Soft limits require homing to be enabled.',
  11: 'The command line exceeded the maximum accepted length.',
  12: 'The requested step rate exceeds the maximum supported rate.',
  13: 'A safety door was detected as open.',
  14: 'The build info or startup line exceeded the available EEPROM space.',
  15: 'A jog target exceeds the machine travel limits.',
  16: 'The jog command is missing the $J= prefix or contains a disallowed word.',
  17: 'Laser mode requires PWM output.',
  20: 'The command contains an unsupported or invalid G-code word.',
  21: 'More than one G-code command from the same modal group was used.',
  22: 'A feed rate has not been set or is undefined.',
  23: 'A G-code command required an integer value but received a fraction.',
  24: 'Two G-code commands requested the same axis word.',
  25: 'A repeated G-code word was found in the block.',
  26: 'A G-code command that requires axis words received none.',
  27: 'The line number value is not within the valid range.',
  28: 'A G-code command is missing a required value word.',
  29: 'The selected work coordinate system is not supported.',
  30: 'G53 requires an absolute positioning mode (G0 or G1).',
  31: 'Axis words were supplied to a command that does not accept them.',
  32: 'An arc command was issued without axis words in the selected plane.',
  33: 'The motion target is invalid.',
  34: 'The arc radius could not produce a valid solution.',
  35: 'An arc command is missing its offset words.',
  36: 'An unused value word remained in the block.',
  37: 'Tool length offset is only valid for the configured axis.',
  38: 'The tool number exceeds the maximum supported value.',
};

/** `ALARM:n` descriptions from the GRBL 1.1 documentation. */
export const GRBL_ALARMS: Record<number, string> = {
  1: 'A hard limit was triggered. The machine position is lost. Re-homing is strongly recommended.',
  2: 'The motion target exceeded the soft limit. The command was refused.',
  3: 'Reset while in motion. The machine position is lost.',
  4: 'Probe failed: the probe was already triggered before the cycle started.',
  5: 'Probe failed: the probe did not contact the workpiece within the travel.',
  6: 'Homing failed. Reset during the active homing cycle.',
  7: 'Homing failed. A safety door was opened during homing.',
  8: 'Homing failed. The limit switch did not clear during pull-off.',
  9: 'Homing failed. The limit switch was not found within the search distance.',
};

/** Presentational note attached to system commands with physical consequences. */
export const COMMAND_NOTES: Record<string, string> = {
  [COMMANDS.home]:
    'Runs the GRBL homing cycle. The machine moves at full speed towards its limit switches.',
  [COMMANDS.unlock]:
    'Clears the alarm lock so motion is accepted again. It does not restore a lost position.',
  [COMMANDS.setWorkZero]:
    'Stores the current position as work zero in coordinate system G54. The machine does not move.',
  [COMMANDS.goToWorkZero]:
    'Travels to work zero at rapid speed in a straight line.',
};

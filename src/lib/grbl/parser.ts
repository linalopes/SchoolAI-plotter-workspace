import { GRBL_ALARMS, GRBL_ERRORS, SETTING_DEFINITIONS } from './commands';
import type {
  GrblMachineState,
  GrblMessage,
  GrblSetting,
  GrblStatus,
  ParserModalState,
  Vec3,
} from './types';
import { parseFirmwareBanner } from './version';

/**
 * Pure GRBL response parsing.
 *
 * No I/O and no state, so every branch is directly testable. The guiding rule
 * is tolerance: unknown fields, reordered fields, missing fields, and
 * unrecognised lines must all be survivable. A controller running unfamiliar
 * firmware should degrade to "unknown message in the console", never to a
 * crash.
 *
 * Status reports exist in two dialects:
 *   GRBL 1.1 — pipe-delimited: `<Idle|MPos:0.000,0.000,0.000|FS:0,0>`
 *   GRBL 0.9 — comma-delimited: `<Idle,MPos:0.000,0.000,0.000,WPos:0.000,0.000,0.000>`
 * Coordinate commas must never be treated as field separators.
 */

const KNOWN_STATES: readonly GrblMachineState[] = [
  'Idle',
  'Run',
  'Hold',
  'Jog',
  'Alarm',
  'Door',
  'Check',
  'Home',
  'Sleep',
];

/** Field keys that may appear in a status report, in either dialect. */
const STATUS_FIELD_KEYS =
  'MPos|WPos|WCO|Buf|Bf|FS|F|Pn|Ov|Ln';

/**
 * Matches a status field and its numeric payload.
 *
 * The value stops at the next alphabetic field key so coordinate commas inside
 * `MPos:0.000,0.000,0.000` are kept with the value rather than splitting fields.
 */
const STATUS_FIELD_PATTERN = new RegExp(
  `\\b(${STATUS_FIELD_KEYS}):((?:-?\\d*\\.?\\d+)(?:,-?\\d*\\.?\\d+)*)`,
  'gi',
);

function parseMachineState(token: string): {
  state: GrblMachineState;
  subState: number | null;
} {
  const [name = '', sub] = token.split(':');
  const match = KNOWN_STATES.find(
    (state) => state.toLowerCase() === name.trim().toLowerCase(),
  );
  const subState = sub !== undefined ? Number.parseInt(sub, 10) : NaN;
  return {
    state: match ?? 'Unknown',
    subState: Number.isFinite(subState) ? subState : null,
  };
}

/** Parses `a,b,c`. Z is optional so two-axis builds still produce a vector. */
function parseVec3(value: string): Vec3 | null {
  const parts = value.split(',').map((n) => Number.parseFloat(n));
  const [x, y, z] = parts;
  if (x === undefined || y === undefined) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, z: z !== undefined && Number.isFinite(z) ? z : 0 };
}

function parseIntOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function emptyStatus(raw: string, state: GrblMachineState, subState: number | null): GrblStatus {
  return {
    state,
    subState,
    mpos: null,
    wpos: null,
    wco: null,
    feed: null,
    spindle: null,
    pins: null,
    plannerBuffer: null,
    rxBuffer: null,
    lineNumber: null,
    overrides: null,
    raw,
    receivedAt: Date.now(),
  };
}

function applyStatusField(status: GrblStatus, key: string, value: string): void {
  switch (key) {
    case 'MPos':
      status.mpos = parseVec3(value);
      break;
    case 'WPos':
      status.wpos = parseVec3(value);
      break;
    case 'WCO':
      status.wco = parseVec3(value);
      break;
    case 'FS': {
      const [feed, spindle] = value.split(',');
      status.feed = parseIntOrNull(feed);
      status.spindle = parseIntOrNull(spindle);
      break;
    }
    case 'F':
      status.feed = parseIntOrNull(value);
      break;
    case 'Bf': {
      const [planner, rx] = value.split(',');
      status.plannerBuffer = parseIntOrNull(planner);
      status.rxBuffer = parseIntOrNull(rx);
      break;
    }
    case 'Buf':
      // GRBL 0.9 reports a single planner buffer count.
      status.plannerBuffer = parseIntOrNull(value);
      break;
    case 'Ln':
      status.lineNumber = parseIntOrNull(value);
      break;
    case 'Pn':
      status.pins = value;
      break;
    case 'Ov': {
      const parts = value.split(',');
      const feed = parseIntOrNull(parts[0]);
      const rapid = parseIntOrNull(parts[1]);
      const spindle = parseIntOrNull(parts[2]);
      if (feed !== null && rapid !== null && spindle !== null) {
        status.overrides = { feed, rapid, spindle };
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Parses a realtime status report in either GRBL 0.9 or 1.1 format.
 *
 * Returns null when the line is not a status report at all.
 */
export function parseStatusReport(line: string): GrblStatus | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return null;

  const body = trimmed.slice(1, -1);
  if (body.length === 0) return null;

  // Pipe-delimited reports are unambiguously GRBL 1.1. Comma-delimited reports
  // are GRBL 0.9. Either way, fields are extracted by key so coordinate commas
  // never become field separators.
  const usesPipes = body.includes('|');
  let stateToken: string;
  let fieldsBody: string;

  if (usesPipes) {
    const fields = body.split('|');
    const first = fields.shift();
    if (first === undefined || first.length === 0) return null;
    stateToken = first;
    fieldsBody = fields.join('|');
  } else {
    // Everything before the first known field key is the machine state.
    STATUS_FIELD_PATTERN.lastIndex = 0;
    const firstField = STATUS_FIELD_PATTERN.exec(body);
    if (!firstField || firstField.index === undefined) {
      const { state, subState } = parseMachineState(body.replace(/,$/, ''));
      return emptyStatus(trimmed, state, subState);
    }
    stateToken = body.slice(0, firstField.index).replace(/,$/, '');
    fieldsBody = body.slice(firstField.index);
  }

  if (stateToken.length === 0) return null;

  const { state, subState } = parseMachineState(stateToken);
  const status = emptyStatus(trimmed, state, subState);

  STATUS_FIELD_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STATUS_FIELD_PATTERN.exec(fieldsBody)) !== null) {
    const key = match[1];
    const value = match[2];
    if (!key || value === undefined) continue;
    applyStatusField(status, key, value);
  }

  return status;
}

/**
 * Derives the missing position vector.
 *
 * GRBL reports either MPos or WPos, never both, and sends the work coordinate
 * offset only occasionally. Given a cached WCO the other vector can be
 * computed, which is what keeps both readouts populated between reports.
 *
 * GRBL 0.9 often reports both MPos and WPos in the same line, in which case
 * both are already present and no derivation is needed.
 */
export function resolvePositions(
  status: GrblStatus,
  cachedWco: Vec3 | null,
): GrblStatus {
  const wco = status.wco ?? cachedWco;
  if (!wco) return status;

  if (status.mpos && !status.wpos) {
    return {
      ...status,
      wco,
      wpos: {
        x: status.mpos.x - wco.x,
        y: status.mpos.y - wco.y,
        z: status.mpos.z - wco.z,
      },
    };
  }
  if (status.wpos && !status.mpos) {
    return {
      ...status,
      wco,
      mpos: {
        x: status.wpos.x + wco.x,
        y: status.wpos.y + wco.y,
        z: status.wpos.z + wco.z,
      },
    };
  }
  return { ...status, wco };
}

export function parseSetting(line: string): GrblSetting | null {
  const match = /^\$(\d+)\s*=\s*(.+)$/.exec(line.trim());
  if (!match?.[1] || match[2] === undefined) return null;
  const key = Number.parseInt(match[1], 10);
  if (!Number.isFinite(key)) return null;
  const definition = SETTING_DEFINITIONS[key];
  return {
    key,
    value: match[2].trim(),
    label: definition?.label ?? null,
    unit: definition?.unit ?? null,
  };
}

/**
 * Parses a `$G` parser-state report such as
 * `[G0 G54 G17 G21 G90 G94 M0 M5 M9 T0 F0. S0.]`.
 */
export function parseParserState(line: string): ParserModalState | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;

  const body = trimmed.slice(1, -1).trim();
  if (body.length === 0) return null;

  // Must look like modal groups, not VER/OPT/MSG feedback.
  if (/^(VER|OPT|MSG|echo|GC):/i.test(body)) return null;

  const tokens = body.match(/[A-Z]-?\d+\.?\d*/gi);
  if (!tokens || tokens.length === 0) return null;

  const upper = tokens.map((token) => token.toUpperCase());
  const hasDistance = upper.some((token) => token === 'G90' || token === 'G91');
  const hasUnits = upper.some((token) => token === 'G20' || token === 'G21');
  // A genuine parser-state report always carries at least one of these.
  if (!hasDistance && !hasUnits) return null;

  return {
    distanceMode: upper.includes('G91') ? 'G91' : upper.includes('G90') ? 'G90' : null,
    units: upper.includes('G20') ? 'G20' : upper.includes('G21') ? 'G21' : null,
    modes: upper,
    raw: trimmed,
  };
}

/**
 * Classifies a single line received from the controller.
 *
 * Blank lines are reported as `unknown` with an empty payload; callers filter
 * them out rather than have the parser silently drop input.
 */
export function parseLine(line: string): GrblMessage {
  const raw = line.trim();

  if (raw === 'ok') return { kind: 'ok' };

  const status = parseStatusReport(raw);
  if (status) return { kind: 'status', status };

  const numericError = /^error:\s*(\d+)$/i.exec(raw);
  if (numericError?.[1]) {
    const code = Number.parseInt(numericError[1], 10);
    return {
      kind: 'error',
      code,
      description: GRBL_ERRORS[code] ?? 'Unrecognised error code.',
      numeric: true,
      raw,
    };
  }

  // GRBL 0.9 textual errors: "error: Bad number format"
  const textError = /^error:\s*(.+)$/i.exec(raw);
  if (textError?.[1]) {
    const description = textError[1].trim();
    return {
      kind: 'error',
      code: -1,
      description,
      numeric: false,
      raw,
    };
  }

  const alarm = /^ALARM:\s*(\d+)$/i.exec(raw);
  if (alarm?.[1]) {
    const code = Number.parseInt(alarm[1], 10);
    return {
      kind: 'alarm',
      code,
      description: GRBL_ALARMS[code] ?? 'Unrecognised alarm code.',
      raw,
    };
  }

  const welcome = /^Grbl\s+(\S+)/i.exec(raw);
  if (welcome?.[1]) {
    return {
      kind: 'welcome',
      version: welcome[1],
      raw,
      identity: parseFirmwareBanner(raw),
    };
  }

  const setting = parseSetting(raw);
  if (setting) return { kind: 'setting', setting, raw };

  if (raw.startsWith('[') && raw.endsWith(']')) {
    const body = raw.slice(1, -1);

    const version = /^VER:([^:]*):?(.*)$/i.exec(body);
    if (version?.[1] !== undefined) {
      const build = version[2]?.trim() ?? '';
      return {
        kind: 'version',
        version: version[1].trim(),
        build: build.length > 0 ? build : null,
        raw,
      };
    }

    const options = /^OPT:(.*)$/i.exec(body);
    if (options?.[1] !== undefined) {
      return { kind: 'options', options: options[1].trim(), raw };
    }

    const message = /^MSG:(.*)$/i.exec(body);
    if (message?.[1] !== undefined) {
      return { kind: 'message', text: message[1].trim(), raw };
    }

    const parserState = parseParserState(raw);
    if (parserState) {
      return { kind: 'parserState', state: parserState, raw };
    }

    return { kind: 'feedback', raw };
  }

  return { kind: 'unknown', raw };
}

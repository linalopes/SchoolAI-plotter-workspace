import { describe, expect, it } from 'vitest';
import { parseLine, parseStatusReport, resolvePositions } from './parser';

/**
 * The parser is the part of the system most exposed to firmware variation, so
 * these tests concentrate on tolerance: missing fields, reordered fields, and
 * output no one anticipated.
 */

describe('parseStatusReport', () => {
  it('parses a minimal Idle report', () => {
    const status = parseStatusReport('<Idle|MPos:0.000,0.000,0.000|FS:0,0>');
    expect(status?.state).toBe('Idle');
    expect(status?.mpos).toEqual({ x: 0, y: 0, z: 0 });
    expect(status?.feed).toBe(0);
  });

  it('parses a Run report using work position', () => {
    const status = parseStatusReport('<Run|WPos:10.000,20.000,0.000|FS:1000,0>');
    expect(status?.state).toBe('Run');
    expect(status?.wpos).toEqual({ x: 10, y: 20, z: 0 });
    expect(status?.feed).toBe(1000);
  });

  it('accepts fields in any order and ignores unknown ones', () => {
    const status = parseStatusReport(
      '<Jog|Ov:100,100,100|Unknown:whatever|WCO:1.000,2.000,0.000|MPos:5.000,6.000,0.000>',
    );
    expect(status?.state).toBe('Jog');
    expect(status?.mpos).toEqual({ x: 5, y: 6, z: 0 });
    expect(status?.wco).toEqual({ x: 1, y: 2, z: 0 });
    expect(status?.overrides).toEqual({ feed: 100, rapid: 100, spindle: 100 });
  });

  it('keeps the raw line and reads a sub-state', () => {
    const raw = '<Hold:0|MPos:1.000,2.000,3.000>';
    const status = parseStatusReport(raw);
    expect(status?.state).toBe('Hold');
    expect(status?.subState).toBe(0);
    expect(status?.raw).toBe(raw);
  });

  it('reports an unfamiliar state as Unknown rather than failing', () => {
    const status = parseStatusReport('<Fluctuating|MPos:0.000,0.000,0.000>');
    expect(status?.state).toBe('Unknown');
  });

  it('survives malformed and truncated reports', () => {
    expect(parseStatusReport('<>')).toBeNull();
    expect(parseStatusReport('not a report')).toBeNull();
    expect(parseStatusReport('<Idle|MPos:garbage>')?.mpos).toBeNull();
    expect(parseStatusReport('<Idle|FS:>')?.feed).toBeNull();
  });

  it('handles a two-axis position without a Z value', () => {
    expect(parseStatusReport('<Idle|MPos:3.000,4.000>')?.mpos).toEqual({
      x: 3,
      y: 4,
      z: 0,
    });
  });
});

describe('resolvePositions', () => {
  it('derives work position from machine position and a cached offset', () => {
    const status = parseStatusReport('<Idle|MPos:10.000,10.000,0.000>');
    expect(status).not.toBeNull();
    const resolved = resolvePositions(status!, { x: 4, y: 3, z: 0 });
    expect(resolved.wpos).toEqual({ x: 6, y: 7, z: 0 });
  });

  it('derives machine position from work position', () => {
    const status = parseStatusReport('<Idle|WPos:6.000,7.000,0.000>');
    const resolved = resolvePositions(status!, { x: 4, y: 3, z: 0 });
    expect(resolved.mpos).toEqual({ x: 10, y: 10, z: 0 });
  });

  it('leaves the status untouched when no offset is known', () => {
    const status = parseStatusReport('<Idle|MPos:10.000,10.000,0.000>');
    expect(resolvePositions(status!, null).wpos).toBeNull();
  });
});

describe('parseLine', () => {
  it('recognises ok', () => {
    expect(parseLine('ok')).toEqual({ kind: 'ok' });
  });

  it('recognises errors with a description', () => {
    const message = parseLine('error:20');
    expect(message.kind).toBe('error');
    if (message.kind !== 'error') throw new Error('expected an error message');
    expect(message.code).toBe(20);
    expect(message.description).toMatch(/unsupported/i);
  });

  it('describes an unknown error code without failing', () => {
    const message = parseLine('error:999');
    if (message.kind !== 'error') throw new Error('expected an error message');
    expect(message.code).toBe(999);
    expect(message.numeric).toBe(true);
    expect(message.description).toMatch(/unrecognised/i);
  });

  it('parses textual GRBL 0.9 errors once', () => {
    const message = parseLine('error: Bad number format');
    if (message.kind !== 'error') throw new Error('expected an error message');
    expect(message.numeric).toBe(false);
    expect(message.description).toBe('Bad number format');
    expect(message.raw).toBe('error: Bad number format');
  });

  it('parses a GRBL 0.9 status report', () => {
    const status = parseStatusReport(
      '<Idle,MPos:0.000,0.000,0.000,WPos:0.000,0.000,0.000>',
    );
    expect(status?.state).toBe('Idle');
    expect(status?.mpos).toEqual({ x: 0, y: 0, z: 0 });
    expect(status?.wpos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('recognises alarms', () => {
    const message = parseLine('ALARM:1');
    if (message.kind !== 'alarm') throw new Error('expected an alarm message');
    expect(message.code).toBe(1);
    expect(message.description).toMatch(/hard limit/i);
  });

  it('recognises the startup banner', () => {
    const message = parseLine("Grbl 1.1h ['$' for help]");
    if (message.kind !== 'welcome') throw new Error('expected a welcome message');
    expect(message.version).toBe('1.1h');
  });

  it('parses build information and options', () => {
    const version = parseLine('[VER:1.1h.20190825:]');
    if (version.kind !== 'version') throw new Error('expected a version message');
    expect(version.version).toBe('1.1h.20190825');

    const options = parseLine('[OPT:V,15,128]');
    if (options.kind !== 'options') throw new Error('expected an options message');
    expect(options.options).toBe('V,15,128');
  });

  it('parses settings with their documented labels', () => {
    const message = parseLine('$100=80.000');
    if (message.kind !== 'setting') throw new Error('expected a setting message');
    expect(message.setting.key).toBe(100);
    expect(message.setting.value).toBe('80.000');
    expect(message.setting.label).toBe('X steps/mm');
  });

  it('parses an undocumented setting key without a label', () => {
    const message = parseLine('$999=1');
    if (message.kind !== 'setting') throw new Error('expected a setting message');
    expect(message.setting.label).toBeNull();
  });

  it('falls back to unknown for unrecognised output', () => {
    expect(parseLine('something unexpected').kind).toBe('unknown');
  });
});

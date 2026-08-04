import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from './defaults';
import { parseProfileImport, sanitizeProfile, sanitizeStoredProfiles } from './validation';

/**
 * Profiles come from LocalStorage and from files the user picked. Both are
 * untrusted input, so the sanitiser is treated as a security boundary rather
 * than a convenience.
 */

describe('sanitizeProfile', () => {
  it('keeps valid values', () => {
    const source = createDefaultProfile('Test Machine');
    const result = sanitizeProfile(source);
    expect(result.name).toBe('Test Machine');
    expect(result.connection.baudRate).toBe(115200);
    expect(result.workspace.widthMm).toBe(297);
  });

  it('falls back to defaults for a non-object', () => {
    expect(sanitizeProfile(null).name).toBe('XY Plotter');
    expect(sanitizeProfile('nonsense').workspace.heightMm).toBe(210);
  });

  it('rejects an unsupported baud rate', () => {
    const result = sanitizeProfile({ connection: { baudRate: 12345 } });
    expect(result.connection.baudRate).toBe(115200);
  });

  it('clamps out-of-range numbers', () => {
    const result = sanitizeProfile({
      workspace: { widthMm: -50, heightMm: 999999 },
      motion: { jogFeedRateMmPerMin: 1e9 },
      connection: { statusPollIntervalMs: 1 },
    });
    expect(result.workspace.widthMm).toBe(1);
    expect(result.workspace.heightMm).toBe(10000);
    expect(result.motion.jogFeedRateMmPerMin).toBe(20000);
    expect(result.connection.statusPollIntervalMs).toBe(100);
    expect(result.connection.motionIdleTimeoutMs).toBe(30_000);
  });

  it('strips newlines so one field cannot smuggle a second command', () => {
    const result = sanitizeProfile({ pen: { upCommand: 'M5\nG0 X100 Y100' } });
    expect(result.pen.upCommand).not.toContain('\n');
    expect(result.pen.upCommand).toBe('M5 G0 X100 Y100');
  });

  it('discards unknown keys', () => {
    const result = sanitizeProfile({
      name: 'Machine',
      malicious: '<script>alert(1)</script>',
      connection: { baudRate: 9600, extra: true },
    });
    expect(result).not.toHaveProperty('malicious');
    expect(result.connection).not.toHaveProperty('extra');
    expect(result.connection.baudRate).toBe(9600);
  });

  it('never inherits the pen safety acknowledgement', () => {
    const result = sanitizeProfile({ pen: { safetyAcknowledged: true } });
    expect(result.pen.safetyAcknowledged).toBe(false);
  });

  it('assigns a new id when the caller asks for one', () => {
    const source = createDefaultProfile();
    expect(sanitizeProfile(source, false).id).not.toBe(source.id);
    expect(sanitizeProfile(source, true).id).toBe(source.id);
  });
});

describe('sanitizeStoredProfiles', () => {
  it('always yields at least one profile', () => {
    expect(sanitizeStoredProfiles(null)).toHaveLength(1);
    expect(sanitizeStoredProfiles({ version: 1, profiles: [] })).toHaveLength(1);
  });

  it('repairs partially corrupted entries', () => {
    const profiles = sanitizeStoredProfiles({
      version: 1,
      profiles: [{ name: 'Broken', workspace: 'not an object' }],
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.name).toBe('Broken');
    expect(profiles[0]?.workspace.widthMm).toBe(297);
  });
});

describe('parseProfileImport', () => {
  it('imports a valid profile', () => {
    const json = JSON.stringify(createDefaultProfile('Imported'));
    const result = parseProfileImport(json);
    expect(result.ok).toBe(true);
    expect(result.profile?.name).toBe('Imported');
  });

  it('rejects invalid JSON', () => {
    const result = parseProfileImport('{ not json');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid JSON/i);
  });

  it('rejects JSON that is not a profile', () => {
    expect(parseProfileImport('[1,2,3]').ok).toBe(false);
    expect(parseProfileImport('{"unrelated":true}').ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseFirmwareBanner,
  resolveProtocol,
} from './version';

describe('parseFirmwareBanner', () => {
  it('disables $J= support for Grbl 0.9i', () => {
    const identity = parseFirmwareBanner("Grbl 0.9i ['$' for help]");
    expect(identity.family).toBe('grbl');
    expect(identity.versionLabel).toBe('0.9i');
    expect(identity.major).toBe(0);
    expect(identity.minor).toBe(9);
    expect(identity.capabilities.supportsJogCommand).toBe(false);
    expect(identity.rawBanner).toBe("Grbl 0.9i ['$' for help]");
  });

  it('enables $J= support for Grbl 1.1h', () => {
    const identity = parseFirmwareBanner("Grbl 1.1h ['$' for help]");
    expect(identity.versionLabel).toBe('1.1h');
    expect(identity.major).toBe(1);
    expect(identity.minor).toBe(1);
    expect(identity.capabilities.supportsJogCommand).toBe(true);
  });

  it('does not treat the word Grbl alone as a capability source', () => {
    const identity = parseFirmwareBanner('Grbl');
    expect(identity.family).toBe('unknown');
    expect(identity.capabilities.supportsJogCommand).toBe(false);
  });
});

describe('resolveProtocol', () => {
  const nine = parseFirmwareBanner("Grbl 0.9i ['$' for help]");
  const eleven = parseFirmwareBanner("Grbl 1.1h ['$' for help]");

  it('uses Auto detection from the banner', () => {
    expect(resolveProtocol(nine, 'auto').effectiveProtocol).toBe('grbl-0.9');
    expect(resolveProtocol(nine, 'auto').capabilities.supportsJogCommand).toBe(
      false,
    );
    expect(resolveProtocol(eleven, 'auto').effectiveProtocol).toBe('grbl-1.1');
    expect(
      resolveProtocol(eleven, 'auto').capabilities.supportsJogCommand,
    ).toBe(true);
  });

  it('honours profile overrides over the banner', () => {
    expect(resolveProtocol(nine, 'grbl-1.1').capabilities.supportsJogCommand).toBe(
      true,
    );
    expect(
      resolveProtocol(eleven, 'grbl-0.9').capabilities.supportsJogCommand,
    ).toBe(false);
  });
});

import { BaseTransport } from './transport';
import {
  TransportError,
  type Transport,
  type TransportHandlers,
  type TransportOpenOptions,
} from './types';

/**
 * A GRBL simulator behind the transport interface.
 *
 * Demo mode exists so the whole interface — connection, jogging, pen tests,
 * console, status polling — can be exercised without hardware. It speaks the
 * same line protocol as a real controller, including realistic latency and the
 * habit of omitting `WCO` from most status reports, so the parser is genuinely
 * tested rather than fed idealised input.
 *
 * Tests can construct a GRBL 0.9 dialect with `{ firmwareVersion: '0.9i' }`.
 */

export type MockFirmwareVersion = '0.9i' | '1.1h';

export interface MockSerialOptions {
  firmwareVersion?: MockFirmwareVersion;
  /** Override individual `$$` values, e.g. `{ 22: '1' }` to enable homing. */
  settingOverrides?: Record<number, string>;
}

/** A plausible `$$` dump. Values are invented, not read from any machine. */
const DEFAULT_SETTINGS: ReadonlyArray<[number, string]> = [
  [0, '10'],
  [1, '25'],
  [10, '1'],
  [11, '0.010'],
  [12, '0.002'],
  [20, '0'],
  [21, '0'],
  [22, '0'],
  [100, '80.000'],
  [101, '80.000'],
  [102, '80.000'],
  [110, '5000.000'],
  [111, '5000.000'],
  [112, '500.000'],
  [120, '200.000'],
  [121, '200.000'],
  [122, '10.000'],
  [130, '310.000'],
  [131, '210.000'],
  [132, '10.000'],
];

type MockState = 'Idle' | 'Run' | 'Jog' | 'Hold' | 'Alarm' | 'Home';

interface Vec2 {
  x: number;
  y: number;
}

const MOTION_TICK_MS = 40;

export class MockSerialTransport extends BaseTransport implements Transport {
  readonly kind = 'demo' as const;

  #firmwareVersion: MockFirmwareVersion;
  #settings: Map<number, string>;
  #machineState: MockState = 'Idle';
  #position: Vec2 = { x: 0, y: 0 };
  #target: Vec2 = { x: 0, y: 0 };
  /** Work coordinate offset, as changed by `G10 L20`. */
  #wco: Vec2 = { x: 0, y: 0 };
  #feedRate = 1000;
  #currentFeed = 0;
  #motionTimer: ReturnType<typeof setInterval> | null = null;
  /** Resolved when the in-flight motion finishes, so `ok` arrives after it. */
  #motionDone: (() => void) | null = null;
  #reportCounter = 0;
  #incremental = false;
  #unitsMm = true;
  #timeouts = new Set<ReturnType<typeof setTimeout>>();
  #disposed = false;

  constructor(handlers: TransportHandlers, options: MockSerialOptions = {}) {
    super(handlers);
    this.#firmwareVersion = options.firmwareVersion ?? '1.1h';
    this.#settings = new Map(DEFAULT_SETTINGS);
    if (options.settingOverrides) {
      for (const [key, value] of Object.entries(options.settingOverrides)) {
        this.#settings.set(Number(key), value);
      }
    }
  }

  get firmwareVersion(): MockFirmwareVersion {
    return this.#firmwareVersion;
  }

  get isLegacy(): boolean {
    return this.#firmwareVersion.startsWith('0.9');
  }

  hasPort(): boolean {
    // No port selection step exists in the simulator.
    return true;
  }

  async selectPort(): Promise<boolean> {
    return true;
  }

  async open(_options: TransportOpenOptions): Promise<void> {
    if (this.getState() !== 'disconnected') return;
    this.#disposed = false;
    this.setState('connecting');
    this.notice('Demo connection starting. No physical machine is involved.');

    // Mirrors the pause a real Arduino takes to reset before it speaks.
    await this.#sleep(220);
    if (this.#disposed) return;

    this.setState('connected');
    this.#emitBanner();
  }

  #emitBanner(): void {
    this.#later(60, () => {
      this.#emit('');
      this.#emit(`Grbl ${this.#firmwareVersion} ['$' for help]`);
    });
  }

  async write(text: string): Promise<void> {
    if (this.getState() !== 'connected') {
      throw new TransportError(
        'not-connected',
        'Cannot send data while the demo connection is closed.',
      );
    }
    // A single write may legitimately carry its terminator only.
    for (const line of text.split(/\r\n|\n|\r/)) {
      const command = line.trim();
      if (command.length > 0) this.#handleCommand(command);
    }
  }

  async writeBytes(bytes: Uint8Array): Promise<void> {
    if (this.getState() !== 'connected') {
      throw new TransportError(
        'not-connected',
        'Cannot send data while the demo connection is closed.',
      );
    }
    for (const byte of bytes) {
      if (this.#handleRealtimeByte(byte)) continue;
      // Anything that is not a realtime byte is ordinary text.
      await this.write(new TextDecoder().decode(Uint8Array.of(byte)));
    }
  }

  /** Returns true when the byte was consumed as a realtime command. */
  #handleRealtimeByte(byte: number): boolean {
    switch (byte) {
      case 0x3f: // ?
        this.#emitStatus();
        return true;
      case 0x21: // !
        if (this.#machineState === 'Run' || this.#machineState === 'Jog') {
          this.#machineState = 'Hold';
          this.#stopMotion();
        }
        return true;
      case 0x7e: // ~
        if (this.#machineState === 'Hold') {
          this.#machineState = 'Idle';
        }
        return true;
      case 0x18: // Ctrl-X, soft reset
        this.#stopMotion();
        this.#machineState = 'Idle';
        this.#currentFeed = 0;
        this.#emitBanner();
        return true;
      default:
        return false;
    }
  }

  #handleCommand(command: string): void {
    // Realtime characters can also arrive inside a text write.
    if (command.length === 1 && this.#handleRealtimeByte(command.charCodeAt(0))) {
      return;
    }

    const upper = command.toUpperCase();

    if (this.#machineState === 'Alarm' && upper !== '$X' && upper !== '$H') {
      this.#respond('error:9');
      return;
    }

    if (upper === '$I') {
      if (this.isLegacy) {
        // GRBL 0.9 build info is thinner than 1.1's [VER:]/[OPT:] pair.
        this.#respondLines([`[0.9i.20150625:]`, 'ok']);
      } else {
        this.#respondLines([
          `[VER:${this.#firmwareVersion}.20190825:]`,
          '[OPT:V,15,128]',
          'ok',
        ]);
      }
      return;
    }

    if (upper === '$$') {
      this.#respondLines([
        ...[...this.#settings.entries()]
          .sort(([a], [b]) => a - b)
          .map(([key, value]) => `$${key}=${value}`),
        'ok',
      ]);
      return;
    }

    if (upper === '$G') {
      const distance = this.#incremental ? 'G91' : 'G90';
      const units = this.#unitsMm ? 'G21' : 'G20';
      this.#respondLines([
        `[G0 G54 G17 ${units} ${distance} G94 M0 M5 M9 T0 F0. S0.]`,
        'ok',
      ]);
      return;
    }

    if (upper === '$X') {
      this.#machineState = 'Idle';
      this.#respondLines(['[MSG:Caution: Unlocked]', 'ok']);
      return;
    }

    if (upper === '$H') {
      if (this.#settings.get(22) === '0') {
        this.#respond(this.isLegacy ? 'error: Homing not enabled' : 'error:5');
        return;
      }
      this.#runHoming();
      return;
    }

    if (upper.startsWith('$J=')) {
      if (this.isLegacy) {
        // Matches the textual error the physical 0.9i controller returns.
        this.#respond('error: Bad number format');
        return;
      }
      this.#runJog(upper.slice(3));
      return;
    }

    if (upper.startsWith('$')) {
      // Unsupported system command, matching GRBL's invalid-statement error.
      this.#respond(this.isLegacy ? 'error: Invalid statement' : 'error:3');
      return;
    }

    if (upper.startsWith('G10')) {
      this.#applyWorkZero(upper);
      return;
    }

    if (upper.includes('G90')) this.#incremental = false;
    if (upper.includes('G91')) this.#incremental = true;
    if (/\bG21\b/.test(upper)) this.#unitsMm = true;
    if (/\bG20\b/.test(upper)) this.#unitsMm = false;

    // Pure modal commands do not move.
    if (/^(G90|G91|G20|G21)(\s+G(90|91|20|21))*$/.test(upper)) {
      this.#respond('ok');
      return;
    }

    if (/G0?[01]\b/.test(upper) || /[XY]-?\d/.test(upper)) {
      this.#runMove(upper);
      return;
    }

    // Spindle / servo pen commands are synchronized with motion on real GRBL:
    // if the planner is still draining, defer `ok` until Idle.
    if (/^M[345]\b/.test(upper)) {
      if (this.#motionTimer != null && this.#motionDone) {
        const prior = this.#motionDone;
        this.#motionDone = () => {
          prior();
          this.#respond('ok');
        };
        return;
      }
      this.#respond('ok');
      return;
    }

    // Anything else the simulator does not model is simply acknowledged.
    this.#respond('ok');
  }

  #applyWorkZero(command: string): void {
    const x = this.#axisValue(command, 'X');
    const y = this.#axisValue(command, 'Y');
    if (x !== null) this.#wco.x = this.#position.x - x;
    if (y !== null) this.#wco.y = this.#position.y - y;
    this.#respond('ok');
  }

  #axisValue(command: string, axis: 'X' | 'Y' | 'F'): number | null {
    const match = new RegExp(`${axis}(-?\\d*\\.?\\d+)`).exec(command);
    if (!match?.[1]) return null;
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  #runJog(body: string): void {
    const relative = body.includes('G91');
    const feed = this.#axisValue(body, 'F');
    if (feed !== null) this.#feedRate = feed;

    const dx = this.#axisValue(body, 'X');
    const dy = this.#axisValue(body, 'Y');

    const target: Vec2 = {
      x: relative
        ? this.#position.x + (dx ?? 0)
        : dx !== null
          ? dx + this.#wco.x
          : this.#position.x,
      y: relative
        ? this.#position.y + (dy ?? 0)
        : dy !== null
          ? dy + this.#wco.y
          : this.#position.y,
    };

    this.#startMotion(target, 'Jog');
  }

  #runMove(command: string): void {
    const x = this.#axisValue(command, 'X');
    const y = this.#axisValue(command, 'Y');
    const feed = this.#axisValue(command, 'F');
    if (feed !== null) this.#feedRate = feed;

    const rapid = /G0?0\b/.test(command);
    const target: Vec2 = {
      x:
        x === null
          ? this.#position.x
          : this.#incremental
            ? this.#position.x + x
            : x + this.#wco.x,
      y:
        y === null
          ? this.#position.y
          : this.#incremental
            ? this.#position.y + y
            : y + this.#wco.y,
    };

    // Ordinary G0/G1: acknowledge as soon as the planner accepts the block,
    // matching real GRBL so legacy jogging can wait for Idle after `ok`.
    this.#startMotion(target, 'Run', rapid ? 3000 : this.#feedRate, undefined, true);
  }

  #runHoming(): void {
    this.#machineState = 'Home';
    this.#startMotion({ x: 0, y: 0 }, 'Home', 2000, () => {
      this.#wco = { x: 0, y: 0 };
    });
  }

  #startMotion(
    target: Vec2,
    state: MockState,
    feedOverride?: number,
    onArrive?: () => void,
    /** When true, `ok` is emitted as soon as motion starts (planner accept). */
    acknowledgeImmediately = false,
  ): void {
    this.#stopMotion();
    this.#target = target;
    this.#machineState = state;
    const feed = feedOverride ?? this.#feedRate;
    this.#currentFeed = feed;

    const mmPerTick = (feed / 60) * (MOTION_TICK_MS / 1000);

    const finish = () => {
      this.#stopMotion();
      this.#position = { ...this.#target };
      this.#currentFeed = 0;
      if (this.#machineState !== 'Alarm') this.#machineState = 'Idle';
      onArrive?.();
      if (!acknowledgeImmediately) this.#respond('ok');
    };

    // Zero-distance moves still have to answer with ok.
    const distance = Math.hypot(
      target.x - this.#position.x,
      target.y - this.#position.y,
    );
    if (distance < 1e-6 || mmPerTick <= 0) {
      if (acknowledgeImmediately) this.#respond('ok');
      this.#later(20, finish);
      return;
    }

    if (acknowledgeImmediately) this.#respond('ok');

    this.#motionDone = finish;
    this.#motionTimer = setInterval(() => {
      if (this.#machineState === 'Hold') return;
      const remainingX = this.#target.x - this.#position.x;
      const remainingY = this.#target.y - this.#position.y;
      const remaining = Math.hypot(remainingX, remainingY);
      if (remaining <= mmPerTick) {
        this.#motionDone?.();
        return;
      }
      const ratio = mmPerTick / remaining;
      this.#position = {
        x: this.#position.x + remainingX * ratio,
        y: this.#position.y + remainingY * ratio,
      };
    }, MOTION_TICK_MS);
  }

  #stopMotion(): void {
    if (this.#motionTimer !== null) {
      clearInterval(this.#motionTimer);
      this.#motionTimer = null;
    }
    this.#motionDone = null;
  }

  #emitStatus(): void {
    this.#reportCounter += 1;
    const fixed = (n: number) => n.toFixed(3);
    const mpos = `MPos:${fixed(this.#position.x)},${fixed(this.#position.y)},0.000`;
    const wpos = `WPos:${fixed(this.#position.x - this.#wco.x)},${fixed(this.#position.y - this.#wco.y)},0.000`;

    if (this.isLegacy) {
      // GRBL 0.9: comma-delimited fields, both positions in one report.
      this.#emit(`<${this.#machineState},${mpos},${wpos}>`);
      return;
    }

    const parts = [
      this.#machineState,
      mpos,
      `FS:${Math.round(this.#currentFeed)},0`,
    ];
    // Real GRBL 1.1 sends WCO only occasionally; the client must cache it.
    if (this.#reportCounter % 10 === 1) {
      parts.push(`WCO:${fixed(this.#wco.x)},${fixed(this.#wco.y)},0.000`);
    }
    this.#emit(`<${parts.join('|')}>`);
  }

  /** Answers after a short delay so the interface sees real asynchrony. */
  #respond(line: string): void {
    this.#respondLines([line]);
  }

  #respondLines(lines: string[]): void {
    this.#later(25, () => {
      for (const line of lines) this.#emit(line);
    });
  }

  #emit(line: string): void {
    if (this.getState() !== 'connected') return;
    this.handlers.onLine(line);
  }

  #later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.#timeouts.delete(id);
      if (!this.#disposed) fn();
    }, ms);
    this.#timeouts.add(id);
  }

  #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.#later(ms, resolve);
    });
  }

  async close(): Promise<void> {
    if (this.getState() === 'disconnected') return;
    this.setState('closing');
    this.#cleanup();
    this.setState('disconnected');
    this.notice('Demo connection closed.');
  }

  #cleanup(): void {
    this.#stopMotion();
    for (const id of this.#timeouts) clearTimeout(id);
    this.#timeouts.clear();
    this.#machineState = 'Idle';
    this.#currentFeed = 0;
    this.#reportCounter = 0;
    this.#incremental = false;
    this.#unitsMm = true;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.close();
  }
}

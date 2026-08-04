import { BaseTransport, LineBuffer, detectSerialEnvironment } from './transport';
import {
  TransportError,
  type Transport,
  type TransportHandlers,
  type TransportOpenOptions,
} from './types';

/**
 * Web Serial implementation of the transport interface.
 *
 * Resource ownership is the delicate part: the browser refuses to close a port
 * whose streams are still locked, and a reader left running after a failure
 * keeps the device unavailable until the tab is reloaded. Every exit path
 * therefore funnels through `releaseResources`.
 */
export class WebSerialTransport extends BaseTransport implements Transport {
  readonly kind = 'web-serial' as const;

  #port: SerialPort | null = null;
  #reader: ReadableStreamDefaultReader<string> | null = null;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  /** Resolves when the decoder pipeline finishes, successfully or not. */
  #pipeClosed: Promise<void> | null = null;
  #lineBuffer = new LineBuffer();
  #encoder = new TextEncoder();
  #intentionalClose = false;
  #onDeviceDisconnect: ((event: Event) => void) | null = null;

  constructor(handlers: TransportHandlers) {
    super(handlers);
  }

  hasPort(): boolean {
    return this.#port !== null;
  }

  /** Human-readable identity of the chosen port, when the browser exposes it. */
  describePort(): string | null {
    if (!this.#port) return null;
    const info = this.#port.getInfo();
    const vendor = info.usbVendorId;
    const product = info.usbProductId;
    if (vendor === undefined) return 'Serial port';
    const hex = (n: number) => n.toString(16).padStart(4, '0');
    return product === undefined
      ? `USB device ${hex(vendor)}`
      : `USB device ${hex(vendor)}:${hex(product)}`;
  }

  async selectPort(): Promise<boolean> {
    const env = detectSerialEnvironment();
    if (!env.supported) {
      throw new TransportError(
        'unsupported',
        'This browser does not provide the Web Serial API. Use desktop Google Chrome.',
      );
    }
    if (!env.secureContext) {
      throw new TransportError(
        'insecure-context',
        'Serial access requires a secure context. Open the application over HTTPS or on localhost.',
      );
    }

    try {
      // Must be called synchronously enough after a user gesture that Chrome
      // still considers the gesture active.
      this.#port = await navigator.serial.requestPort();
      this.notice(`Serial port selected: ${this.describePort() ?? 'unknown device'}`);
      return true;
    } catch (error) {
      // Chrome throws NotFoundError when the picker is dismissed without a
      // choice. That is a normal user decision, not a failure to report loudly.
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new TransportError(
          'cancelled',
          'No serial port was selected.',
          { cause: error, benign: true },
        );
      }
      throw new TransportError(
        'open-failed',
        'The browser could not open the serial port picker.',
        { cause: error },
      );
    }
  }

  async open(options: TransportOpenOptions): Promise<void> {
    if (!this.#port) {
      throw new TransportError(
        'no-port',
        'Choose a serial port before connecting.',
      );
    }
    if (this.getState() === 'connected' || this.getState() === 'connecting') {
      return;
    }

    this.#intentionalClose = false;
    this.setState('connecting');

    try {
      await this.#port.open({ baudRate: options.baudRate });
    } catch (error) {
      this.setState('disconnected');
      throw this.#describeOpenFailure(error);
    }

    if (!this.#port.readable || !this.#port.writable) {
      await this.#releaseResources();
      this.setState('disconnected');
      throw new TransportError(
        'open-failed',
        'The serial port opened without readable and writable streams.',
      );
    }

    try {
      const decoder = new TextDecoderStream();
      // TextDecoderStream is typed as accepting BufferSource while the port
      // produces Uint8Array, and WritableStream is invariant in its type
      // parameter. The runtime pairing is exactly what the API is designed for.
      const decoderInput = decoder.writable as unknown as WritableStream<Uint8Array>;
      // The pipe rejects when the device vanishes mid-stream; that rejection is
      // handled by the read loop, so it is swallowed here to avoid an
      // unhandled promise rejection.
      this.#pipeClosed = this.#port.readable
        .pipeTo(decoderInput)
        .catch(() => undefined);
      this.#reader = decoder.readable.getReader();
      this.#writer = this.#port.writable.getWriter();
    } catch (error) {
      await this.#releaseResources();
      this.setState('disconnected');
      throw new TransportError(
        'open-failed',
        'The serial streams could not be established.',
        { cause: error },
      );
    }

    this.#lineBuffer.reset();
    this.#watchForDeviceRemoval();
    this.setState('connected');
    this.notice(
      `Serial port open at ${options.baudRate} baud (${this.describePort() ?? 'serial device'}).`,
    );

    // Deliberately not awaited: the read loop runs for the life of the
    // connection.
    void this.#readLoop();
  }

  #describeOpenFailure(error: unknown): TransportError {
    if (error instanceof DOMException) {
      if (error.name === 'InvalidStateError') {
        return new TransportError(
          'port-busy',
          'The serial port is already open in this page.',
          { cause: error },
        );
      }
      if (error.name === 'NetworkError') {
        return new TransportError(
          'port-busy',
          'The serial port is in use by another application. Close UGS or any other program holding the port and try again.',
          { cause: error },
        );
      }
    }
    return new TransportError(
      'open-failed',
      'The serial port could not be opened. Check the cable and the selected baud rate.',
      { cause: error },
    );
  }

  /** Chrome fires this when the USB device is physically unplugged. */
  #watchForDeviceRemoval(): void {
    if (this.#onDeviceDisconnect) return;
    this.#onDeviceDisconnect = (event: Event) => {
      const target = (event as unknown as { target?: SerialPort }).target;
      if (target && target !== this.#port) return;
      this.handlers.onError(
        new TransportError('device-lost', 'The serial device was disconnected.'),
      );
      void this.close();
    };
    navigator.serial.addEventListener('disconnect', this.#onDeviceDisconnect);
  }

  async #readLoop(): Promise<void> {
    const reader = this.#reader;
    if (!reader) return;

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value === undefined) continue;
        for (const line of this.#lineBuffer.push(value)) {
          this.handlers.onLine(line);
        }
      }
      for (const line of this.#lineBuffer.flush()) {
        this.handlers.onLine(line);
      }
    } catch (error) {
      if (!this.#intentionalClose) {
        this.handlers.onError(
          new TransportError(
            'read-failed',
            'Reading from the serial port failed. The device may have been unplugged.',
            { cause: error },
          ),
        );
      }
    } finally {
      // An ended read loop always means the connection is over, whether the
      // user asked for it or the device went away.
      if (!this.#intentionalClose && this.getState() === 'connected') {
        await this.close();
      }
    }
  }

  async write(text: string): Promise<void> {
    await this.writeBytes(this.#encoder.encode(text));
  }

  async writeBytes(bytes: Uint8Array): Promise<void> {
    if (this.getState() !== 'connected' || !this.#writer) {
      throw new TransportError(
        'not-connected',
        'Cannot send data while the machine is disconnected.',
      );
    }
    try {
      await this.#writer.write(bytes);
    } catch (error) {
      const failure = new TransportError(
        'write-failed',
        'Writing to the serial port failed.',
        { cause: error },
      );
      this.handlers.onError(failure);
      await this.close();
      throw failure;
    }
  }

  async close(): Promise<void> {
    if (this.getState() === 'disconnected' || this.getState() === 'closing') {
      return;
    }
    this.#intentionalClose = true;
    this.setState('closing');
    await this.#releaseResources();
    this.setState('disconnected');
    this.notice('Serial port closed.');
  }

  /**
   * Unwinds reader, writer, pipeline, and port in the only order the browser
   * accepts. Each step is independently guarded so one failure cannot strand
   * the remaining resources.
   */
  async #releaseResources(): Promise<void> {
    if (this.#onDeviceDisconnect) {
      navigator.serial.removeEventListener('disconnect', this.#onDeviceDisconnect);
      this.#onDeviceDisconnect = null;
    }

    if (this.#reader) {
      try {
        await this.#reader.cancel();
      } catch {
        // Already errored or closed.
      }
      try {
        this.#reader.releaseLock();
      } catch {
        // Cancel usually releases the lock; releasing twice is harmless.
      }
      this.#reader = null;
    }

    if (this.#pipeClosed) {
      try {
        await this.#pipeClosed;
      } catch {
        // Rejection already handled where the pipe was created.
      }
      this.#pipeClosed = null;
    }

    if (this.#writer) {
      try {
        this.#writer.releaseLock();
      } catch {
        // The stream may already be errored.
      }
      this.#writer = null;
    }

    if (this.#port) {
      try {
        await this.#port.close();
      } catch {
        // A port whose device vanished cannot always be closed cleanly. The
        // reference is dropped below either way so no stale handle survives.
      }
    }

    this.#lineBuffer.reset();
  }

  async dispose(): Promise<void> {
    await this.close();
    this.#port = null;
  }
}

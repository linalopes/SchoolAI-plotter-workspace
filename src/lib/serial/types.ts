/** Shared vocabulary for every serial transport implementation. */

export type TransportKind = 'web-serial' | 'demo';

export type TransportState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'closing';

export type TransportErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'cancelled'
  | 'no-port'
  | 'port-busy'
  | 'open-failed'
  | 'read-failed'
  | 'write-failed'
  | 'device-lost'
  | 'not-connected';

/**
 * A transport failure with a stable code and a message written for the person
 * standing in front of the machine, not for a log file.
 */
export class TransportError extends Error {
  readonly code: TransportErrorCode;
  /** Cancelling the browser picker is a normal outcome, not a fault. */
  readonly benign: boolean;

  constructor(
    code: TransportErrorCode,
    message: string,
    options?: { cause?: unknown; benign?: boolean },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'TransportError';
    this.code = code;
    this.benign = options?.benign ?? false;
  }
}

export interface TransportOpenOptions {
  baudRate: number;
}

export interface TransportHandlers {
  /** One complete line, already stripped of its terminator. */
  onLine: (line: string) => void;
  onStateChange: (state: TransportState) => void;
  onError: (error: TransportError) => void;
  /** Free-form notices worth showing in the console (port opened, reset, …). */
  onNotice?: (message: string) => void;
}

/**
 * The single abstraction the GRBL client talks to.
 *
 * Web Serial and Demo mode both implement it, so nothing above this layer needs
 * to know whether a physical machine is attached.
 */
export interface Transport {
  readonly kind: TransportKind;

  getState(): TransportState;

  /** True once a port has been chosen and is ready to open. */
  hasPort(): boolean;

  /**
   * Opens the browser's port picker. Must only ever be called from a user
   * gesture. Resolves false when the user dismisses the picker.
   */
  selectPort(): Promise<boolean>;

  open(options: TransportOpenOptions): Promise<void>;

  close(): Promise<void>;

  /** Writes text exactly as given. Callers supply their own line ending. */
  write(text: string): Promise<void>;

  /** Writes raw bytes, used for realtime control characters such as 0x18. */
  writeBytes(bytes: Uint8Array): Promise<void>;

  /** Releases every resource. Safe to call more than once. */
  dispose(): Promise<void>;
}

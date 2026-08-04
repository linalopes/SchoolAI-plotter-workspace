import type { TransportHandlers, TransportState } from './types';

/**
 * Shared transport plumbing: line assembly, handler dispatch, and environment
 * detection. Kept separate from any concrete transport so the Web Serial and
 * Demo implementations stay small.
 */

/**
 * Accumulates streamed text and emits complete lines.
 *
 * Serial data arrives in arbitrary chunks: a single GRBL response may be split
 * across reads, and several responses may share one read. All three terminator
 * conventions are normalised, and a lone trailing `\r` is held back in case the
 * matching `\n` is at the head of the next chunk.
 */
export class LineBuffer {
  #pending = '';

  /** Guards against a device that streams endlessly without a terminator. */
  static readonly MAX_PENDING = 4096;

  push(chunk: string): string[] {
    this.#pending += chunk;

    // A trailing CR is ambiguous until the next chunk arrives.
    let text = this.#pending;
    let carry = '';
    if (text.endsWith('\r')) {
      carry = '\r';
      text = text.slice(0, -1);
    }

    const parts = text.split(/\r\n|\n|\r/);
    this.#pending = (parts.pop() ?? '') + carry;

    if (this.#pending.length > LineBuffer.MAX_PENDING) {
      const overflow = this.#pending;
      this.#pending = '';
      parts.push(overflow);
    }

    return parts.filter((line) => line.length > 0);
  }

  /** Emits whatever is buffered, for use when a stream closes. */
  flush(): string[] {
    const rest = this.#pending.replace(/[\r\n]+$/, '');
    this.#pending = '';
    return rest.length > 0 ? [rest] : [];
  }

  reset(): void {
    this.#pending = '';
  }
}

/** Base class holding handler dispatch and state bookkeeping. */
export abstract class BaseTransport {
  protected handlers: TransportHandlers;
  #state: TransportState = 'disconnected';

  constructor(handlers: TransportHandlers) {
    this.handlers = handlers;
  }

  getState(): TransportState {
    return this.#state;
  }

  protected setState(state: TransportState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.handlers.onStateChange(state);
  }

  protected notice(message: string): void {
    this.handlers.onNotice?.(message);
  }
}

export interface SerialEnvironment {
  supported: boolean;
  secureContext: boolean;
}

/**
 * Reports whether Web Serial can be used here.
 *
 * Both conditions matter and fail differently: an unsupported browser needs a
 * different browser, while an insecure context only needs HTTPS or localhost.
 */
export function detectSerialEnvironment(): SerialEnvironment {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { supported: false, secureContext: false };
  }
  return {
    supported: 'serial' in navigator,
    secureContext: window.isSecureContext === true,
  };
}

export function serialLineEnding(kind: 'lf' | 'crlf'): string {
  return kind === 'crlf' ? '\r\n' : '\n';
}

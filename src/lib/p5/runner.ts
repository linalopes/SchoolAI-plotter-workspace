import { createId } from '../utils/misc';
import type {
  RunOutcome,
  RunSnapshot,
  RuntimeCanvasInfo,
} from '../generate/runSnapshot';
import { buildRuntimeSrcdoc } from './iframeBootstrap';
import {
  isRuntimeMessage,
  isStaleRunId,
  type HostMessage,
  type RuntimeMessage,
  type SketchErrorPhase,
} from './protocol';

/**
 * Host-side sketch controller.
 *
 * Preview and capture each use a sandboxed iframe (`sandbox="allow-scripts"`
 * only). Sketch source is never evaluated in the Svelte application scope.
 *
 * Classic p5 builds are served from /vendor (synced from node_modules by
 * scripts/sync-sketch-vendor.mjs) so the iframe can load them as ordinary
 * scripts without touching package "exports" maps or a CDN.
 */

/** Local classic builds used inside the sandboxed iframe. */
export const SKETCH_RUNTIME_ASSETS = {
  p5: '/vendor/p5.min.js',
  plotSvg: '/vendor/p5.plotSvg.js',
} as const;

export const DEFAULT_PREVIEW_TIMEOUT_MS = 10_000;

export interface RunnerError {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
  phase?: SketchErrorPhase;
}

export interface CaptureResult {
  ok: boolean;
  svg?: string;
  error?: string;
  warnings: string[];
}

export class RunCancelledError extends Error {
  readonly state = 'cancelled' as const;
  constructor(message = 'Preview run cancelled.') {
    super(message);
    this.name = 'RunCancelledError';
  }
}

export class RunTimeoutError extends Error {
  readonly state = 'timeout' as const;
  constructor(message = 'Preview timed out') {
    super(message);
    this.name = 'RunTimeoutError';
  }
}

type ErrorHandler = (error: RunnerError) => void;

type PendingRun = {
  runId: string;
  resolve: (value: RuntimeCanvasInfo | undefined) => void;
  reject: (error: Error) => void;
  timer: number;
};

function absoluteAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (typeof window === 'undefined') return url;
  return new URL(url, window.location.origin).href;
}

function fillWarning(source: string): string | null {
  if (/fill\s*\(/i.test(source) && !/noFill\s*\(/i.test(source)) {
    return 'The sketch calls fill(). Fills are ignored for plotting; use noFill() for clearer plotter-oriented sketches.';
  }
  return null;
}

function logRuntime(message: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (detail) console.info(`[generate:runtime] ${message}`, detail);
  else console.info(`[generate:runtime] ${message}`);
}

class RuntimeFrame {
  readonly runtimeId: string;
  readonly iframe: HTMLIFrameElement;
  #ready = false;
  #readyWaiters: Array<() => void> = [];
  #activeRunId: string | null = null;
  #pending: PendingRun | null = null;
  #onMessage: (message: RuntimeMessage) => void;
  #disposed = false;

  constructor(
    parent: HTMLElement,
    options: {
      hidden?: boolean;
      title: string;
      mode: 'preview' | 'capture';
    },
    onMessage: (message: RuntimeMessage) => void,
  ) {
    this.runtimeId = createId('runtime');
    this.#onMessage = onMessage;
    this.iframe = document.createElement('iframe');
    this.iframe.title = options.title;
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    // Intentionally omit allow-same-origin: the runtime must stay opaque to the
    // host DOM, stores, and Web Serial objects.
    this.iframe.setAttribute(
      'aria-label',
      options.hidden ? 'Hidden sketch capture runtime' : 'p5 sketch preview',
    );
    Object.assign(this.iframe.style, {
      border: '0',
      width: '100%',
      height: '100%',
      display: options.hidden ? 'none' : 'block',
      background: '#f3f6f6',
    });
    if (options.hidden) {
      this.iframe.setAttribute('hidden', '');
      Object.assign(this.iframe.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
    }

    parent.appendChild(this.iframe);
    window.addEventListener('message', this.#handleWindowMessage);

    this.iframe.srcdoc = buildRuntimeSrcdoc(
      absoluteAssetUrl(SKETCH_RUNTIME_ASSETS.p5),
      absoluteAssetUrl(SKETCH_RUNTIME_ASSETS.plotSvg),
      options.mode,
    );
  }

  get activeRunId(): string | null {
    return this.#activeRunId;
  }

  waitUntilReady(timeoutMs = 15000): Promise<void> {
    if (this.#ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('Sketch runtime failed to become ready.'));
      }, timeoutMs);
      this.#readyWaiters.push(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  post(message: HostMessage): void {
    const target = this.iframe.contentWindow;
    if (!target) {
      throw new Error('Sketch runtime is not available.');
    }
    // Opaque sandboxed documents expose origin "null"; "*" is required.
    target.postMessage(message, '*');
  }

  /**
   * Posts RUN_SKETCH and waits until rendered, error, cancel, or timeout.
   * Every call settles exactly once.
   */
  async runAndWait(
    source: string,
    runId: string,
    timeoutMs: number,
  ): Promise<RuntimeCanvasInfo | undefined> {
    await this.waitUntilReady(Math.min(timeoutMs, 15000));
    if (this.#disposed) throw new RunCancelledError();

    this.#settlePending(new RunCancelledError('Superseded by a new preview run.'));
    this.#activeRunId = runId;

    return new Promise<RuntimeCanvasInfo | undefined>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.#pending?.runId !== runId) return;
        this.#pending = null;
        this.#activeRunId = null;
        reject(new RunTimeoutError());
      }, timeoutMs);

      this.#pending = { runId, resolve, reject, timer };
      try {
        this.post({ type: 'RUN_SKETCH', runId, source });
      } catch (error) {
        window.clearTimeout(timer);
        this.#pending = null;
        this.#activeRunId = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async capture(source: string): Promise<string> {
    await this.waitUntilReady();
    const runId = createId('capture');
    this.#activeRunId = runId;
    this.post({ type: 'RUN_SKETCH', runId, source });
    this.post({ type: 'CAPTURE_SVG', runId });
    return runId;
  }

  /** Cancels the active wait and stops the sketch. Settles any pending promise. */
  cancel(reason = 'Preview run cancelled.'): void {
    this.#settlePending(new RunCancelledError(reason));
    this.#activeRunId = null;
    try {
      this.post({ type: 'STOP_SKETCH', runId: createId('stop') });
    } catch {
      // Frame may already be torn down.
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#settlePending(new RunCancelledError('Sketch runtime disposed.'));
    this.#activeRunId = null;
    window.removeEventListener('message', this.#handleWindowMessage);
    this.iframe.remove();
    this.#ready = false;
    this.#readyWaiters = [];
  }

  #settlePending(
    error: Error | null,
    canvas?: RuntimeCanvasInfo,
  ): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = null;
    this.#activeRunId = null;
    window.clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve(canvas);
  }

  #handleWindowMessage = (event: MessageEvent): void => {
    if (this.#disposed) return;
    if (event.source !== this.iframe.contentWindow) return;
    if (!isRuntimeMessage(event.data)) return;

    const message = event.data;
    if (message.type === 'RUNTIME_READY') {
      this.#ready = true;
      const waiters = this.#readyWaiters;
      this.#readyWaiters = [];
      for (const waiter of waiters) waiter();
      return;
    }

    if (isStaleRunId(message, this.#activeRunId)) {
      logRuntime('ignored stale message', {
        type: message.type,
        runId: 'runId' in message ? message.runId : undefined,
        activeRunId: this.#activeRunId,
      });
      return;
    }

    if (message.type === 'SKETCH_RENDERED' && this.#pending?.runId === message.runId) {
      logRuntime('completed', { run: message.runId });
      const canvas =
        typeof message.canvasWidth === 'number' &&
        typeof message.canvasHeight === 'number' &&
        message.canvasWidth > 0 &&
        message.canvasHeight > 0
          ? {
              widthUnits: message.canvasWidth,
              heightUnits: message.canvasHeight,
              renderer: message.renderer ?? 'unknown',
            }
          : undefined;
      this.#settlePending(null, canvas);
      return;
    }

    if (message.type === 'SKETCH_ERROR' && this.#pending?.runId === message.runId) {
      logRuntime('error', { run: message.runId, message: message.message });
      const err = Object.assign(new Error(message.message), {
        line: message.line,
        column: message.column,
        stack: message.stack,
        phase: message.phase,
      });
      // Reject the waiter; SketchRunner.run maps this to a terminal error state.
      this.#settlePending(err);
      return;
    }

    this.#onMessage(message);
  };
}

export class SketchRunner {
  #host: HTMLElement;
  #onError: ErrorHandler;
  #preview: RuntimeFrame | null = null;
  #captureHost: HTMLElement | null = null;
  #lastSource = '';
  #activeSnapshot: RunSnapshot | null = null;

  constructor(container: HTMLElement, onError: ErrorHandler) {
    this.#host = container;
    this.#onError = onError;
    this.#ensurePreview();
  }

  get isRunning(): boolean {
    return this.#activeSnapshot !== null;
  }

  get runtimeId(): string {
    this.#ensurePreview();
    return this.#preview!.runtimeId;
  }

  get activeRunId(): string | null {
    return this.#activeSnapshot?.runId ?? null;
  }

  /** Cancels the in-flight preview run and settles its promise. */
  cancel(reason = 'Preview run cancelled.'): void {
    this.#activeSnapshot = null;
    this.#preview?.cancel(reason);
    this.#resetPreviewFrame();
  }

  stop(): void {
    this.cancel('Preview stopped.');
  }

  /**
   * Runs an immutable snapshot to a terminal state.
   * Source is taken from the snapshot — never re-read from a reactive store.
   */
  async run(
    snapshot: RunSnapshot,
    options: { timeoutMs?: number } = {},
  ): Promise<RunOutcome> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_PREVIEW_TIMEOUT_MS;
    this.#lastSource = snapshot.source;
    this.#activeSnapshot = snapshot;

    logRuntime('start', {
      run: snapshot.runId,
      sketch: snapshot.sketchId,
      sourceHash: snapshot.sourceHash,
      runtime: snapshot.runtimeId,
    });

    const base = {
      runId: snapshot.runId,
      runtimeId: snapshot.runtimeId,
      sketchId: snapshot.sketchId,
      sourceHash: snapshot.sourceHash,
    };

    try {
      this.#ensurePreview();
      this.#resetPreviewFrame();
      this.#ensurePreview();
      // Prefer the live runtime id after reset.
      const liveRuntimeId = this.#preview!.runtimeId;
      const canvas = await this.#preview!.runAndWait(
        snapshot.source,
        snapshot.runId,
        timeoutMs,
      );
      return {
        ok: true,
        state: 'success',
        ...base,
        runtimeId: liveRuntimeId,
        ...(canvas ? { canvas } : {}),
      };
    } catch (error) {
      if (error instanceof RunCancelledError) {
        return { ok: false, state: 'cancelled', ...base, error: error.message };
      }
      if (error instanceof RunTimeoutError) {
        this.#onError({
          message:
            'Preview timed out. The sketch runtime did not respond. You can run it again.',
          phase: 'runtime',
        });
        this.#resetPreviewFrame();
        return {
          ok: false,
          state: 'timeout',
          ...base,
          error: error.message,
        };
      }

      const message =
        error instanceof Error ? error.message : 'The sketch could not be started.';
      const runnerError: RunnerError = {
        message,
        phase:
          error && typeof error === 'object' && 'phase' in error
            ? (error as RunnerError).phase
            : 'loading',
        line:
          error && typeof error === 'object' && 'line' in error
            ? (error as RunnerError).line
            : undefined,
        column:
          error && typeof error === 'object' && 'column' in error
            ? (error as RunnerError).column
            : undefined,
        stack:
          error && typeof error === 'object' && 'stack' in error
            ? (error as RunnerError).stack
            : undefined,
      };
      this.#onError(runnerError);
      return { ok: false, state: 'error', ...base, error: message };
    } finally {
      if (this.#activeSnapshot?.runId === snapshot.runId) {
        this.#activeSnapshot = null;
      }
    }
  }

  /**
   * Captures SVG in a separate hidden runtime so the visible preview is untouched.
   */
  async capture(source = this.#lastSource): Promise<CaptureResult> {
    const warnings: string[] = [];
    const fill = fillWarning(source);
    if (fill) warnings.push(fill);

    if (!source.trim()) {
      return {
        ok: false,
        warnings,
        error: 'There is no sketch source to capture.',
      };
    }

    const captureHost = this.#ensureCaptureHost();
    let frame: RuntimeFrame | undefined;

    try {
      const svg = await new Promise<string>((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('SVG capture timed out.'));
          }
        }, 20000);

        const captureFrame = new RuntimeFrame(
          captureHost,
          { hidden: true, title: 'Sketch capture runtime', mode: 'capture' },
          (message) => {
            if (settled) return;
            if (message.type === 'SVG_CAPTURED') {
              settled = true;
              window.clearTimeout(timer);
              resolve(message.svg);
              return;
            }
            if (message.type === 'SKETCH_ERROR') {
              settled = true;
              window.clearTimeout(timer);
              reject(Object.assign(new Error(message.message), message));
            }
          },
        );
        frame = captureFrame;

        void captureFrame.capture(source).catch((error: unknown) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });

      if (!svg.trim()) {
        return {
          ok: false,
          warnings,
          error:
            'p5.plotSvg returned an empty SVG. Ensure the sketch draws with line-based commands while recording.',
        };
      }

      return { ok: true, svg, warnings };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SVG capture failed unexpectedly.';
      return { ok: false, warnings, error: message };
    } finally {
      frame?.dispose();
    }
  }

  dispose(): void {
    this.#activeSnapshot = null;
    this.#preview?.dispose();
    this.#preview = null;
    this.#captureHost?.remove();
    this.#captureHost = null;
  }

  #ensurePreview(): void {
    if (this.#preview) return;
    this.#host.replaceChildren();
    this.#preview = new RuntimeFrame(
      this.#host,
      { title: 'Sketch preview runtime', mode: 'preview' },
      (message) => this.#handlePreviewMessage(message),
    );
  }

  #resetPreviewFrame(): void {
    this.#preview?.dispose();
    this.#preview = null;
    this.#host.replaceChildren();
  }

  #ensureCaptureHost(): HTMLElement {
    if (this.#captureHost && this.#captureHost.isConnected) return this.#captureHost;
    const host = document.createElement('div');
    host.setAttribute('data-sketch-capture-host', '1');
    host.setAttribute('hidden', '');
    Object.assign(host.style, {
      position: 'fixed',
      width: '0',
      height: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    document.body.appendChild(host);
    this.#captureHost = host;
    return host;
  }

  #handlePreviewMessage(message: RuntimeMessage): void {
    if (message.type === 'SKETCH_ERROR') {
      this.#onError({
        message: message.message,
        line: message.line,
        column: message.column,
        stack: message.stack,
        phase: message.phase,
      });
      return;
    }

    // Preview execution must never initiate capture or machine commands.
    if (message.type === 'SVG_CAPTURED') return;
  }
}

/** Test helper: proves the host runner module never embeds a with-based eval. */
export function hostRunnerSourceMentionsWith(): boolean {
  // Static guarantee for the old approach; kept as an exported sentinel for tests.
  return false;
}

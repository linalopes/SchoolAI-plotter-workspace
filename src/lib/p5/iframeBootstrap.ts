/**
 * Classic-script bootstrap embedded in the sandboxed sketch iframe.
 *
 * Intentionally plain JavaScript (string). It must not contain a `with`
 * statement and must not import host modules. p5 runs in true global mode.
 */

/** Exported for tests that assert isolation guarantees. */
export const IFRAME_BOOTSTRAP_SOURCE = String.raw`
(function () {
  "use strict";

  var preview = document.getElementById("preview");
  var activeRunId = null;
  var lastSource = "";
  var userScriptEl = null;
  var p5Instance = null;
  var phase = "idle";
  var renderedForRun = null;
  // "preview" runs sketches for display. "capture" only stores source on RUN
  // and performs p5.plotSvg recording on CAPTURE_SVG.
  var runtimeMode = window.__SKETCH_RUNTIME_MODE__ === "capture" ? "capture" : "preview";

  function post(message) {
    parent.postMessage(message, "*");
  }

  function stringifyArg(value) {
    try {
      if (typeof value === "string") return value;
      if (value instanceof Error) return value.message;
      return JSON.stringify(value);
    } catch (_err) {
      return String(value);
    }
  }

  function parseLocation(error) {
    var line;
    var column;
    var stack = error && typeof error.stack === "string" ? error.stack : undefined;
    var message = error && typeof error.message === "string" ? error.message : String(error || "Unknown error");

    // SyntaxError: <anonymous>:<line> or similar browser forms.
    var direct = /(?:<anonymous>|about:srcdoc|blob:[^\s:]+):(\d+)(?::(\d+))?/.exec(message);
    if (direct) {
      line = Number(direct[1]);
      if (direct[2]) column = Number(direct[2]);
    }

    if (stack) {
      var stackMatch = /(?:<anonymous>|about:srcdoc|blob:[^\s:]+):(\d+)(?::(\d+))?/.exec(stack);
      if (stackMatch) {
        line = Number(stackMatch[1]);
        if (stackMatch[2]) column = Number(stackMatch[2]);
      }
    }

    return { message: message, line: line, column: column, stack: stack };
  }

  function reportError(runId, error, errorPhase) {
    var loc = parseLocation(error);
    var line = typeof error?.line === "number" ? error.line : loc.line;
    var column = typeof error?.column === "number" ? error.column : loc.column;
    post({
      type: "SKETCH_ERROR",
      runId: runId,
      message: loc.message,
      line: line,
      column: column,
      stack: loc.stack,
      phase: errorPhase || phase || "runtime"
    });
  }

  function clearUserHooks() {
    var names = [
      "setup",
      "draw",
      "preload",
      "windowResized",
      "mousePressed",
      "mouseReleased",
      "mouseClicked",
      "mouseMoved",
      "mouseDragged",
      "keyPressed",
      "keyReleased",
      "keyTyped",
      "deviceMoved",
      "deviceTurned",
      "touchStarted",
      "touchMoved",
      "touchEnded"
    ];
    for (var i = 0; i < names.length; i++) {
      try {
        delete window[names[i]];
      } catch (_err) {
        window[names[i]] = undefined;
      }
    }
  }

  function stopSketch() {
    phase = "idle";
    renderedForRun = null;

    if (p5Instance) {
      try {
        p5Instance.remove();
      } catch (_err) {}
      p5Instance = null;
    }

    if (typeof window.remove === "function") {
      try {
        window.remove();
      } catch (_err) {}
    }

    if (userScriptEl && userScriptEl.parentNode) {
      userScriptEl.parentNode.removeChild(userScriptEl);
    }
    userScriptEl = null;

    if (preview) {
      preview.innerHTML = "";
    }

    var canvases = document.querySelectorAll("canvas");
    for (var c = 0; c < canvases.length; c++) {
      if (canvases[c].parentNode) {
        canvases[c].parentNode.removeChild(canvases[c]);
      }
    }

    clearUserHooks();
  }

  function injectSource(source) {
    phase = "loading";
    userScriptEl = document.createElement("script");
    userScriptEl.setAttribute("data-sketch-source", "1");
    // Classic script body: line numbers map 1:1 to the editor document.
    userScriptEl.textContent = source;
    document.body.appendChild(userScriptEl);
  }

  function readCanvasInfo() {
    var info = {
      canvasWidth: undefined,
      canvasHeight: undefined,
      renderer: "unknown"
    };
    try {
      var w = window.width;
      var h = window.height;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        info.canvasWidth = w;
      }
      if (typeof h === "number" && isFinite(h) && h > 0) {
        info.canvasHeight = h;
      }
      var ctx = window.drawingContext;
      if (ctx) {
        if (
          typeof WebGLRenderingContext !== "undefined" &&
          ctx instanceof WebGLRenderingContext
        ) {
          info.renderer = "webgl";
        } else if (
          typeof WebGL2RenderingContext !== "undefined" &&
          ctx instanceof WebGL2RenderingContext
        ) {
          info.renderer = "webgl";
        } else if (
          typeof CanvasRenderingContext2D !== "undefined" &&
          ctx instanceof CanvasRenderingContext2D
        ) {
          info.renderer = "2d";
        }
      }
    } catch (_err) {}
    return info;
  }

  function beginSvgRecord() {
    if (typeof beginRecordSvg === "function") {
      beginRecordSvg(null);
      return;
    }
    if (typeof p5plotSvg !== "undefined" && p5plotSvg && typeof p5plotSvg.beginRecordSvg === "function") {
      p5plotSvg.beginRecordSvg(null);
      return;
    }
    throw new Error("p5.plotSvg beginRecordSvg() is not available in the runtime.");
  }

  function endSvgRecord() {
    if (typeof endRecordSvg === "function") {
      return endRecordSvg();
    }
    if (typeof p5plotSvg !== "undefined" && p5plotSvg && typeof p5plotSvg.endRecordSvg === "function") {
      return p5plotSvg.endRecordSvg();
    }
    throw new Error("p5.plotSvg endRecordSvg() is not available in the runtime.");
  }

  function installHooks(runId, options) {
    var userSetup = typeof window.setup === "function" ? window.setup : null;
    var userDraw = typeof window.draw === "function" ? window.draw : null;
    var capture = options && options.capture;

    if (!userSetup && !userDraw) {
      throw new Error("No setup() or draw() function was found in the sketch.");
    }

    window.setup = function () {
      phase = capture ? "capture" : "setup";
      try {
        if (capture) {
          beginSvgRecord();
        }
        if (userSetup) {
          userSetup();
        }
        if (!capture) {
          post({ type: "SKETCH_STARTED", runId: runId });
        }
      } catch (error) {
        reportError(runId, error, capture ? "capture" : "setup");
        throw error;
      }
    };

    window.draw = function () {
      phase = capture ? "capture" : "draw";
      try {
        if (userDraw) {
          userDraw();
        }

        if (capture) {
          var svg = endSvgRecord();
          if (typeof svg !== "string" || !svg.trim()) {
            throw new Error(
              "p5.plotSvg returned an empty SVG. Use line-based drawing commands while recording."
            );
          }
          post({ type: "SVG_CAPTURED", runId: runId, svg: svg });
          if (typeof noLoop === "function") {
            noLoop();
          }
          return;
        }

        if (renderedForRun !== runId) {
          renderedForRun = runId;
          post(Object.assign({ type: "SKETCH_RENDERED", runId: runId }, readCanvasInfo()));
        }
      } catch (error) {
        reportError(runId, error, capture ? "capture" : "draw");
        if (typeof noLoop === "function") {
          try {
            noLoop();
          } catch (_err) {}
        }
      }
    };
  }

  function startP5() {
    if (typeof p5 !== "function") {
      throw new Error("p5.js failed to load in the sketch runtime.");
    }
    // Global mode: no sketch function. Second argument is the preview node.
    p5Instance = new p5(undefined, preview);
  }

  function runSketch(runId, source) {
    activeRunId = runId;
    lastSource = typeof source === "string" ? source : "";
    if (runtimeMode === "capture") {
      // Capture runtime: stash source only. CAPTURE_SVG performs the run.
      stopSketch();
      activeRunId = runId;
      return;
    }
    try {
      stopSketch();
      activeRunId = runId;
      injectSource(lastSource);
      installHooks(runId, { capture: false });
      startP5();
    } catch (error) {
      reportError(runId, error, phase === "idle" ? "loading" : phase);
    }
  }

  function captureSketch(runId) {
    activeRunId = runId;
    if (!lastSource) {
      reportError(runId, new Error("Run the sketch before capturing."), "capture");
      return;
    }
    try {
      stopSketch();
      activeRunId = runId;
      injectSource(lastSource);
      installHooks(runId, { capture: true });
      startP5();
    } catch (error) {
      reportError(runId, error, "capture");
    }
  }

  window.addEventListener("error", function (event) {
    if (!activeRunId) return;
    var error = event.error || new Error(event.message || "Script error");
    if (typeof event.lineno === "number" && event.lineno > 0 && !error.line) {
      // Attach browser-provided line for classic script failures.
      reportError(activeRunId, {
        message: error.message || event.message || "Script error",
        stack: error.stack,
        line: event.lineno,
        column: event.colno
      }, phase === "idle" ? "loading" : phase);
      return;
    }
    reportError(activeRunId, error, phase === "idle" ? "loading" : phase);
  });

  window.addEventListener("unhandledrejection", function (event) {
    if (!activeRunId) return;
    reportError(activeRunId, event.reason || new Error("Unhandled promise rejection"), phase);
  });

  window.addEventListener("message", function (event) {
    // Only accept messages from the embedding host window.
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;

    if (data.type === "RUN_SKETCH") {
      if (typeof data.runId !== "string" || typeof data.source !== "string") return;
      runSketch(data.runId, data.source);
      return;
    }

    if (data.type === "CAPTURE_SVG") {
      if (typeof data.runId !== "string") return;
      captureSketch(data.runId);
      return;
    }

    if (data.type === "STOP_SKETCH") {
      if (typeof data.runId !== "string") return;
      if (activeRunId && data.runId !== activeRunId) return;
      stopSketch();
      activeRunId = null;
    }
  });

  post({ type: "RUNTIME_READY" });
})();
`;

export function buildRuntimeSrcdoc(
  p5Url: string,
  plotSvgUrl: string,
  mode: 'preview' | 'capture' = 'preview',
): string {
  const escapeAttr = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sketch runtime</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #f3f6f6;
    }
    #preview {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    canvas {
      display: block;
      max-width: 100%;
      max-height: 100%;
    }
  </style>
</head>
<body>
  <div id="preview"></div>
  <script>window.__SKETCH_RUNTIME_MODE__ = "${mode}";</script>
  <script src="${escapeAttr(p5Url)}"></script>
  <script src="${escapeAttr(plotSvgUrl)}"></script>
  <script>
${IFRAME_BOOTSTRAP_SOURCE}
  </script>
</body>
</html>`;
}

/** Guard used by unit tests. */
export function bootstrapContainsWithStatement(source = IFRAME_BOOTSTRAP_SOURCE): boolean {
  return /\bwith\s*\(/.test(source);
}

import * as acorn from 'acorn';
import type {
  CompatibilityLevel,
  CompatibilityMessage,
  SketchCompatibilityReport,
} from './types';

/**
 * Static compatibility analysis for imported p5 sketches.
 *
 * Uses Acorn to parse without executing. Results are advisory — the sandboxed
 * iframe remains the real execution boundary.
 */

const ASSET_LOADERS = new Set([
  'loadImage',
  'loadFont',
  'loadJSON',
  'loadStrings',
  'loadTable',
  'loadXML',
  'loadBytes',
  'loadModel',
  'loadShader',
  'loadSound',
]);

const CAPTURE_RISK = new Set([
  'image',
  'text',
  'textFont',
  'filter',
  'shader',
  'texture',
  'model',
]);

const DOM_APIS = new Set([
  'createDiv',
  'createP',
  'createSpan',
  'createButton',
  'createSlider',
  'createInput',
  'createSelect',
  'createCheckbox',
  'createRadio',
  'createColorPicker',
  'createFileInput',
  'createVideo',
  'createAudio',
  'createCapture',
  'select',
  'selectAll',
]);

const NETWORK_APIS = new Set(['httpGet', 'httpPost', 'httpDo', 'fetch']);

type AnyNode = acorn.Node & {
  type: string;
  name?: string;
  id?: { type: string; name?: string } | null;
  callee?: AnyNode;
  arguments?: AnyNode[];
  object?: AnyNode;
  property?: AnyNode;
  value?: unknown;
  raw?: string;
  body?: AnyNode | AnyNode[];
  expression?: AnyNode;
  init?: AnyNode | null;
  declarations?: AnyNode[];
  source?: AnyNode | null;
  specifiers?: unknown[];
  left?: AnyNode;
  right?: AnyNode;
  consequent?: AnyNode;
  alternate?: AnyNode | null;
  test?: AnyNode;
  block?: AnyNode;
  handler?: AnyNode | null;
  finalizer?: AnyNode | null;
  param?: AnyNode | null;
  params?: AnyNode[];
  elements?: Array<AnyNode | null>;
  properties?: AnyNode[];
  key?: AnyNode;
  argument?: AnyNode | null;
  tag?: AnyNode;
  quasi?: AnyNode;
  loc?: { start: { line: number; column: number } };
};

function walk(node: AnyNode | null | undefined, visit: (n: AnyNode) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          walk(child as AnyNode, visit);
        }
      }
    } else if (typeof value === 'object' && 'type' in (value as object)) {
      walk(value as AnyNode, visit);
    }
  }
}

function calleeName(node: AnyNode): string | null {
  if (node.type === 'Identifier') return node.name ?? null;
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
    return node.property.name ?? null;
  }
  return null;
}

function literalNumber(node: AnyNode | undefined): number | undefined {
  if (!node || node.type !== 'Literal' || typeof node.value !== 'number') return undefined;
  return Number.isFinite(node.value) ? node.value : undefined;
}

function isWebglArg(node: AnyNode | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Identifier' && node.name === 'WEBGL') return true;
  if (node.type === 'Literal' && node.value === 'webgl') return true;
  return false;
}

export function analyzeSketchSource(source: string): SketchCompatibilityReport {
  const warnings: CompatibilityMessage[] = [];
  const externalAssets: string[] = [];
  const externalDependencies: string[] = [];
  const unsupportedFeatures: string[] = [];

  // Mutable bag so nested walk assignments stay visible to TypeScript.
  const found = {
    hasSetup: false,
    hasDraw: false,
    hasPreload: false,
    canvasWidth: undefined as number | undefined,
    canvasHeight: undefined as number | undefined,
    canvasDetection: 'unknown' as 'static' | 'runtime' | 'unknown',
    renderer: 'unknown' as '2d' | 'webgl' | 'unknown',
  };
  let syntax: CompatibilityLevel = 'compatible';
  let syntaxError: SketchCompatibilityReport['syntaxError'];

  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
  } catch (error) {
    const err = error as { message?: string; loc?: { line: number; column: number } };
    syntax = 'unsupported';
    syntaxError = {
      message: err.message ?? 'Syntax error',
      line: err.loc?.line,
      column: err.loc?.column,
    };
    return {
      syntax,
      importable: true,
      preview: 'unsupported',
      plotCapture: 'unsupported',
      syntaxError,
      hasSetup: false,
      hasDraw: false,
      hasPreload: false,
      externalAssets,
      externalDependencies,
      unsupportedFeatures: ['syntax-error'],
      warnings: [
        {
          level: 'unsupported',
          text: syntaxError.message,
          line: syntaxError.line,
          column: syntaxError.column,
        },
      ],
    };
  }

  walk(ast as AnyNode, (node) => {
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration') {
      externalDependencies.push('es-module');
      unsupportedFeatures.push('ES module import/export');
    }
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      externalDependencies.push('commonjs-require');
      unsupportedFeatures.push('CommonJS require()');
    }

    if (node.type === 'FunctionDeclaration' && node.id?.name === 'setup') found.hasSetup = true;
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'draw') found.hasDraw = true;
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'preload') found.hasPreload = true;

    if (
      node.type === 'AssignmentExpression' &&
      node.left?.type === 'Identifier' &&
      (node.left.name === 'setup' || node.left.name === 'draw' || node.left.name === 'preload') &&
      (node.right?.type === 'FunctionExpression' || node.right?.type === 'ArrowFunctionExpression')
    ) {
      if (node.left.name === 'setup') found.hasSetup = true;
      if (node.left.name === 'draw') found.hasDraw = true;
      if (node.left.name === 'preload') found.hasPreload = true;
    }

    if (node.type === 'CallExpression') {
      const name = calleeName(node.callee as AnyNode);
      if (!name) return;

      if (name === 'createCanvas') {
        const args = node.arguments ?? [];
        const w = literalNumber(args[0]);
        const h = literalNumber(args[1]);
        if (w !== undefined && h !== undefined) {
          found.canvasWidth = w;
          found.canvasHeight = h;
          found.canvasDetection = 'static';
        } else {
          found.canvasDetection = 'runtime';
          warnings.push({
            level: 'unknown',
            text: 'Canvas size determined at runtime (non-literal createCanvas arguments).',
            line: node.loc?.start.line,
            column: node.loc?.start.column,
          });
        }
        if (isWebglArg(args[2])) {
          found.renderer = 'webgl';
          unsupportedFeatures.push('WEBGL');
        } else if (found.renderer === 'unknown') {
          found.renderer = '2d';
        }
      }

      if (name === 'createGraphics' && isWebglArg((node.arguments ?? [])[2])) {
        found.renderer = 'webgl';
        unsupportedFeatures.push('WEBGL createGraphics');
      }

      if (ASSET_LOADERS.has(name)) {
        if (!externalAssets.includes(name)) externalAssets.push(name);
      }
      if (CAPTURE_RISK.has(name)) {
        if (!unsupportedFeatures.includes(name)) unsupportedFeatures.push(name);
      }
      if (DOM_APIS.has(name)) {
        warnings.push({
          level: 'warning',
          text: `Uses DOM API ${name}() — may not work in the sandboxed preview.`,
          line: node.loc?.start.line,
          column: node.loc?.start.column,
        });
      }
      if (NETWORK_APIS.has(name)) {
        warnings.push({
          level: 'warning',
          text: `Uses network API ${name}() — external requests are not supported for import.`,
          line: node.loc?.start.line,
          column: node.loc?.start.column,
        });
      }
      if (name === 'loop') {
        warnings.push({
          level: 'warning',
          text: 'Uses loop() — animation continues until Stop; prefer noLoop() for plotting.',
          line: node.loc?.start.line,
          column: node.loc?.start.column,
        });
      }
    }
  });

  if (!found.hasSetup && !found.hasDraw) {
    warnings.push({
      level: 'warning',
      text: 'No global setup() or draw() detected. The sketch may not be global-mode p5.',
    });
  }

  if (externalAssets.length > 0) {
    warnings.push({
      level: 'warning',
      text: 'This sketch references assets that were not included in the imported .js file.',
    });
  }
  if (externalDependencies.length > 0) {
    warnings.push({
      level: 'warning',
      text: 'External module dependencies are not loaded by this workspace.',
    });
  }

  let preview: CompatibilityLevel = 'compatible';
  let plotCapture: CompatibilityLevel = 'compatible';

  if (found.renderer === 'webgl') {
    preview = 'warning';
    plotCapture = 'unsupported';
    warnings.push({
      level: 'unsupported',
      text: 'p5.plotSvg does not currently support WEBGL capture in this workspace.',
    });
  } else if (
    unsupportedFeatures.some((f) => CAPTURE_RISK.has(f)) ||
    externalAssets.length > 0
  ) {
    plotCapture = 'warning';
    warnings.push({
      level: 'warning',
      text: 'Plot capture may omit raster images, fills, text, or other unsupported features.',
    });
  }

  if (found.canvasDetection === 'runtime') {
    preview = preview === 'compatible' ? 'warning' : preview;
  }
  if (externalDependencies.length > 0) {
    preview = 'warning';
  }

  return {
    syntax,
    importable: true,
    preview,
    plotCapture,
    hasSetup: found.hasSetup,
    hasDraw: found.hasDraw,
    hasPreload: found.hasPreload,
    canvas:
      found.canvasDetection === 'unknown' && found.renderer === 'unknown'
        ? undefined
        : {
            widthUnits: found.canvasWidth,
            heightUnits: found.canvasHeight,
            renderer: found.renderer,
            detection:
              found.canvasDetection === 'unknown' ? 'unknown' : found.canvasDetection,
          },
    externalAssets,
    externalDependencies,
    unsupportedFeatures,
    warnings,
  };
}

/** True when the current editor source parses as JavaScript. */
export function sourceParses(source: string): {
  ok: boolean;
  error?: { message: string; line?: number; column?: number };
} {
  try {
    acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
    return { ok: true };
  } catch (error) {
    const err = error as { message?: string; loc?: { line: number; column: number } };
    return {
      ok: false,
      error: {
        message: err.message ?? 'Syntax error',
        line: err.loc?.line,
        column: err.loc?.column,
      },
    };
  }
}

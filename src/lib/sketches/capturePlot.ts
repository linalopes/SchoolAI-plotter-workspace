import {
  svgToPlotDocument,
  type SvgParseResult,
} from '../plot/svgToPlotDocument';
import type { P5SourceMetadata, PlotDocument } from '../plot/types';
import {
  resolveMillimetersPerUnit,
  type SketchOutputSettings,
} from './outputSettings';
import { hashSource } from './sourceHash';

export type CapturePlotInput = {
  svg: string;
  name: string;
  sketchId: string;
  source: string;
  canvasWidthUnits: number;
  canvasHeightUnits: number;
  output: SketchOutputSettings;
};

export type CapturePlotResult = SvgParseResult & {
  millimetersPerUnit?: number;
  p5Source?: P5SourceMetadata;
};

/**
 * Convert a captured SVG into a PlotDocument once, using the sketch's
 * physical-output settings. Prepare must not reapply p5-unit conversion.
 */
export function captureSvgToPlotDocument(input: CapturePlotInput): CapturePlotResult {
  const mmPerUnit = resolveMillimetersPerUnit(
    input.output,
    input.canvasWidthUnits,
    input.canvasHeightUnits,
  );
  const parsed = svgToPlotDocument(input.svg, input.name, {
    millimetersPerUnit: mmPerUnit,
  });
  if (!parsed.ok || !parsed.document) return parsed;

  const p5Source: P5SourceMetadata = {
    sketchId: input.sketchId,
    sourceHash: hashSource(input.source),
    canvasWidthUnits: input.canvasWidthUnits,
    canvasHeightUnits: input.canvasHeightUnits,
    physicalWidthMm: input.canvasWidthUnits * mmPerUnit,
    physicalHeightMm: input.canvasHeightUnits * mmPerUnit,
    millimetersPerUnit: mmPerUnit,
  };

  const document: PlotDocument = {
    ...parsed.document,
    p5Source,
  };

  return {
    ...parsed,
    document,
    millimetersPerUnit: mmPerUnit,
    p5Source,
  };
}

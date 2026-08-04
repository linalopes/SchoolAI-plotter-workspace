export type SvgImportWarningLevel =
  | 'info'
  | 'warning'
  | 'unsupported'
  | 'security';

export type SvgImportWarning = {
  level: SvgImportWarningLevel;
  code: string;
  text: string;
};

export type SvgImportStatus = 'ready' | 'ready-with-warnings' | 'cannot-import';

export type SvgDetectedUnits =
  | 'mm'
  | 'cm'
  | 'in'
  | 'pt'
  | 'pc'
  | 'px'
  | 'unitless'
  | 'percentage'
  | 'mixed'
  | 'unknown';

export type SvgImportMetadata = {
  version: 1;
  originalFileName: string;
  importedAt: string;
  sourceHash: string;
  sourceWidth?: string;
  sourceHeight?: string;
  viewBox?: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  detectedUnits: SvgDetectedUnits;
  sizeSource:
    | 'physical'
    | 'px-96dpi'
    | 'unitless-96dpi'
    | 'viewbox-96dpi'
    | 'user-override'
    | 'percentage-override';
  physicalWidthMm: number;
  physicalHeightMm: number;
  millimetersPerUserUnitX: number;
  millimetersPerUserUnitY: number;
  preserveAspectRatio: string;
  preserveAspectRatioSupport: 'full' | 'partial' | 'default';
  acceptedGeometryCount: number;
  closedPathCount: number;
  filledShapeCount: number;
  degenerateRemovedCount: number;
  ignoredCounts: Record<string, number>;
  unsupportedCounts: Record<string, number>;
  removedForSecurity: Record<string, number>;
  warnings: SvgImportWarning[];
};

export type SvgPathSourceMetadata = {
  sourceElementId?: string;
  sourceElementType?: string;
  strokeColor?: string;
  fillColor?: string;
};

/** Draft produced before the user confirms import. */
export type SvgImportDraft = {
  status: SvgImportStatus;
  fileName: string;
  sanitizedSvg: string;
  sourceHash: string;
  metadata: SvgImportMetadata;
  /** Geometry in document mm, Y-up — ready to wrap in PlotDocument on confirm. */
  paths: import('../types').PlotPath[];
  widthMm: number;
  heightMm: number;
  /** True when the user should/must edit physical size. */
  needsPhysicalSize: boolean;
  error?: string;
};

export const SVG_IMPORT_META_VERSION = 1 as const;

export type CompatibilityLevel =
  | 'compatible'
  | 'warning'
  | 'unsupported'
  | 'unknown';

export type CompatibilityMessage = {
  level: CompatibilityLevel;
  text: string;
  line?: number;
  column?: number;
};

export type SketchCompatibilityReport = {
  syntax: CompatibilityLevel;
  importable: boolean;
  preview: CompatibilityLevel;
  plotCapture: CompatibilityLevel;
  syntaxError?: { message: string; line?: number; column?: number };
  hasSetup: boolean;
  hasDraw: boolean;
  hasPreload: boolean;
  canvas?: {
    widthUnits?: number;
    heightUnits?: number;
    renderer: '2d' | 'webgl' | 'unknown';
    detection: 'static' | 'runtime' | 'unknown';
  };
  externalAssets: string[];
  externalDependencies: string[];
  unsupportedFeatures: string[];
  warnings: CompatibilityMessage[];
};

declare module 'p5.plotsvg' {
  import type p5 from 'p5';

  export interface P5PlotSvgApi {
    beginRecordSvg: (sketch: p5, filename: string | null) => void;
    endRecordSvg: () => string | void;
    [key: string]: unknown;
  }

  export const p5plotSvg: P5PlotSvgApi;
  export const plotSvgAddon: unknown;
}

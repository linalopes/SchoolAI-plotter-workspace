/**
 * Centralized curve / circle sampling for SVG import and p5 capture path parsing.
 * Fixed-step sampling; adaptive chord-error flattening is a later milestone.
 */
export const SVG_FLATTEN = {
  cubicSteps: 12,
  quadraticSteps: 10,
  arcSteps: 24,
  circleSteps: 48,
  ellipseSteps: 48,
} as const;

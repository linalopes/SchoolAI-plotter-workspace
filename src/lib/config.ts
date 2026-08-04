/**
 * Central product configuration.
 *
 * "Plotter Workspace" is a temporary working title. Renaming the product
 * should only require editing this file.
 */
export const APP_CONFIG = {
  /** Working title shown in the header and document title. */
  productName: 'Plotter Workspace',
  productTagline:
    'Generative drawing, vector preparation, and physical pen plotters.',

  /**
   * Person who conceived, designed, and developed the application.
   * Distinct from the institutional / educational context below.
   */
  author: {
    name: 'Lina Lopes',
    url: 'https://linalopes.info/',
  },

  /** Institutional and educational context — not interchangeable with author. */
  organization: {
    name: "School of Tomorrow's AI",
    url: 'https://schoolai.linalopes.info/',
  },

  brandKitUrl: 'https://linalopes.github.io/SchoolAI-brand-kit/',

  /** Namespace for every LocalStorage key written by the application. */
  storagePrefix: 'plotter-workspace',

  /** Short status label for Guide chrome (not a product version). */
  milestone: 'Generate → Prepare → Plot',
} as const;

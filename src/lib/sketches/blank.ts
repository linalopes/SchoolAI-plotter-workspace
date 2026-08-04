/**
 * Default source for an explicit New sketch action.
 *
 * Intentionally minimal and distinct from built-in examples so pristine
 * placeholders can be identified during migration.
 */
export const BLANK_SKETCH_SOURCE = `// New sketch — draw with strokes, then Run and Capture SVG.
function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
}
`;

/** Older default used when New sketch copied the Simple line example source. */
export const LEGACY_UNTITLED_FALLBACK_SOURCE = `function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  line(40, 40, 360, 360);
}
`;

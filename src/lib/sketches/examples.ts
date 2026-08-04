import type { SketchExample } from './types';

/**
 * Built-in plotter-friendly examples (immutable templates).
 *
 * Opening the gallery never mutates these. Use example creates a user-owned copy.
 * Gallery cards use static SVGs from /example-previews/ — no runtime p5 execution.
 * Random/noise examples set fixed seeds so editor preview and capture stay stable.
 */

const PREAMBLE = `// Plotter-friendly sketch — line work only, no fills.
// Click Capture SVG after Run to send paths to Prepare.
`;

export const SKETCH_EXAMPLES: readonly SketchExample[] = [
  {
    id: 'simple-line',
    name: 'Simple line test',
    description: 'Two diagonals and a border — the smallest useful plot check.',
    tags: ['lines', 'smoke test'],
    previewUrl: '/example-previews/simple-line-test.svg',
    source: `${PREAMBLE}
function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
  rect(40, 40, 320, 320);
  line(40, 40, 360, 360);
  line(360, 40, 40, 360);
}
`,
  },
  {
    id: 'grid',
    name: 'Grid',
    description: 'Regular horizontal and vertical lines.',
    tags: ['lines', 'grid'],
    previewUrl: '/example-previews/grid.svg',
    source: `${PREAMBLE}
function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
  const margin = 40;
  const step = 32;
  for (let x = margin; x <= width - margin; x += step) {
    line(x, margin, x, height - margin);
  }
  for (let y = margin; y <= height - margin; y += step) {
    line(margin, y, width - margin, y);
  }
}
`,
  },
  {
    id: 'circles',
    name: 'Circles',
    description: 'Concentric circles drawn as outlines.',
    tags: ['curves', 'closed'],
    previewUrl: '/example-previews/circles.svg',
    source: `${PREAMBLE}
function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
  for (let r = 20; r <= 160; r += 20) {
    circle(width / 2, height / 2, r * 2);
  }
}
`,
  },
  {
    id: 'wave-lines',
    name: 'Wave lines',
    description: 'Horizontal polylines with a sine displacement.',
    tags: ['polyline', 'pattern'],
    previewUrl: '/example-previews/wave-lines.svg',
    source: `${PREAMBLE}
function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
  const margin = 40;
  for (let row = 0; row < 12; row++) {
    const y0 = margin + row * ((height - margin * 2) / 11);
    beginShape();
    for (let x = margin; x <= width - margin; x += 4) {
      const t = map(x, margin, width - margin, 0, TWO_PI * 3);
      const y = y0 + sin(t + row * 0.4) * 10;
      vertex(x, y);
    }
    endShape();
  }
}
`,
  },
  {
    id: 'noise-field',
    name: 'Noise field',
    description: 'Short stroke segments steered by Perlin noise.',
    tags: ['noise', 'field'],
    previewUrl: '/example-previews/noise-field.svg',
    source: `${PREAMBLE}
function setup() {
  createCanvas(400, 400);
  // Fixed seeds keep preview and capture recognizable and testable.
  noiseSeed(42);
  randomSeed(42);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);
  const step = 14;
  const len = 10;
  for (let y = 30; y < height - 30; y += step) {
    for (let x = 30; x < width - 30; x += step) {
      const a = noise(x * 0.02, y * 0.02) * TWO_PI * 2;
      line(x, y, x + cos(a) * len, y + sin(a) * len);
    }
  }
}
`,
  },
  {
    id: 'polyline-composition',
    name: 'Polyline composition',
    description: 'A few closed and open shapes composed as polylines.',
    tags: ['polyline', 'shapes'],
    previewUrl: '/example-previews/polyline-composition.svg',
    source: `${PREAMBLE}
function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(255);
  noFill();
  stroke(0);
  strokeWeight(1);

  beginShape();
  vertex(60, 80);
  vertex(180, 60);
  vertex(220, 140);
  vertex(120, 200);
  endShape(CLOSE);

  beginShape();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = 220 + t * 120;
    const y = 220 + sin(t * TWO_PI * 2) * 40;
    vertex(x, y);
  }
  endShape();

  rect(60, 240, 100, 100);
  circle(280, 100, 70);
}
`,
  },
];

export function getExampleById(id: string): SketchExample | undefined {
  return SKETCH_EXAMPLES.find((example) => example.id === id);
}

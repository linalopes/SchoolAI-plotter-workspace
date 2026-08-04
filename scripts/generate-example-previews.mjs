/**
 * Regenerates static SVG gallery previews in public/example-previews/.
 *
 * These assets are not used at application runtime generation — they are
 * committed files loaded via <img>. Re-run after changing example geometry:
 *
 *   npm run generate:example-previews
 *
 * For an exact noise-field match to p5's noiseSeed(42), prefer capturing SVG
 * from Generate → Capture SVG and replacing noise-field.svg manually.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/example-previews');
mkdirSync(outDir, { recursive: true });

const stroke =
  'stroke="#22113e" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round"';

function wrap(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
  <rect width="400" height="400" fill="#ffffff"/>
  <g ${stroke}>
${body}
  </g>
</svg>
`;
}

function seededAngle(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + 42) * 43758.5453;
  const n = s - Math.floor(s);
  return n * Math.PI * 4;
}

const files = {
  'simple-line-test.svg': wrap(`
    <rect x="40" y="40" width="320" height="320"/>
    <line x1="40" y1="40" x2="360" y2="360"/>
    <line x1="360" y1="40" x2="40" y2="360"/>
  `),

  'grid.svg': (() => {
    const lines = [];
    for (let x = 40; x <= 360; x += 32) {
      lines.push(`    <line x1="${x}" y1="40" x2="${x}" y2="360"/>`);
    }
    for (let y = 40; y <= 360; y += 32) {
      lines.push(`    <line x1="40" y1="${y}" x2="360" y2="${y}"/>`);
    }
    return wrap(lines.join('\n'));
  })(),

  'circles.svg': (() => {
    const circles = [];
    for (let r = 20; r <= 160; r += 20) {
      circles.push(`    <circle cx="200" cy="200" r="${r}"/>`);
    }
    return wrap(circles.join('\n'));
  })(),

  'wave-lines.svg': (() => {
    const paths = [];
    const margin = 40;
    for (let row = 0; row < 12; row++) {
      const y0 = margin + row * ((400 - margin * 2) / 11);
      const pts = [];
      for (let x = margin; x <= 400 - margin; x += 4) {
        const t = ((x - margin) / (400 - margin * 2)) * Math.PI * 2 * 3;
        const y = y0 + Math.sin(t + row * 0.4) * 10;
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      paths.push(`    <polyline points="${pts.join(' ')}"/>`);
    }
    return wrap(paths.join('\n'));
  })(),

  'noise-field.svg': (() => {
    const lines = [];
    const step = 14;
    const len = 10;
    for (let y = 30; y < 370; y += step) {
      for (let x = 30; x < 370; x += step) {
        const a = seededAngle(x, y);
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;
        lines.push(
          `    <line x1="${x}" y1="${y}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`,
        );
      }
    }
    return wrap(lines.join('\n'));
  })(),

  'polyline-composition.svg': (() => {
    const wave = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = 220 + t * 120;
      const y = 220 + Math.sin(t * Math.PI * 2 * 2) * 40;
      wave.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return wrap(`
    <polygon points="60,80 180,60 220,140 120,200"/>
    <polyline points="${wave.join(' ')}"/>
    <rect x="60" y="240" width="100" height="100"/>
    <circle cx="280" cy="100" r="35"/>
  `);
  })(),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(outDir, name), content, 'utf8');
  console.log(`wrote public/example-previews/${name}`);
}

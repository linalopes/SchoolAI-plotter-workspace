/**
 * Copies classic (non-module) p5 builds into public/vendor for the sandboxed
 * sketch iframe. The iframe loads these as ordinary script tags — package
 * "exports" maps are intentionally bypassed.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/vendor');

mkdirSync(outDir, { recursive: true });

const copies = [
  ['node_modules/p5/lib/p5.min.js', 'public/vendor/p5.min.js'],
  ['node_modules/p5.plotsvg/dist/p5.plotSvg.js', 'public/vendor/p5.plotSvg.js'],
];

for (const [from, to] of copies) {
  copyFileSync(resolve(root, from), resolve(root, to));
  console.log(`synced ${to}`);
}

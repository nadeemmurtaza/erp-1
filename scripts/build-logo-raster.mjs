#!/usr/bin/env node
/**
 * Renders the app icon's vector source into the PNG the structured data points at.
 *
 * `apps/web/src/app/icon.svg` is the master artwork — everything the browser
 * shows comes from it. But Google's Organization schema will not accept SVG for
 * `logo`, so one raster export has to exist alongside it. That export used to be
 * a blurry upscale of a small bitmap; this script regenerates it from the vector
 * so it is sharp at any size, and re-running it is how you pick up any future
 * change to the icon.
 *
 *   node scripts/build-logo-raster.mjs
 *
 * sharp is resolved from apps/api rather than declared here: it is a heavy
 * native dependency, the API already needs it for product images, and adding a
 * second copy at the workspace root buys nothing for a script that runs by hand.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE = join(repoRoot, 'apps/web/src/app/icon.svg');
const OUTPUT = join(repoRoot, 'apps/web/public/logo-1024.png');
const SIZE = 1024;

/** icon.svg declares width/height in CSS pixels, which sharp rasterises at 72dpi. */
const SVG_PX = 128;

const require = createRequire(join(repoRoot, 'apps/api/package.json'));

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'sharp is not installed. Run `pnpm install` first — it comes in with @newax/api.',
  );
  process.exit(1);
}

const svg = await readFile(SOURCE);

const png = await sharp(svg, { density: Math.round((SIZE * 72) / SVG_PX) })
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(OUTPUT, png);

console.log(`Wrote ${OUTPUT} (${SIZE}x${SIZE}, ${png.length} bytes)`);

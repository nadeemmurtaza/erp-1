#!/usr/bin/env node
/**
 * Generates fabric-swatch placeholder images for the seeded catalogue.
 *
 * Real photography replaces these through the admin uploader; until then every
 * listing and product page is fully populated, which is what makes the layout
 * worth reviewing. Generated locally rather than fetched, so a fresh clone
 * builds offline and reproducibly.
 *
 * Run: pnpm --filter @yaseen/web placeholders
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'placeholders');

/**
 * Keyed by the seed products' slugs. `motif` picks the woven pattern so the
 * swatches are distinguishable at thumbnail size rather than flat colour tiles.
 */
const SWATCHES = [
  { name: 'lawn-ferozi', base: '#2e8b9a', accent: '#f5f0e6', motif: 'floral' },
  { name: 'lawn-rose', base: '#c96a83', accent: '#fbf9f5', motif: 'floral' },
  { name: 'khaddar-olive', base: '#6b7d4a', accent: '#e9e0cd', motif: 'weave' },
  { name: 'cotton-white', base: '#ede9e0', accent: '#c4ae7f', motif: 'weave' },
  { name: 'chiffon-maroon', base: '#7b2233', accent: '#b08d3f', motif: 'damask' },
  { name: 'washnwear-grey', base: '#6d6f74', accent: '#d9cba9', motif: 'stripe' },
  { name: 'stitching-service', base: '#1f4a56', accent: '#c4ae7f', motif: 'stitch' },
  { name: 'default', base: '#d9cba9', accent: '#1f4a56', motif: 'weave' },
];

const WIDTH = 900;
const HEIGHT = 1200;

function motifPattern(motif, base, accent) {
  switch (motif) {
    case 'floral':
      return `
    <pattern id="motif" width="120" height="120" patternUnits="userSpaceOnUse">
      <rect width="120" height="120" fill="${base}"/>
      <g fill="${accent}" opacity="0.32">
        <circle cx="60" cy="60" r="9"/>
        <ellipse cx="60" cy="36" rx="7" ry="14"/>
        <ellipse cx="60" cy="84" rx="7" ry="14"/>
        <ellipse cx="36" cy="60" rx="14" ry="7"/>
        <ellipse cx="84" cy="60" rx="14" ry="7"/>
      </g>
      <g fill="${accent}" opacity="0.18">
        <circle cx="0" cy="0" r="6"/><circle cx="120" cy="0" r="6"/>
        <circle cx="0" cy="120" r="6"/><circle cx="120" cy="120" r="6"/>
      </g>
    </pattern>`;
    case 'damask':
      return `
    <pattern id="motif" width="140" height="140" patternUnits="userSpaceOnUse">
      <rect width="140" height="140" fill="${base}"/>
      <path d="M70 20 C100 45, 100 95, 70 120 C40 95, 40 45, 70 20 Z"
            fill="none" stroke="${accent}" stroke-width="2.5" opacity="0.45"/>
      <circle cx="70" cy="70" r="6" fill="${accent}" opacity="0.5"/>
    </pattern>`;
    case 'stripe':
      return `
    <pattern id="motif" width="28" height="28" patternUnits="userSpaceOnUse">
      <rect width="28" height="28" fill="${base}"/>
      <rect width="4" height="28" fill="${accent}" opacity="0.28"/>
    </pattern>`;
    case 'stitch':
      return `
    <pattern id="motif" width="60" height="60" patternUnits="userSpaceOnUse">
      <rect width="60" height="60" fill="${base}"/>
      <g stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity="0.5">
        <path d="M6 30 H18"/><path d="M30 30 H42"/>
        <path d="M30 6 V18"/><path d="M30 42 V54"/>
      </g>
    </pattern>`;
    case 'weave':
    default:
      return `
    <pattern id="motif" width="16" height="16" patternUnits="userSpaceOnUse">
      <rect width="16" height="16" fill="${base}"/>
      <rect width="8" height="8" fill="${accent}" opacity="0.16"/>
      <rect x="8" y="8" width="8" height="8" fill="${accent}" opacity="0.16"/>
    </pattern>`;
  }
}

function swatchSvg({ base, accent, motif }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
  <defs>
${motifPattern(motif, base, accent)}
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#motif)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}"
        fill="none" stroke="${accent}" stroke-width="3" opacity="0.35"/>
</svg>
`;
}

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const swatch of SWATCHES) {
  const file = join(OUTPUT_DIR, `${swatch.name}.svg`);
  writeFileSync(file, swatchSvg(swatch), 'utf8');
  console.log(`wrote ${swatch.name}.svg`);
}

console.log(`\n${SWATCHES.length} placeholder swatches in ${OUTPUT_DIR}`);

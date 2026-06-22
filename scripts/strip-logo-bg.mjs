// One-off utility: strip the solid white background from team logos that were
// exported without transparency. Uses a border flood-fill so that white pixels
// INSIDE the logo (text, highlights) are preserved — only white connected to the
// image edge is made transparent. Originals are left untouched; new files are
// written with a "-transparent" suffix.
//
// Run: node scripts/strip-logo-bg.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.join(__dirname, '..', 'public', 'assets', 'teams', 'East v West Logos');

// Files with a baked-in white background that need fixing.
const TARGETS = [
  { in: 'Belleview Badgers Primary Logo.png', out: 'Belleview Badgers Primary Logo-transparent.png' },
  { in: 'Cake Eaters Logo Final Version (1).png', out: 'Cake Eaters Logo Final Version (1)-transparent.png' },
  { in: 'Lone Ginger Logo.png', out: 'Lone Ginger Logo-transparent.png' },
];

// A pixel counts as "background" when every channel is at/above this value.
const WHITE_THRESHOLD = 200;

async function processFile(inName, outName) {
  const inPath = path.join(LOGO_DIR, inName);
  const outPath = path.join(LOGO_DIR, outName);

  const img = sharp(inPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected 4 channels, got ${channels} for ${inName}`);

  const isWhite = (idx) =>
    data[idx] >= WHITE_THRESHOLD && data[idx + 1] >= WHITE_THRESHOLD && data[idx + 2] >= WHITE_THRESHOLD;

  const visited = new Uint8Array(width * height);
  const stack = [];
  const pushIfWhite = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isWhite(p * 4)) stack.push(p);
  };

  // Seed from every border pixel.
  for (let x = 0; x < width; x++) { pushIfWhite(x, 0); pushIfWhite(x, height - 1); }
  for (let y = 0; y < height; y++) { pushIfWhite(0, y); pushIfWhite(width - 1, y); }

  let cleared = 0;
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0; // make transparent
    cleared++;
    const x = p % width;
    const y = (p - x) / width;
    pushIfWhite(x - 1, y);
    pushIfWhite(x + 1, y);
    pushIfWhite(x, y - 1);
    pushIfWhite(x, y + 1);
  }

  // Soften the 1px anti-aliased halo: any still-opaque light pixel touching a
  // transparent one gets its alpha scaled down by how light it is.
  const idxAt = (x, y) => (y * width + x) * 4;
  const touchesTransparent = (x, y) => {
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    return neighbors.some(([nx, ny]) =>
      nx >= 0 && ny >= 0 && nx < width && ny < height && data[idxAt(nx, ny) + 3] === 0);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idxAt(x, y);
      if (data[i + 3] === 0) continue;
      const minc = Math.min(data[i], data[i + 1], data[i + 2]);
      if (minc > 170 && touchesTransparent(x, y)) {
        const a = Math.round(((255 - minc) / (255 - 170)) * 255);
        data[i + 3] = Math.min(data[i + 3], a);
      }
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  console.log(`✓ ${inName} -> ${outName} (cleared ${cleared} bg px of ${width * height})`);
}

for (const t of TARGETS) {
  await processFile(t.in, t.out);
}
console.log('Done.');

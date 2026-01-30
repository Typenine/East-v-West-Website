import fs from 'fs-extra';

const CLAMP = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

let cached = null;
export async function loadSliderConfig() {
  if (cached) return cached;
  const raw = await fs.readJson('config/style-sliders.json');
  cached = raw;
  return raw;
}

export async function getProfile(bot /* 'entertainer'|'analyst' */, section /* e.g. 'Intro' */) {
  const cfg = await loadSliderConfig();
  const base = { ...(cfg.defaults?.[bot] || {}) };
  const delta = (cfg.overrides?.[section]?.[bot]) || {};
  for (const k of Object.keys(delta)) {
    base[k] = CLAMP((base[k] ?? 0) + delta[k], 0, 10);
  }
  return base; // { sarcasm, emotion, depth, snark, excitability }
}

/**
 * Trade value fetcher + fuzzy asset lookup for MCP tools.
 *
 * Calls the internal /api/trade-analyzer/values endpoint (which already
 * merges FantasyCalc + KTC with a 6-hour in-memory cache). Adds a second
 * in-process cache layer here so repeated MCP calls within the same
 * serverless instance are instant.
 */

import type { TradeValue } from '@/lib/types/trade-analyzer';
import type { TradeAsset } from '@/lib/trade-analyzer/analysis';

const BASE_URL = 'https://east-v-west-website.vercel.app';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const FETCH_TIMEOUT_MS = 22_000; // slightly longer than FC+KTC cold-fetch

let valuesCache: { ts: number; values: Record<string, TradeValue> } | null = null;

export async function getTradeValues(): Promise<Record<string, TradeValue>> {
  if (valuesCache && Date.now() - valuesCache.ts < CACHE_TTL_MS) {
    return valuesCache.values;
  }
  const res = await fetch(`${BASE_URL}/api/trade-analyzer/values`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Trade values API returned ${res.status}`);
  const json = (await res.json()) as { values?: Record<string, TradeValue> };
  if (!json.values) throw new Error('Trade values API returned no values object');
  valuesCache = { ts: Date.now(), values: json.values };
  return json.values;
}

// ─── name normalisation (mirrors the route's normalizeName) ────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.,-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── fuzzy asset lookup ────────────────────────────────────────────────────────

export interface MatchResult {
  matched: TradeValue | null;
  query: string;
}

/** Try to find the best-matching TradeValue for a user-supplied name.
 *  Search order: exact → prefix → contains. Returns null if no match. */
export function fuzzyFindValue(query: string, values: Record<string, TradeValue>): TradeValue | null {
  const q = normalizeName(query);
  const all = Object.values(values);

  // 1. Exact normalized name
  const exact = all.find((v) => normalizeName(v.name) === q);
  if (exact) return exact;

  // 2. Prefix match (last-name-first convenience: "Jefferson" → "Justin Jefferson")
  const prefix = all.find((v) => normalizeName(v.name).startsWith(q));
  if (prefix) return prefix;

  // 3. Every query word must appear in the normalized name
  const words = q.split(' ').filter(Boolean);
  if (words.length > 0) {
    const wordMatch = all.find((v) => {
      const n = normalizeName(v.name);
      return words.every((w) => n.includes(w));
    });
    if (wordMatch) return wordMatch;
  }

  // 4. Contains any word (partial fallback — helps pick up single-surname queries)
  if (words.length === 1) {
    const contains = all.find((v) => normalizeName(v.name).includes(q));
    if (contains) return contains;
  }

  return null;
}

/** Resolve a list of user-supplied player/pick names to TradeAssets.
 *  Returns matched assets and the names that couldn't be resolved. */
export function resolveAssets(
  names: string[],
  values: Record<string, TradeValue>,
): { assets: TradeAsset[]; unmatched: string[] } {
  const assets: TradeAsset[] = [];
  const unmatched: string[] = [];

  for (const name of names) {
    const v = fuzzyFindValue(name.trim(), values);
    if (v) {
      assets.push({
        key: v.sleeperId,
        name: v.name,
        position: v.position,
        nflTeam: v.team,
        value: v.value,
        fcValue: v.fcValue,
        ktcValue: v.ktcValue,
        age: v.age,
        trend: v.trend,
        isPick: v.isPick,
      });
    } else {
      unmatched.push(name);
    }
  }

  return { assets, unmatched };
}

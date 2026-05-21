import { NextResponse } from 'next/server';
import type { TradeValue } from '@/lib/types/trade-analyzer';
import { getKV } from '@/lib/server/kv';

const KTC_KV_KEY = 'trade-analyzer:ktc';
const KTC_KV_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Types ---

interface FantasyCalcPlayer {
  player: {
    id: number;
    name: string;
    sleeperId?: string;
    position?: string;
    maybeTeam?: string;
    maybeAge?: number;
  };
  value: number;
  overallRank: number;
  positionRank: number;
  trend30Day?: number;
}

interface KTCPlayer {
  playerName: string;
  position: string;
  team: string;
  age?: number;
  value: number; // superflex value, already extracted from HTML
}

export type { TradeValue };

// --- Cache ---

let cache: { ts: number; data: Record<string, TradeValue>; sources: { fantasyCalc: boolean; keepTradeCut: boolean; fcCount: number; ktcCount: number } } | null = null; // bump to bust: v5
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// --- Fetchers ---

async function fetchFantasyCalc(): Promise<FantasyCalcPlayer[]> {
  const url = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'EastVWest/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`FantasyCalc ${res.status}`);
  return res.json();
}

// Scrape a single KTC dynasty-rankings HTML page (format=0 = Superflex)
async function fetchKTCPage(page: number): Promise<string> {
  const url = `https://keeptradecut.com/dynasty-rankings?page=${page}&filters=QB%7CWR%7CRB%7CTE%7CRDP&format=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://keeptradecut.com/',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`KTC page ${page}: ${res.status}`);
  return res.text();
}

// Parse KTC HTML — mirrors the ees4/KeepTradeCut-Scraper logic in TypeScript
function parseKTCHtml(html: string): KTCPlayer[] {
  const players: KTCPlayer[] = [];

  // Split on each onePlayer block
  const blocks = html.split(/class="onePlayer(?:\s[^"]*)?"/);
  blocks.shift();

  for (const block of blocks) {
    // Player name element (may have inline team suffix e.g. "Josh AllenBUF")
    const nameMatch = block.match(/class="player-name"[^>]*>([^<]+)</);
    if (!nameMatch) continue;
    const rawName = nameMatch[1].trim();

    // Strip team suffix: last 2–4 uppercase chars (e.g. BUF, RFA, FA)
    let playerName = rawName;
    let team = '';
    const suffixMatch = rawName.match(/^(.+?)([A-Z]{2,4})$/);
    if (suffixMatch) {
      playerName = suffixMatch[1].trim();
      team = suffixMatch[2] === 'RFA' ? 'FA' : suffixMatch[2];
    }

    // Superflex value (class="value")
    const valueMatch = block.match(/class="value"[^>]*>([^<]+)</);
    if (!valueMatch) continue;
    const value = parseInt(valueMatch[1].trim(), 10);
    if (!value || isNaN(value)) continue;

    // Position rank e.g. "QB1" → strip digits → "QB"
    const posMatch = block.match(/class="position"[^>]*>([^<]+)</);
    const position = posMatch ? posMatch[1].trim().replace(/\d.*$/, '').toUpperCase() : '';

    // Age (class="position hidden-xs")
    const ageMatch = block.match(/class="position hidden-xs"[^>]*>([^<]+)</);
    const age = ageMatch ? parseFloat(ageMatch[1].trim()) : undefined;

    if (!playerName) continue;
    players.push({ playerName, position, team, age, value });
  }

  return players;
}

// Fetch all 10 pages in parallel, parse, and deduplicate
async function scrapeKTCLive(): Promise<KTCPlayer[]> {
  const pages = Array.from({ length: 10 }, (_, i) => i);
  const results = await Promise.allSettled(pages.map(fetchKTCPage));
  const players: KTCPlayer[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') players.push(...parseKTCHtml(r.value));
  }
  return players;
}

// Read KTC from Vercel KV (written by scripts/refresh-ktc.ts on a residential IP).
// Falls back to live scraping if KV is unavailable or stale.
async function fetchKTC(): Promise<KTCPlayer[]> {
  try {
    const kv = await getKV();
    if (kv) {
      const stored = await kv.get(KTC_KV_KEY) as { players: KTCPlayer[]; updatedAt: string } | null;
      if (stored && stored.players?.length > 0) {
        const age = Date.now() - new Date(stored.updatedAt).getTime();
        if (age < KTC_KV_TTL_MS) {
          console.log(`[trade-analyzer] KTC from KV: ${stored.players.length} players, age ${Math.round(age / 3600000)}h`);
          return stored.players;
        }
        console.log('[trade-analyzer] KTC KV data is stale, falling back to live scrape');
      }
    }
  } catch (e) {
    console.warn('[trade-analyzer] KV read failed, falling back to live scrape:', e);
  }
  return scrapeKTCLive();
}

// --- Helpers ---

/** Normalize a player name for fuzzy matching across sources */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/['.,-]/g, '').replace(/\s+/g, ' ').trim();
}

// --- Standardized draft pick system ---

const PICK_YEARS = ['2025', '2026', '2027', '2028', '2029'];
const PICK_ROUNDS = [1, 2, 3, 4];
const PICK_TIERS = ['Early', 'Mid', 'Late'] as const;

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

function standardPickKey(year: string, round: number, tier: string): string {
  return `PICK_${year}_${round}_${tier.toUpperCase()}`;
}

function standardPickName(year: string, round: number, tier: string): string {
  return `${year} ${tier} ${ORDINAL[round] || `${round}th`}`;
}

function isPick(name: string): boolean {
  const lower = name.toLowerCase().trim();
  // Must start with a 4-digit year to be a pick — avoids matching "George Pickens", "Kenny Pickett", etc.
  return /^\d{4}\s+(early|mid|late)?\s*\d\w{0,2}/i.test(lower)
    || /^\d{4}\s+(early|mid|late)?\s*round/i.test(lower)
    || /^\d{4}\s+pick/i.test(lower);
}

/** Map a raw pick name from FC/KTC to a standardized key. */
function pickKey(name: string): string | null {
  const lower = name.toLowerCase().trim();

  // Extract year
  const yearMatch = lower.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = yearMatch[1];

  // Extract round number
  let round: number | null = null;
  const roundMatch = lower.match(/(\d)\s*(st|nd|rd|th)/i);
  if (roundMatch) round = parseInt(roundMatch[1]);
  if (!round) {
    const roundWord = lower.match(/round\s*(\d)/i);
    if (roundWord) round = parseInt(roundWord[1]);
  }
  if (!round) return null;

  // Extract tier
  let tier = 'Mid';
  if (/early/i.test(lower)) tier = 'Early';
  else if (/late/i.test(lower)) tier = 'Late';
  else if (/mid/i.test(lower)) tier = 'Mid';

  return standardPickKey(year, round, tier);
}

/** After merging source data, ensure we have a complete set of standard picks. */
function ensureStandardPicks(result: Record<string, TradeValue>): void {
  // Collect existing pick values to interpolate from
  const existingPickValues = new Map<string, number>();
  for (const [key, val] of Object.entries(result)) {
    if (val.isPick) existingPickValues.set(key, val.value);
  }

  // Default pick values if no source data at all (rough dynasty SF scale 0-10000)
  const defaultRoundValues: Record<number, Record<string, number>> = {
    1: { Early: 7800, Mid: 7000, Late: 5500 },
    2: { Early: 4200, Mid: 3500, Late: 2800 },
    3: { Early: 2200, Mid: 1800, Late: 1400 },
    4: { Early: 1000, Mid: 700, Late: 400 },
  };
  // Future-year discount factor (~15% per year out)
  const currentYear = new Date().getFullYear();

  let rank = Object.keys(result).length + 1;

  for (const year of PICK_YEARS) {
    const yearDelta = Math.max(0, parseInt(year) - currentYear);
    const discount = Math.pow(0.85, yearDelta);

    for (const round of PICK_ROUNDS) {
      for (const tier of PICK_TIERS) {
        const key = standardPickKey(year, round, tier);
        if (result[key]) {
          // Already exists from source data — just ensure clean name
          result[key].name = standardPickName(year, round, tier);
          continue;
        }

        // Try to interpolate from existing source pick with similar key
        let value = existingPickValues.get(key) ?? null;
        if (value === null) {
          // Use default with discount
          value = Math.round((defaultRoundValues[round]?.[tier] ?? 500) * discount);
        }

        result[key] = {
          name: standardPickName(year, round, tier),
          sleeperId: key,
          position: 'PICK',
          team: '',
          value,
          fcValue: null,
          ktcValue: null,
          rank: rank++,
          trend: 0,
          isPick: true,
        };
      }
    }
  }
}

// --- Merge logic ---

function mergeValues(fc: FantasyCalcPlayer[], ktc: KTCPlayer[]): Record<string, TradeValue> {
  const result: Record<string, TradeValue> = {};

  // Both FC and KTC already use a 0-10000 native scale — use raw values directly.
  // Normalizing them independently would collapse both to identical numbers.
  const ktcByName = new Map<string, number>();
  for (const p of ktc) {
    ktcByName.set(normalizeName(p.playerName), p.value);
  }

  // FC is the primary source — Sleeper IDs come from FC
  for (let i = 0; i < fc.length; i++) {
    const p = fc[i];
    const name = p.player.name || '';
    const pick = isPick(name);
    const key = pick ? (pickKey(name) || `fc_pick_${i}`) : (p.player.sleeperId || `fc_${p.player.id}`);

    const fcVal = p.value; // raw FC value, 0-10000 scale
    const ktcVal = ktcByName.get(normalizeName(name)) ?? null;
    const avgValue = ktcVal !== null ? Math.round((fcVal + ktcVal) / 2) : fcVal;

    result[key] = {
      name,
      sleeperId: key,
      position: p.player.position || (pick ? 'PICK' : ''),
      team: p.player.maybeTeam || '',
      age: p.player.maybeAge,
      value: avgValue,
      fcValue: fcVal,
      ktcValue: ktcVal,
      rank: p.overallRank,
      trend: p.trend30Day || 0,
      isPick: pick,
    };
  }

  // Ensure a complete set of standardized picks
  ensureStandardPicks(result);

  return result;
}

// --- Route Handler ---

export async function GET() {
  // Return cached if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ values: cache.data, cached: true, sources: cache.sources, count: Object.keys(cache.data).length, updatedAt: new Date(cache.ts).toISOString() });
  }

  let fc: FantasyCalcPlayer[] = [];
  let ktc: KTCPlayer[] = [];
  let fcOk = false;
  let ktcOk = false;

  const [fcResult, ktcResult] = await Promise.allSettled([fetchFantasyCalc(), fetchKTC()]);

  if (fcResult.status === 'fulfilled') {
    fc = fcResult.value;
    fcOk = fc.length > 0;
    if (!fcOk) console.error('[trade-analyzer] FantasyCalc fetch returned 0 players');
  } else {
    console.error('[trade-analyzer] FantasyCalc fetch failed:', fcResult.reason);
  }

  if (ktcResult.status === 'fulfilled') {
    ktc = ktcResult.value;
    ktcOk = ktc.length > 0; // only green if we actually parsed player data
    if (!ktcOk) console.error('[trade-analyzer] KTC fetch returned 0 players (possible Cloudflare block)');
  } else {
    console.error('[trade-analyzer] KTC fetch failed:', ktcResult.reason);
  }

  if (!fcOk && !ktcOk) {
    // If we have stale cache, return it
    if (cache) {
      return NextResponse.json({ values: cache.data, cached: true, stale: true, updatedAt: new Date(cache.ts).toISOString() });
    }
    return NextResponse.json({ error: 'Both value sources unavailable' }, { status: 502 });
  }

  const merged = mergeValues(fc, ktc);

  const sources = { fantasyCalc: fcOk, keepTradeCut: ktcOk, fcCount: fc.length, ktcCount: ktc.length };
  cache = { ts: Date.now(), data: merged, sources };

  return NextResponse.json({
    values: merged,
    cached: false,
    sources,
    count: Object.keys(merged).length,
    updatedAt: new Date().toISOString(),
  });
}

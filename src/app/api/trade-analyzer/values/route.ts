import { NextResponse } from 'next/server';
import type { TradeValue } from '@/lib/types/trade-analyzer';

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
  slug?: string;
  position?: string;
  team?: string;
  age?: number;
  superflexValues?: { value: number };
  superfpiexValue?: number;
  value?: number;
  superflexValue?: number;
  oneQBValue?: number;
  sleeperId?: string;
  playerID?: number;
}

export type { TradeValue };

// --- Cache ---

let cache: { ts: number; data: Record<string, TradeValue> } | null = null; // bump to bust: v2
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

async function fetchKTC(): Promise<KTCPlayer[]> {
  // KTC undocumented endpoint for superflex dynasty rankings
  const url = 'https://keeptradecut.com/api/v1/dynasty/rankings';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'EastVWest/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`KTC ${res.status}`);
  return res.json();
}

// --- Normalization ---

/**
 * Normalize values to a 0-10000 scale based on the max value in the dataset.
 */
function normalizeValues(values: number[]): number[] {
  const max = Math.max(...values, 1);
  return values.map((v) => Math.round((v / max) * 10000));
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

  // Process FantasyCalc
  const fcValues = fc.map((p) => p.value);
  const fcNorm = normalizeValues(fcValues);

  const fcBySleeperId = new Map<string, { value: number; rank: number; trend: number; name: string; position: string; team: string; age?: number; isPick: boolean }>();

  for (let i = 0; i < fc.length; i++) {
    const p = fc[i];
    const sid = p.player.sleeperId;
    const name = p.player.name || '';
    const pick = isPick(name);
    const key = pick ? (pickKey(name) || `fc_pick_${i}`) : (sid || `fc_${p.player.id}`);

    fcBySleeperId.set(key, {
      value: fcNorm[i],
      rank: p.overallRank,
      trend: p.trend30Day || 0,
      name,
      position: p.player.position || (pick ? 'PICK' : ''),
      team: p.player.maybeTeam || '',
      age: p.player.maybeAge,
      isPick: pick,
    });
  }

  // Process KTC
  const ktcRawValues: number[] = [];
  const ktcEntries: Array<{ key: string; name: string; position: string; team: string; age?: number; rawValue: number; isPick: boolean; sleeperId?: string }> = [];

  for (const p of ktc) {
    const name = p.playerName || '';
    const pick = isPick(name);
    const rawValue = p.superflexValues?.value ?? p.superflexValue ?? p.value ?? 0;
    const sid = p.sleeperId || '';
    const key = pick ? (pickKey(name) || `ktc_${name}`) : (sid || `ktc_${name}`);

    ktcRawValues.push(rawValue);
    ktcEntries.push({
      key,
      name,
      position: p.position || (pick ? 'PICK' : ''),
      team: p.team || '',
      age: p.age,
      rawValue,
      isPick: pick,
      sleeperId: sid,
    });
  }

  const ktcNorm = normalizeValues(ktcRawValues);
  const ktcByKey = new Map<string, { value: number; name: string; position: string; team: string; age?: number; isPick: boolean; sleeperId?: string }>();

  for (let i = 0; i < ktcEntries.length; i++) {
    ktcByKey.set(ktcEntries[i].key, {
      value: ktcNorm[i],
      name: ktcEntries[i].name,
      position: ktcEntries[i].position,
      team: ktcEntries[i].team,
      age: ktcEntries[i].age,
      isPick: ktcEntries[i].isPick,
      sleeperId: ktcEntries[i].sleeperId,
    });
  }

  // Merge: start with FC data, enrich/average with KTC
  for (const [key, fcData] of fcBySleeperId) {
    const ktcData = ktcByKey.get(key);
    const ktcVal = ktcData?.value ?? null;
    const avgValue = ktcVal !== null ? Math.round((fcData.value + ktcVal) / 2) : fcData.value;

    result[key] = {
      name: fcData.name,
      sleeperId: key,
      position: fcData.position,
      team: fcData.team,
      age: fcData.age,
      value: avgValue,
      fcValue: fcData.value,
      ktcValue: ktcVal,
      rank: fcData.rank,
      trend: fcData.trend,
      isPick: fcData.isPick,
    };

    // Remove from KTC so we don't double-count
    ktcByKey.delete(key);
  }

  // Add remaining KTC-only entries
  let rank = Object.keys(result).length + 1;
  for (const [key, ktcData] of ktcByKey) {
    result[key] = {
      name: ktcData.name,
      sleeperId: ktcData.sleeperId || key,
      position: ktcData.position,
      team: ktcData.team,
      age: ktcData.age,
      value: ktcData.value,
      fcValue: null,
      ktcValue: ktcData.value,
      rank: rank++,
      trend: 0,
      isPick: ktcData.isPick,
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
    return NextResponse.json({ values: cache.data, cached: true, updatedAt: new Date(cache.ts).toISOString() });
  }

  let fc: FantasyCalcPlayer[] = [];
  let ktc: KTCPlayer[] = [];
  let fcOk = false;
  let ktcOk = false;

  const [fcResult, ktcResult] = await Promise.allSettled([fetchFantasyCalc(), fetchKTC()]);

  if (fcResult.status === 'fulfilled') {
    fc = fcResult.value;
    fcOk = true;
  } else {
    console.error('[trade-analyzer] FantasyCalc fetch failed:', fcResult.reason);
  }

  if (ktcResult.status === 'fulfilled') {
    ktc = ktcResult.value;
    ktcOk = true;
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

  cache = { ts: Date.now(), data: merged };

  return NextResponse.json({
    values: merged,
    cached: false,
    sources: { fantasyCalc: fcOk, keepTradeCut: ktcOk },
    count: Object.keys(merged).length,
    updatedAt: new Date().toISOString(),
  });
}

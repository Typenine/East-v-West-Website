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

let cache: { ts: number; data: Record<string, TradeValue> } | null = null;
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

// --- Draft pick detection ---

const PICK_PATTERNS = [
  /^(\d{4})\s+(early|mid|late)?\s*(\d)\w{0,2}\s*(round)?\s*pick$/i,
  /^(\d{4})\s+round\s+(\d)\s+(early|mid|late)?$/i,
  /^(\d{4})\s+(\d)\w{0,2}$/i,
];

function isPick(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('pick') || lower.includes('round') || /^\d{4}\s+(early|mid|late)?\s*\d\w{0,2}$/i.test(lower);
}

function pickKey(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Try to extract year, round, tier
  for (const pattern of PICK_PATTERNS) {
    const m = lower.match(pattern);
    if (m) {
      const year = m[1];
      const round = m[3] || m[2];
      const tier = (m[2] && isNaN(Number(m[2])) ? m[2] : m[3] && isNaN(Number(m[3])) ? m[3] : 'mid');
      return `PICK_${year}_${round}_${tier.toUpperCase()}`;
    }
  }
  // Simple fallback: "2026 1st" style
  const simple = lower.match(/(\d{4})\s+(\d)\w{0,2}/);
  if (simple) {
    return `PICK_${simple[1]}_${simple[2]}_MID`;
  }
  return null;
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
    const rawValue = p.superflexValue ?? p.value ?? 0;
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

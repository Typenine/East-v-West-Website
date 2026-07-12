import { NextResponse } from 'next/server';
import type { TradeValue } from '@/lib/types/trade-analyzer';
import { getObjectText } from '@/server/storage/r2';

const KTC_R2_KEY = 'trade-analyzer/ktc.json';
const KTC_R2_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  value: number; // superflex value (from KTC's window.playersArray via scripts/refresh-ktc.ts)
}

export type { TradeValue };

// --- Cache ---

interface ValueSources { fantasyCalc: boolean; keepTradeCut: boolean; fcCount: number; ktcCount: number; ktcMatched: number; ktcMatchRate: number }
let cache: { ts: number; data: Record<string, TradeValue>; sources: ValueSources } | null = null; // bump to bust: v7
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

// Parse KTC HTML — handles nested tags (2025 KTC markup)
function parseKTCHtml(html: string): KTCPlayer[] {
  const players: KTCPlayer[] = [];

  // Split on each onePlayer block (start after the first match, skip header)
  const blocks = html.split(/<div\s+class="onePlayer"\s*>/);
  blocks.shift(); // remove everything before first onePlayer

  for (const block of blocks) {
    // The split boundary (<div class="onePlayer">) already isolates each player block.
    // Nested divs mean we must NOT truncate at the first </div>.
    const b = block;

    // Player name: inside <a href="...">Name</a> within <div class="player-name">
    const nameMatch = b.match(/class="player-name"[\s\S]*?<a[^>]*>([^<]+)</);
    if (!nameMatch) continue;
    const playerName = nameMatch[1].trim();

    // Team: separate <span class="player-team">TEAM</span>
    const teamMatch = b.match(/class="player-team"[^>]*>([^<]+)</);
    const team = teamMatch ? teamMatch[1].trim() : '';

    // Superflex value: <div class="value"><p>9999</p></div>
    const valueMatch = b.match(/class="value"[\s\S]*?<p>(\d+)<\/p>/);
    if (!valueMatch) continue;
    const value = parseInt(valueMatch[1].trim(), 10);
    if (!value || isNaN(value)) continue;

    // Position rank e.g. "RB1" inside <p class="position">RB1</p> within <div class="position-team">
    const posMatch = b.match(/class="position-team"[\s\S]*?<p\s+class="position">([A-Z]+\d*)<\/p>/);
    const position = posMatch ? posMatch[1].trim().replace(/\d.*$/, '').toUpperCase() : '';

    // Age: <p class="position hidden-xs">24.3 y.o.</p>
    const ageMatch = b.match(/class="position hidden-xs"[^>]*>([\d.]+)/);
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

// Read KTC from R2 (written by scripts/refresh-ktc.ts on a residential IP).
// Falls back to live scraping if R2 is unavailable or stale.
async function fetchKTC(): Promise<KTCPlayer[]> {
  try {
    const text = await getObjectText({ key: KTC_R2_KEY });
    if (text) {
      const stored = JSON.parse(text) as { players: KTCPlayer[]; updatedAt: string };
      if (stored.players?.length > 0) {
        const age = Date.now() - new Date(stored.updatedAt).getTime();
        if (age < KTC_R2_TTL_MS) {
          console.log(`[trade-analyzer] KTC from R2: ${stored.players.length} players, age ${Math.round(age / 3600000)}h`);
          return stored.players;
        }
        console.log('[trade-analyzer] KTC R2 data is stale, falling back to live scrape');
      }
    }
  } catch (e) {
    console.warn('[trade-analyzer] R2 read failed, falling back to live scrape:', e);
  }
  return scrapeKTCLive();
}

// --- Helpers ---

/** Normalize a player name for fuzzy matching across sources.
 *  Strips punctuation and common generational suffixes (Jr/Sr/II–IV) so that
 *  e.g. "Travis Etienne Jr." (FC) matches "Travis Etienne" (KTC). */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.,-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Standardized draft pick system ---

const PICK_ROUNDS = [1, 2, 3, 4];
const PICK_TIERS = ['Early', 'Mid', 'Late'] as const;
type PickTier = typeof PICK_TIERS[number];

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

/** Map a tier-specific raw pick name from FC/KTC to a standardized key.
 * Generic round picks such as "2027 1st" deliberately return null. */
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

  // Require an explicit tier. Generic FC round values are handled separately.
  const tierMatch = lower.match(/\b(early|mid|late)\b/i);
  if (!tierMatch) return null;
  const tier = `${tierMatch[1][0].toUpperCase()}${tierMatch[1].slice(1).toLowerCase()}`;

  return standardPickKey(year, round, tier);
}

/** Parse a numbered pick like "2026 1.08" or "2026 Pick 1.08" → { year, round, slot }. */
function parseNumberedPick(name: string): { year: string; round: number; slot: number } | null {
  const yearMatch = name.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = yearMatch[1];
  // Match R.SS pattern — e.g. "1.08", "2.05"
  const slotMatch = name.match(/\b(\d)\.(\d{1,2})\b/);
  if (!slotMatch) return null;
  const round = parseInt(slotMatch[1]);
  const slot = parseInt(slotMatch[2]);
  if (round < 1 || round > 4 || slot < 1 || slot > 12) return null;
  return { year, round, slot };
}

/** Parse a generic FantasyCalc pick like "2027 1st" or "2027 Round 1".
 * These are round-level baselines, not Mid-tier picks. */
function parseGenericRoundPick(name: string): { year: string; round: number } | null {
  if (parseNumberedPick(name) || /\b(early|mid|late)\b/i.test(name)) return null;

  const yearMatch = name.match(/(\d{4})/);
  if (!yearMatch) return null;

  const ordinalMatch = name.match(/\b(\d)\s*(st|nd|rd|th)\b/i);
  const roundWordMatch = name.match(/\bround\s*(\d)\b/i);
  const round = ordinalMatch ? parseInt(ordinalMatch[1]) : roundWordMatch ? parseInt(roundWordMatch[1]) : null;
  if (!round || round < 1 || round > 4) return null;

  return { year: yearMatch[1], round };
}

// Slot ranges per tier in a 12-team league
const TIER_SLOTS: Record<PickTier, [number, number]> = {
  Early: [1, 4],
  Mid: [5, 8],
  Late: [9, 12],
};

/** Generate a stable deterministic key for a numbered slot pick like "2026 1.06" → "PICK_2026_1_06". */
function numberedPickKey(year: string, round: number, slot: number): string {
  return `PICK_${year}_${round}_${String(slot).padStart(2, '0')}`;
}

/** Map a numbered pick slot (1-12) to its tier. KTC only prices picks by tier, so a numbered
 *  slot pick ("2026 1.06") borrows the KTC value of its tier ("2026 Mid 1st"). */
function slotToTier(slot: number): PickTier {
  for (const tier of PICK_TIERS) {
    const [min, max] = TIER_SLOTS[tier];
    if (slot >= min && slot <= max) return tier;
  }
  return 'Late';
}

function averageTierSlots(slotData: { slot: number; value: number }[], tier: PickTier): number | null {
  const [minSlot, maxSlot] = TIER_SLOTS[tier];
  const tierPicks = slotData.filter((p) => p.slot >= minSlot && p.slot <= maxSlot);
  return tierPicks.length > 0
    ? Math.round(tierPicks.reduce((sum, p) => sum + p.value, 0) / tierPicks.length)
    : null;
}

/** Build one FantasyCalc tier curve per round from the newest complete set of numbered picks.
 * Generic future-round values closely track the Mid tier, so Early/Late values use the same
 * relative curve as the newest 1.01-1.12 data rather than being left null. */
function buildFantasyCalcTierProfiles(
  numberedPicks: Map<string, { slot: number; value: number }[]>,
): Map<number, Record<PickTier, number>> {
  const profiles = new Map<number, Record<PickTier, number>>();

  for (const round of PICK_ROUNDS) {
    const candidates = Array.from(numberedPicks.entries())
      .map(([key, slots]) => {
        const match = key.match(/^(\d{4})_(\d)$/);
        return match ? { year: parseInt(match[1]), round: parseInt(match[2]), slots } : null;
      })
      .filter((candidate): candidate is { year: number; round: number; slots: { slot: number; value: number }[] } =>
        candidate !== null && candidate.round === round)
      .sort((a, b) => b.year - a.year);

    for (const candidate of candidates) {
      const early = averageTierSlots(candidate.slots, 'Early');
      const mid = averageTierSlots(candidate.slots, 'Mid');
      const late = averageTierSlots(candidate.slots, 'Late');
      if (early === null || mid === null || late === null || mid <= 0) continue;

      profiles.set(round, {
        Early: early / mid,
        Mid: 1,
        Late: late / mid,
      });
      break;
    }
  }

  return profiles;
}

/** After merging source data, ensure we have a complete set of standard picks.
 *  Numbered FC picks are averaged into Early (1-4), Mid (5-8), and Late (9-12).
 *  When a future year only has a generic FC round value, the newest numbered-pick curve
 *  projects Early and Late values around that round-level Mid baseline. */
function ensureStandardPicks(
  result: Record<string, TradeValue>,
  numberedPicks: Map<string, { slot: number; value: number }[]>,
  genericRoundPicks: Map<string, number>,
  ktcByPickKey: Map<string, number>,
): void {
  // Default pick values used only when no source data exists at all
  const defaultRoundValues: Record<number, Record<PickTier, number>> = {
    1: { Early: 7800, Mid: 7000, Late: 5500 },
    2: { Early: 4200, Mid: 3500, Late: 2800 },
    3: { Early: 2200, Mid: 1800, Late: 1400 },
    4: { Early: 1000, Mid: 700, Late: 400 },
  };
  const currentYear = new Date().getFullYear();
  const PICK_YEARS = Array.from({ length: 5 }, (_, i) => String(currentYear + i));
  const tierProfiles = buildFantasyCalcTierProfiles(numberedPicks);

  let rank = Object.keys(result).length + 1;

  for (const year of PICK_YEARS) {
    const yearDelta = Math.max(0, parseInt(year) - currentYear);
    const discount = Math.pow(0.85, yearDelta);

    for (const round of PICK_ROUNDS) {
      const slotData = numberedPicks.get(`${year}_${round}`) ?? [];
      const genericFcValue = genericRoundPicks.get(`${year}_${round}`) ?? null;
      const profile = tierProfiles.get(round);

      for (const tier of PICK_TIERS) {
        const key = standardPickKey(year, round, tier);
        const existing = result[key];
        const ktcVal = ktcByPickKey.get(key) ?? null;
        const directFcValue = averageTierSlots(slotData, tier);
        const projectedFcValue = genericFcValue !== null
          ? Math.round(genericFcValue * (profile?.[tier]
            ?? (defaultRoundValues[round][tier] / defaultRoundValues[round].Mid)))
          : null;
        const fcDerived = directFcValue ?? existing?.fcValue ?? projectedFcValue;

        let value: number;
        if (fcDerived !== null && ktcVal !== null) value = Math.round((fcDerived + ktcVal) / 2);
        else if (ktcVal !== null) value = ktcVal;
        else if (fcDerived !== null) value = fcDerived;
        else value = Math.round((defaultRoundValues[round]?.[tier] ?? 500) * discount);

        result[key] = {
          name: standardPickName(year, round, tier),
          sleeperId: key,
          position: 'PICK',
          team: '',
          value,
          fcValue: fcDerived,
          ktcValue: ktcVal,
          rank: existing?.rank ?? rank++,
          trend: existing?.trend ?? 0,
          isPick: true,
        };
      }

      // Never expose an inverted tier order even if an upstream source briefly publishes bad data.
      const early = result[standardPickKey(year, round, 'Early')];
      const mid = result[standardPickKey(year, round, 'Mid')];
      const late = result[standardPickKey(year, round, 'Late')];
      if (early.value < mid.value) {
        console.warn(`[trade-analyzer] Corrected inverted ${year} ${ORDINAL[round]} values: Early ${early.value} < Mid ${mid.value}`);
        early.value = mid.value;
      }
      if (late.value > mid.value) {
        console.warn(`[trade-analyzer] Corrected inverted ${year} ${ORDINAL[round]} values: Late ${late.value} > Mid ${mid.value}`);
        late.value = mid.value;
      }
    }
  }
}

// --- Merge logic ---

interface MergeStats { playerCount: number; ktcMatched: number }

function mergeValues(fc: FantasyCalcPlayer[], ktc: KTCPlayer[]): { values: Record<string, TradeValue>; stats: MergeStats } {
  const result: Record<string, TradeValue> = {};

  // Both FC and KTC already use a 0-10000 native scale — use raw values directly.
  // Normalizing them independently would collapse both to identical numbers.
  // Players are matched by normalized name. KTC picks come in two shapes:
  //  - numbered slot picks ("2026 Pick 1.01") → matched 1:1 with FC's slot picks
  //  - tier picks ("2026 Mid 1st") → matched to our standardized tier keys
  const ktcByName = new Map<string, number>();
  const ktcByPickKey = new Map<string, number>();
  const ktcBySlot = new Map<string, number>(); // "YYYY_R_SS" → value
  for (const p of ktc) {
    if (isPick(p.playerName)) {
      const num = parseNumberedPick(p.playerName);
      if (num) {
        const slotKey = `${num.year}_${num.round}_${num.slot}`;
        if (!ktcBySlot.has(slotKey)) ktcBySlot.set(slotKey, p.value);
      } else {
        const pk = pickKey(p.playerName);
        if (pk && !ktcByPickKey.has(pk)) ktcByPickKey.set(pk, p.value);
      }
    } else {
      ktcByName.set(normalizeName(p.playerName), p.value);
    }
  }

  // Collect numbered picks for tier averaging and generic future rounds for tier projection.
  const numberedPicks = new Map<string, { slot: number; value: number }[]>();
  const genericRoundPicks = new Map<string, number>();

  let playerCount = 0;
  let ktcMatched = 0;

  // FC is the primary source — Sleeper IDs come from FC
  for (let i = 0; i < fc.length; i++) {
    const p = fc[i];
    const name = p.player.name || '';
    const pick = isPick(name);
    const numbered = pick ? parseNumberedPick(name) : null;
    const genericRound = pick && !numbered ? parseGenericRoundPick(name) : null;
    const tierPickKey = pick && !numbered && !genericRound ? pickKey(name) : null;
    const fcVal = p.value; // raw FC value, 0-10000 scale

    // A generic value such as "2027 1st" is a round baseline, not a Mid-tier asset.
    if (genericRound) {
      genericRoundPicks.set(`${genericRound.year}_${genericRound.round}`, fcVal);
      continue;
    }

    // Ignore unrecognized pick labels instead of leaking them into the selector as fc_pick_* rows.
    if (pick && !numbered && !tierPickKey) continue;

    const key = pick
      ? (numbered ? numberedPickKey(numbered.year, numbered.round, numbered.slot) : tierPickKey!)
      : (p.player.sleeperId || `fc_${p.player.id}`);

    // Resolve the KTC value for this FC entry:
    //  - players: by normalized name
    //  - numbered slot picks: exact KTC slot value, else fall back to the tier's KTC value
    //  - explicit tier picks: by standardized tier key
    let ktcVal: number | null;
    if (!pick) {
      ktcVal = ktcByName.get(normalizeName(name)) ?? null;
    } else if (numbered) {
      ktcVal = ktcBySlot.get(`${numbered.year}_${numbered.round}_${numbered.slot}`)
        ?? ktcByPickKey.get(standardPickKey(numbered.year, numbered.round, slotToTier(numbered.slot)))
        ?? null;
    } else {
      ktcVal = ktcByPickKey.get(tierPickKey!) ?? null;
    }
    const avgValue = ktcVal !== null ? Math.round((fcVal + ktcVal) / 2) : fcVal;

    if (!pick) {
      playerCount++;
      if (ktcVal !== null) ktcMatched++;
    }

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

    // If this is a numbered pick (R.SS format), collect its pure FC value for tier averaging.
    if (numbered) {
      const mapKey = `${numbered.year}_${numbered.round}`;
      if (!numberedPicks.has(mapKey)) numberedPicks.set(mapKey, []);
      numberedPicks.get(mapKey)!.push({ slot: numbered.slot, value: fcVal });
    }
  }

  // Ensure a complete set of standardized picks with consistent FC treatment for every tier.
  ensureStandardPicks(result, numberedPicks, genericRoundPicks, ktcByPickKey);

  return { values: result, stats: { playerCount, ktcMatched } };
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

  const { values: merged, stats } = mergeValues(fc, ktc);

  const ktcMatchRate = stats.playerCount > 0 ? Math.round((stats.ktcMatched / stats.playerCount) * 100) : 0;
  const sources: ValueSources = {
    fantasyCalc: fcOk,
    keepTradeCut: ktcOk,
    fcCount: fc.length,
    ktcCount: ktc.length,
    ktcMatched: stats.ktcMatched,
    ktcMatchRate,
  };
  if (ktcOk) {
    console.log(`[trade-analyzer] FC↔KTC name match: ${stats.ktcMatched}/${stats.playerCount} players (${ktcMatchRate}%)`);
  }
  cache = { ts: Date.now(), data: merged, sources };

  return NextResponse.json({
    values: merged,
    cached: false,
    sources,
    count: Object.keys(merged).length,
    updatedAt: new Date().toISOString(),
  });
}

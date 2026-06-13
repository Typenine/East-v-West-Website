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
let cache: { ts: number; data: Record<string, TradeValue>; sources: ValueSources } | null = null; // bump to bust: v6
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

const PICK_YEARS = ['2026', '2027', '2028', '2029', '2030'];
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
  if (round < 1 || round > 4 || slot < 1 || slot > 36) return null;
  return { year, round, slot };
}

// Slot ranges per tier in a 12-team league
const TIER_SLOTS: Record<string, [number, number]> = {
  Early: [1, 4],
  Mid: [5, 8],
  Late: [9, 12],
};

/** Map a numbered pick slot (1-12) to its tier. KTC only prices picks by tier, so a numbered
 *  slot pick ("2026 1.06") borrows the KTC value of its tier ("2026 Mid 1st"). */
function slotToTier(slot: number): string {
  for (const [tier, [min, max]] of Object.entries(TIER_SLOTS)) {
    if (slot >= min && slot <= max) return tier;
  }
  return 'Late';
}

/** After merging source data, ensure we have a complete set of standard picks.
 *  numberedPicks: map from "YYYY_R" → list of { slot, value } from real numbered FC picks (e.g. 1.01–1.12).
 *  ktcByPickKey: standardized-key → KTC value for KTC's "YYYY Early/Mid/Late Nth" rookie picks.
 *  Tier values blend FC (numbered-slot average) and KTC where both exist, falling back to
 *  whichever source is present, and finally to hardcoded defaults with a future-year discount. */
function ensureStandardPicks(
  result: Record<string, TradeValue>,
  numberedPicks: Map<string, { slot: number; value: number }[]>,
  ktcByPickKey: Map<string, number>,
): void {
  // Default pick values used only when no source data exists at all
  const defaultRoundValues: Record<number, Record<string, number>> = {
    1: { Early: 7800, Mid: 7000, Late: 5500 },
    2: { Early: 4200, Mid: 3500, Late: 2800 },
    3: { Early: 2200, Mid: 1800, Late: 1400 },
    4: { Early: 1000, Mid: 700, Late: 400 },
  };
  const currentYear = new Date().getFullYear();

  let rank = Object.keys(result).length + 1;

  for (const year of PICK_YEARS) {
    const yearDelta = Math.max(0, parseInt(year) - currentYear);
    const discount = Math.pow(0.85, yearDelta);

    for (const round of PICK_ROUNDS) {
      const slotData = numberedPicks.get(`${year}_${round}`) ?? [];

      for (const tier of PICK_TIERS) {
        const key = standardPickKey(year, round, tier);
        const ktcVal = ktcByPickKey.get(key) ?? null;

        // Pick already came from FC: backfill its KTC value if FC didn't match one by key.
        if (result[key]) {
          result[key].name = standardPickName(year, round, tier);
          if (ktcVal !== null && result[key].ktcValue === null) {
            result[key].ktcValue = ktcVal;
            result[key].value = result[key].fcValue !== null
              ? Math.round((result[key].fcValue + ktcVal) / 2)
              : ktcVal;
          }
          continue;
        }

        // No FC entry for this key — derive an FC value from numbered slot picks if any.
        const [minSlot, maxSlot] = TIER_SLOTS[tier];
        const tierPicks = slotData.filter((p) => p.slot >= minSlot && p.slot <= maxSlot);
        const fcDerived = tierPicks.length > 0
          ? Math.round(tierPicks.reduce((s, p) => s + p.value, 0) / tierPicks.length)
          : null;

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
          rank: rank++,
          trend: 0,
          isPick: true,
        };
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

  // Collect numbered picks (e.g. "2026 1.08") grouped by "YYYY_R" for tier averaging
  const numberedPicks = new Map<string, { slot: number; value: number }[]>();

  let playerCount = 0;
  let ktcMatched = 0;

  // FC is the primary source — Sleeper IDs come from FC
  for (let i = 0; i < fc.length; i++) {
    const p = fc[i];
    const name = p.player.name || '';
    const pick = isPick(name);
    const key = pick ? (pickKey(name) || `fc_pick_${i}`) : (p.player.sleeperId || `fc_${p.player.id}`);

    // Resolve the KTC value for this FC entry:
    //  - players: by normalized name
    //  - numbered slot picks: exact KTC slot value, else fall back to the tier's KTC value
    //  - tier picks: by standardized tier key
    const numbered = pick ? parseNumberedPick(name) : null;
    const fcVal = p.value; // raw FC value, 0-10000 scale
    let ktcVal: number | null;
    if (!pick) {
      ktcVal = ktcByName.get(normalizeName(name)) ?? null;
    } else if (numbered) {
      ktcVal = ktcBySlot.get(`${numbered.year}_${numbered.round}_${numbered.slot}`)
        ?? ktcByPickKey.get(standardPickKey(numbered.year, numbered.round, slotToTier(numbered.slot)))
        ?? null;
    } else {
      const pk = pickKey(name);
      ktcVal = pk ? (ktcByPickKey.get(pk) ?? null) : null;
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

    // If this is a numbered pick (R.SS format), collect its pure FC value for tier averaging
    if (numbered) {
      const mapKey = `${numbered.year}_${numbered.round}`;
      if (!numberedPicks.has(mapKey)) numberedPicks.set(mapKey, []);
      numberedPicks.get(mapKey)!.push({ slot: numbered.slot, value: fcVal });
    }
  }

  // Ensure a complete set of standardized picks, blending FC slot data and KTC pick values
  ensureStandardPicks(result, numberedPicks, ktcByPickKey);

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

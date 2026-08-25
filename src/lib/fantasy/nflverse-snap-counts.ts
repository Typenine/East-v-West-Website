import { normalizeTeamCode } from '@/lib/constants/nfl-teams';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';

export type RecentSnapUsage = {
  games: number;
  recentSnapPct: number;
  latestTeam: string | null;
  sameTeamGames: number;
};

type SnapRow = {
  season: number;
  week: number;
  player: string;
  position: string;
  team: string;
  offenseSnaps: number;
  offensePct: number;
};

const TTL_MS = 6 * 60 * 60 * 1000;
const seasonCache = new Map<number, { ts: number; rows: SnapRow[] }>();

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parsePct(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0, Math.min(1, parsed > 1.2 ? parsed / 100 : parsed));
}

function parseSnapRows(csv: string): SnapRow[] {
  const rows = csvRows(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  const out: SnapRow[] = [];
  for (const values of rows.slice(1)) {
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[header] = values[index] ?? ''; });
    if (String(raw.game_type || '').toUpperCase() !== 'REG') continue;
    const season = Number(raw.season);
    const week = Number(raw.week);
    const player = String(raw.player || '').trim();
    const position = String(raw.position || '').toUpperCase();
    const team = normalizeTeamCode(raw.team) || '';
    const offenseSnaps = Number(raw.offense_snaps || 0);
    const offensePct = parsePct(raw.offense_pct);
    if (!season || !week || !player || !team || !position || (!offenseSnaps && !offensePct)) continue;
    out.push({ season, week, player, position, team, offenseSnaps, offensePct });
  }
  return out;
}

async function loadSeasonSnapCounts(season: number): Promise<SnapRow[]> {
  const cached = seasonCache.get(season);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.rows;
  const url = `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error(`nflverse snap counts HTTP ${response.status}`);
    const rows = parseSnapRows(await response.text());
    seasonCache.set(season, { ts: Date.now(), rows });
    return rows;
  } catch (error) {
    console.warn('[weekly-projection-engine] nflverse snap counts unavailable', { season, error });
    seasonCache.set(season, { ts: Date.now(), rows: [] });
    return [];
  }
}

function playerDisplayName(player: SleeperPlayer | undefined): string {
  return `${player?.first_name || ''} ${player?.last_name || ''}`.trim();
}

export async function loadRecentSnapUsage(args: {
  season: number;
  throughWeek: number;
  playerIds: string[];
  playerMap: Record<string, SleeperPlayer>;
  teamByPlayer?: Map<string, string | null>;
}): Promise<Map<string, RecentSnapUsage>> {
  const [previousRows, currentRows] = await Promise.all([
    loadSeasonSnapCounts(args.season - 1),
    args.throughWeek > 0 ? loadSeasonSnapCounts(args.season) : Promise.resolve([] as SnapRow[]),
  ]);
  const allowed = [
    ...previousRows,
    ...currentRows.filter((row) => row.week <= args.throughWeek),
  ];
  const byNamePosition = new Map<string, SnapRow[]>();
  for (const row of allowed) {
    const key = `${normalizeName(row.player)}|${row.position}`;
    const list = byNamePosition.get(key) || [];
    list.push(row);
    byNamePosition.set(key, list);
  }
  for (const list of byNamePosition.values()) {
    list.sort((a, b) => (a.season - b.season) || (a.week - b.week));
  }

  const out = new Map<string, RecentSnapUsage>();
  for (const playerId of args.playerIds) {
    const player = args.playerMap[playerId];
    const name = normalizeName(playerDisplayName(player));
    const position = String(player?.position || '').toUpperCase();
    if (!name || !position) continue;
    const currentTeam = args.teamByPlayer?.get(playerId) || normalizeTeamCode(player?.team) || null;
    const samples = (byNamePosition.get(`${name}|${position}`) || []).slice(-6);
    if (!samples.length) continue;
    const latest = samples.at(-1)!;
    const weighted = samples.map((row, index) => {
      const age = samples.length - 1 - index;
      const continuity = currentTeam && row.team !== currentTeam ? 0.62 : 1;
      return { row, weight: Math.exp(-Math.log(2) * age / 3.5) * continuity };
    });
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) continue;
    const recentSnapPct = weighted.reduce((sum, entry) => sum + entry.row.offensePct * entry.weight, 0) / totalWeight;
    out.set(playerId, {
      games: samples.length,
      recentSnapPct: Number(recentSnapPct.toFixed(3)),
      latestTeam: latest.team || null,
      sameTeamGames: currentTeam ? samples.filter((row) => row.team === currentTeam).length : 0,
    });
  }
  return out;
}

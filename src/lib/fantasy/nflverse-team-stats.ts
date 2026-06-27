import { normalizeTeamCode } from '@/lib/constants/nfl-teams';

export type NflverseTeamWeek = {
  season: number;
  week: number;
  team: string;
  opponent: string | null;
  passAttempts: number;
  rushAttempts: number;
  passYards: number;
  rushYards: number;
  passTouchdowns: number;
  rushTouchdowns: number;
  interceptions: number;
  sacksAllowed: number;
  completions?: number;
  passFirstDowns?: number;
  rushFirstDowns?: number;
  passEpaPerPlay?: number;
  rushEpaPerPlay?: number;
  neutralPassRate?: number;
  secondsPerPlay?: number;
  redZonePassAttempts?: number;
  redZoneRushAttempts?: number;
};

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<number, { ts: number; rows: NflverseTeamWeek[] }>();

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

function numberFrom(row: Record<string, string>, ...keys: string[]): number {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function optionalNumberFrom(row: Record<string, string>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringFrom(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function perPlayValue(args: {
  row: Record<string, string>;
  attempts: number;
  perPlayKeys: string[];
  totalKeys: string[];
}): number | undefined {
  const direct = optionalNumberFrom(args.row, ...args.perPlayKeys);
  if (direct != null) return direct;
  const total = optionalNumberFrom(args.row, ...args.totalKeys);
  if (total == null || args.attempts <= 0) return undefined;
  return total / args.attempts;
}

function parseTeamStats(csv: string): NflverseTeamWeek[] {
  const rows = csvRows(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  const out: NflverseTeamWeek[] = [];
  for (const values of rows.slice(1)) {
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[header] = values[index] ?? ''; });
    const team = normalizeTeamCode(stringFrom(raw, 'team', 'recent_team'));
    const season = numberFrom(raw, 'season');
    const week = numberFrom(raw, 'week');
    if (!team || !season || !week) continue;
    const passAttempts = numberFrom(raw, 'attempts', 'passing_attempts');
    const rushAttempts = numberFrom(raw, 'carries', 'rushing_attempts');
    out.push({
      season,
      week,
      team,
      opponent: normalizeTeamCode(stringFrom(raw, 'opponent_team', 'opponent')) || null,
      passAttempts,
      rushAttempts,
      passYards: numberFrom(raw, 'passing_yards'),
      rushYards: numberFrom(raw, 'rushing_yards'),
      passTouchdowns: numberFrom(raw, 'passing_tds', 'passing_touchdowns'),
      rushTouchdowns: numberFrom(raw, 'rushing_tds', 'rushing_touchdowns'),
      interceptions: numberFrom(raw, 'interceptions'),
      sacksAllowed: numberFrom(raw, 'sacks_suffered', 'sacks'),
      completions: optionalNumberFrom(raw, 'completions', 'passing_completions'),
      passFirstDowns: optionalNumberFrom(raw, 'passing_first_downs', 'pass_first_downs'),
      rushFirstDowns: optionalNumberFrom(raw, 'rushing_first_downs', 'rush_first_downs'),
      passEpaPerPlay: perPlayValue({
        row: raw,
        attempts: passAttempts,
        perPlayKeys: ['passing_epa_per_play', 'pass_epa_per_play'],
        totalKeys: ['passing_epa', 'pass_epa'],
      }),
      rushEpaPerPlay: perPlayValue({
        row: raw,
        attempts: rushAttempts,
        perPlayKeys: ['rushing_epa_per_play', 'rush_epa_per_play'],
        totalKeys: ['rushing_epa', 'rush_epa'],
      }),
      neutralPassRate: optionalNumberFrom(raw, 'neutral_pass_rate', 'neutral_situation_pass_rate'),
      secondsPerPlay: optionalNumberFrom(raw, 'seconds_per_play', 'pace_seconds_per_play'),
      redZonePassAttempts: optionalNumberFrom(raw, 'red_zone_pass_attempts', 'rz_pass_attempts'),
      redZoneRushAttempts: optionalNumberFrom(raw, 'red_zone_rush_attempts', 'rz_rush_attempts'),
    });
  }
  return out;
}

export async function loadNflverseTeamWeeks(season: number): Promise<NflverseTeamWeek[]> {
  const cached = cache.get(season);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.rows;
  const url = `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`;
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error(`nflverse team stats HTTP ${response.status}`);
    const rows = parseTeamStats(await response.text());
    cache.set(season, { ts: Date.now(), rows });
    return rows;
  } catch (error) {
    console.warn('[weekly-projections] nflverse team stats unavailable', { season, error });
    cache.set(season, { ts: Date.now(), rows: [] });
    return [];
  }
}

export function filterCompletedTeamWeeks(
  rows: NflverseTeamWeek[],
  throughWeek: number,
): NflverseTeamWeek[] {
  return rows.filter((row) => row.week <= throughWeek);
}

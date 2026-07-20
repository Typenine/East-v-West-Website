const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS',
] as const;

interface EspnScoreboard {
  events?: Array<{
    competitions?: Array<{
      competitors?: Array<{
        team?: { abbreviation?: string };
      }>;
    }>;
  }>;
}

const cache = new Map<string, { expiresAt: number; teams: string[] }>();

function normalizeTeam(value: string | undefined): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'WSH') return 'WAS';
  if (upper === 'JAC') return 'JAX';
  if (upper === 'LA') return 'LAR';
  return NFL_TEAMS.includes(upper as typeof NFL_TEAMS[number]) ? upper : null;
}

/**
 * Derive bye teams from the requested season/week's published NFL schedule.
 * Empty data is safer than stale data: if the schedule cannot be verified, the
 * function returns [] instead of falling back to an older season's bye table.
 */
export async function getNflByeTeams(season: number, week: number): Promise<string[]> {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) return [];
  const key = `${season}:${week}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.teams;

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}&limit=100`;
    const response = await fetch(url, { next: { revalidate: 6 * 60 * 60 } });
    if (!response.ok) throw new Error(`ESPN schedule returned ${response.status}`);
    const data = await response.json() as EspnScoreboard;
    const playing = new Set<string>();
    for (const event of data.events ?? []) {
      for (const competition of event.competitions ?? []) {
        for (const competitor of competition.competitors ?? []) {
          const team = normalizeTeam(competitor.team?.abbreviation);
          if (team) playing.add(team);
        }
      }
    }

    // A valid regular-season week should contain at least 12 games / 24 teams.
    // This guard prevents an incomplete upstream response from labeling half the
    // league as being on bye.
    const teams = playing.size >= 24
      ? NFL_TEAMS.filter(team => !playing.has(team))
      : [];
    cache.set(key, { expiresAt: now + 6 * 60 * 60 * 1000, teams: [...teams] });
    return [...teams];
  } catch (error) {
    console.warn(`[Newsletter] Unable to verify NFL bye teams for ${season} week ${week}:`, error);
    cache.set(key, { expiresAt: now + 15 * 60 * 1000, teams: [] });
    return [];
  }
}

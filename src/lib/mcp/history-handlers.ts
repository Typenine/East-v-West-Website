import { CHAMPIONS, TEAM_NAMES } from '@/lib/constants/league';
import { getHallOfFameIndex } from '@/lib/hall-of-fame/service';
import { buildLeagueMilestones, type LeagueMilestoneType } from '@/lib/history/league-history';
import { mcpMeta } from '@/lib/mcp/auth';
import { resolveTeam } from '@/lib/mcp/team-resolver';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';

function clampLimit(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function resolveOptionalTeam(team: unknown): string | null {
  const raw = typeof team === 'string' ? team.trim() : '';
  if (!raw) return null;
  const resolution = resolveTeam(raw, TEAM_NAMES);
  return resolution.matchedTeam;
}

export async function handleGetHallOfFame(input: Record<string, unknown>) {
  const index = await getHallOfFameIndex();
  const requestedTeam = typeof input.team === 'string' ? input.team.trim() : '';
  const team = resolveOptionalTeam(input.team);
  const playerQuery = typeof input.player === 'string'
    ? input.player.trim().toLowerCase()
    : typeof input.name === 'string'
      ? input.name.trim().toLowerCase()
      : '';
  const inductionYear = Number(input.induction_year ?? input.inductionYear);
  const hasYear = Number.isInteger(inductionYear);
  const limit = clampLimit(input.limit, 100);

  let entries = index.entries;
  if (requestedTeam && !team) {
    return {
      meta: mcpMeta('get_hall_of_fame', {
        dataSource: 'team_hall_of_fame + canonical EVW player history',
        fetchedAt: new Date().toISOString(),
      }),
      matchResolution: { requestedTeam, matchedTeam: null },
      franchises: index.franchises.map((franchise) => ({ ...franchise, inducteeCount: 0 })),
      entries: [],
    };
  }
  if (team) entries = entries.filter((entry) => entry.franchiseName === team);
  if (playerQuery) entries = entries.filter((entry) => entry.playerName.toLowerCase().includes(playerQuery));
  if (hasYear) entries = entries.filter((entry) => entry.inductionYear === inductionYear);

  entries = [...entries]
    .sort((a, b) => b.inductionYear - a.inductionYear || a.franchiseName.localeCompare(b.franchiseName) || a.playerName.localeCompare(b.playerName))
    .slice(0, limit);

  const counts = new Map<string, number>();
  for (const entry of index.entries) counts.set(entry.franchiseName, (counts.get(entry.franchiseName) || 0) + 1);

  return {
    meta: mcpMeta('get_hall_of_fame', {
      dataSource: 'team_hall_of_fame + canonical EVW player history',
      fetchedAt: new Date().toISOString(),
      note: 'Hall of Fame production is franchise-specific EVW production while rostered by the inducting franchise.',
    }),
    matchResolution: requestedTeam ? { requestedTeam, matchedTeam: team } : null,
    filters: {
      team,
      player: playerQuery || null,
      inductionYear: hasYear ? inductionYear : null,
      limit,
    },
    franchises: index.franchises.map((franchise) => ({
      ...franchise,
      inducteeCount: counts.get(franchise.franchiseName) || 0,
    })),
    entries,
  };
}

export async function handleGetLeagueMilestones(input: Record<string, unknown>) {
  const dataset = await getLeagueStatsDatasetV3();
  const requestedTeam = typeof input.team === 'string' ? input.team.trim() : '';
  const team = resolveOptionalTeam(input.team);
  const playerQuery = typeof input.player === 'string'
    ? input.player.trim().toLowerCase()
    : typeof input.name === 'string'
      ? input.name.trim().toLowerCase()
      : '';
  const season = typeof input.season === 'string' ? input.season.trim() : '';
  const typeRaw = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
  const allowedTypes = new Set<LeagueMilestoneType>(['player', 'franchise', 'record', 'championship']);
  const type = allowedTypes.has(typeRaw as LeagueMilestoneType) ? typeRaw as LeagueMilestoneType : null;
  const limit = clampLimit(input.limit, 50);

  let milestones = buildLeagueMilestones(dataset);
  if (requestedTeam && !team) milestones = [];
  if (team) milestones = milestones.filter((row) => row.teamName === team);
  if (season) milestones = milestones.filter((row) => row.season === season);
  if (type) milestones = milestones.filter((row) => row.type === type);
  if (playerQuery) {
    milestones = milestones.filter((row) =>
      row.type === 'player' && `${row.title} ${row.detail}`.toLowerCase().includes(playerQuery),
    );
  }

  milestones = [...milestones]
    .sort((a, b) => b.season.localeCompare(a.season) || (b.week ?? 0) - (a.week ?? 0) || a.title.localeCompare(b.title));

  const counts = milestones.reduce<Record<string, number>>((acc, row) => {
    acc[row.type] = (acc[row.type] || 0) + 1;
    return acc;
  }, {});

  return {
    meta: mcpMeta('get_league_milestones', {
      dataSource: 'league-stats-v3 + league-history milestone engine',
      seasons: dataset.seasons,
      fetchedAt: new Date().toISOString(),
      note: 'Playoff milestones exclude Toilet Bowl results. Player scoring milestones use ownership-attributed EVW points.',
    }),
    matchResolution: requestedTeam ? { requestedTeam, matchedTeam: team } : null,
    filters: {
      team,
      player: playerQuery || null,
      season: season || null,
      type,
      limit,
    },
    counts,
    champions: CHAMPIONS,
    milestones: milestones.slice(0, limit),
  };
}

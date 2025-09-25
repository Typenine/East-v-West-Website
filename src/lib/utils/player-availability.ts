import { normalizeName } from "@/lib/constants/team-mapping";
import { getEspnDepthForTeam, type EspnDepthEntry } from "@/lib/utils/espn-depth";
import {
  getAllPlayersCached,
  getLeagueMatchups,
  getSleeperInjuriesCached,
  resolveAvailabilityFromSleeper,
  type PlayerAvailabilityInfo,
  type PlayerAvailabilityTier,
  type SleeperInjury,
  type SleeperMatchup,
  type SleeperPlayer,
} from "@/lib/utils/sleeper-api";

export interface PlayerAvailabilityEntry extends PlayerAvailabilityInfo {
  weight: number;
}

export interface AvailabilitySnapshotArgs {
  leagueId: string;
  uptoWeek: number;
  playerIds: string[];
}

const tierBaseWeight: Record<PlayerAvailabilityTier, number> = {
  starter: 1,
  primary_backup: 0.5,
  rotational: 0.3,
  inactive: 0,
  unknown: 0.65,
};

interface TeamDepthMaps {
  byName: Map<string, EspnDepthEntry>;
}

function buildDepthMaps(entries: EspnDepthEntry[]): TeamDepthMaps {
  const byName = new Map<string, EspnDepthEntry>();
  for (const entry of entries) {
    byName.set(entry.normalizedName, entry);
  }
  return { byName };
}

async function loadEspnDepth(teamCodes: string[]): Promise<Map<string, TeamDepthMaps>> {
  const out = new Map<string, TeamDepthMaps>();
  await Promise.all(teamCodes.map(async (code) => {
    try {
      const entries = await getEspnDepthForTeam(code);
      out.set(code, buildDepthMaps(entries));
    } catch {
      out.set(code, buildDepthMaps([]));
    }
  }));
  return out;
}

async function buildLineupStarts(leagueId: string, uptoWeek: number, targetIds: Set<string>): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const weeks = Array.from({ length: Math.max(0, uptoWeek - 1) }, (_, i) => i + 1);
  await Promise.all(weeks.map(async (week) => {
    const matchups = await getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]);
    for (const m of matchups) {
      const starters = Array.isArray(m.starters) ? m.starters : [];
      for (const pid of starters) {
        if (!pid || pid === "0" || !targetIds.has(pid)) continue;
        counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
    }
  }));
  return counts;
}

function adjustByEspnDepth(entry: PlayerAvailabilityEntry, espn: EspnDepthEntry | undefined) {
  if (!espn) return;
  const { order } = espn;
  if (order === 1 && entry.tier !== "starter") {
    entry.tier = "starter";
    entry.reasons.push("espn-depth-1");
  } else if (order === 2 && entry.tier === "unknown") {
    entry.tier = "primary_backup";
    entry.reasons.push("espn-depth-2");
  } else if (order && order <= 3 && entry.tier === "unknown") {
    entry.tier = "rotational";
    entry.reasons.push(`espn-depth-${order}`);
  }
}

function adjustByLineupStarts(entry: PlayerAvailabilityEntry, starts: number, weeksConsidered: number) {
  if (weeksConsidered <= 0) return;
  if (starts === 0 && entry.tier === "starter") {
    entry.reasons.push("lineup-no-starts");
    entry.weight *= 0.7;
    return;
  }
  const threshold = Math.max(1, Math.ceil(weeksConsidered * 0.4));
  if (starts >= threshold && entry.tier !== "starter") {
    entry.tier = "starter";
    entry.reasons.push(`lineup-starts-${starts}`);
  }
}

function adjustForInjury(entry: PlayerAvailabilityEntry, injury: SleeperInjury | undefined) {
  const status = injury?.status?.toLowerCase();
  if (!status) return;
  if (status === "questionable") {
    entry.weight *= 0.85;
    entry.reasons.push("injury-Q");
  } else if (status === "doubtful") {
    entry.weight *= 0.5;
    entry.reasons.push("injury-D");
    if (entry.tier !== "inactive") entry.tier = "rotational";
  }
  const practice = injury?.practice_participation?.toLowerCase();
  if (practice && practice.includes("dnp")) {
    entry.weight *= 0.75;
    entry.reasons.push("practice-DNP");
  }
}

function ensureWeightForTier(entry: PlayerAvailabilityEntry) {
  const base = tierBaseWeight[entry.tier] ?? 0.6;
  entry.weight = Math.max(0, Math.min(1, entry.weight * base));
}

export async function buildPlayerAvailabilitySnapshot(args: AvailabilitySnapshotArgs): Promise<Record<string, PlayerAvailabilityEntry>> {
  const { leagueId, uptoWeek, playerIds } = args;
  if (playerIds.length === 0) return {};
  const targetIds = new Set(playerIds);
  const [players, injuries, lineupStarts] = await Promise.all([
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getSleeperInjuriesCached().catch(() => [] as SleeperInjury[]),
    buildLineupStarts(leagueId, uptoWeek, targetIds),
  ]);

  const injuryMap = new Map(injuries.map((inj) => [inj.player_id, inj]));

  const teamCodes = Array.from(new Set(playerIds.map((pid) => players[pid]?.team?.toUpperCase()).filter(Boolean))) as string[];
  const espnDepth = await loadEspnDepth(teamCodes);

  const result: Record<string, PlayerAvailabilityEntry> = {};
  const weeksConsidered = Math.max(0, uptoWeek - 1);

  for (const pid of playerIds) {
    const player = players[pid];
    const injury = injuryMap.get(pid);
    const base = resolveAvailabilityFromSleeper(player, injury);
    const entry: PlayerAvailabilityEntry = {
      tier: base.tier,
      reasons: [...base.reasons],
      weight: 1,
    };

    const teamCode = player?.team?.toUpperCase();
    if (teamCode) {
      const depthMaps = espnDepth.get(teamCode);
      if (depthMaps) {
        const nameKey = normalizeName(`${player?.first_name || ""} ${player?.last_name || ""}`);
        const depthEntry = depthMaps.byName.get(nameKey);
        adjustByEspnDepth(entry, depthEntry);
      }
    }

    const starts = lineupStarts.get(pid) ?? 0;
    adjustByLineupStarts(entry, starts, weeksConsidered);
    adjustForInjury(entry, injury);
    ensureWeightForTier(entry);

    // Clamp to [0,1]
    entry.weight = Math.max(0, Math.min(1, Number(entry.weight.toFixed(3))));

    if (entry.reasons.length === 0) entry.reasons.push('no-flags');
    result[pid] = entry;
  }

  return result;
}

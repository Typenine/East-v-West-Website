import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { PlayerProjectionCandidate, UsageProfile } from '@/lib/fantasy/projection-opportunity-types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function weightedMean(values: Array<{ value: number; weight: number }>, fallback: number): number {
  const usable = values.filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);
  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return fallback;
  return usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / total;
}

function statTeam(stats: Record<string, number | string | undefined>): string | null {
  const value = String(stats.team || stats.recent_team || stats.player_team || '').trim().toUpperCase();
  return value || null;
}

export function buildUsageProfile(candidate: PlayerProjectionCandidate): UsageProfile {
  const ordered = [...candidate.games].sort((a, b) => (a.season - b.season) || (a.week - b.week));
  const latestSeason = ordered.at(-1)?.season ?? 0;
  const latestWeek = ordered.filter((game) => game.season === latestSeason).at(-1)?.week ?? 1;
  const samples = ordered.filter((game) => {
    const stats = game.stats;
    return finite(stats.rec_tgt) + finite(stats.rush_att) + finite(stats.pass_att) > 0;
  });
  const currentTeam = String(candidate.player?.team || candidate.base.nflTeam || '').toUpperCase() || null;
  const weighted = samples.map((game) => {
    const age = ((latestSeason - game.season) * 18) + Math.max(0, latestWeek - game.week);
    const gameTeam = statTeam(game.stats);
    const teamContinuity = currentTeam && gameTeam && gameTeam !== currentTeam ? 0.42 : 1;
    return { game, weight: Math.exp(-Math.log(2) * age / 6) * teamContinuity };
  });
  const averageStat = (key: string) => weightedMean(
    weighted.map(({ game, weight }) => ({ value: finite(game.stats[key]), weight })),
    0,
  );
  const latestTeam = [...samples].reverse().map((game) => statTeam(game.stats)).find(Boolean) || null;
  const changedTeams = Boolean(currentTeam && samples.some((game) => {
    const gameTeam = statTeam(game.stats);
    return Boolean(gameTeam && gameTeam !== currentTeam);
  }));
  const rookieYear = Number(candidate.player?.rookie_year || 0);
  const projectionSeason = candidate.projectionSeason || new Date().getFullYear();
  const rookie = rookieYear > 0
    ? rookieYear === projectionSeason
    : Number(candidate.player?.years_exp ?? 0) === 0;
  const sampleTrust = clamp(samples.length / 8, 0, 0.88);
  return {
    sampleGames: samples.length,
    recentTargets: averageStat('rec_tgt'),
    recentCarries: averageStat('rush_att'),
    recentPassAttempts: averageStat('pass_att'),
    latestTeam,
    changedTeams,
    rookie,
    historyTrust: changedTeams ? sampleTrust * 0.48 : sampleTrust,
  };
}

function draftCapitalFactor(player: SleeperPlayer | undefined): number {
  const round = Number((player as (SleeperPlayer & { draft_round?: number | string }) | undefined)?.draft_round || 0);
  if (round === 1) return 1.35;
  if (round === 2) return 1.18;
  if (round === 3) return 1.08;
  if (round >= 4) return 0.93;
  return 1;
}

export function targetPrior(candidate: PlayerProjectionCandidate, profile: UsageProfile): number {
  const position = candidate.base.position;
  const starter = candidate.override?.startProbability ?? candidate.base.startProbability;
  const rolePrior = position === 'WR'
    ? 2.1 + (starter * 5.4)
    : position === 'TE'
      ? 1.4 + (starter * 4.3)
      : position === 'RB'
        ? 0.9 + (starter * 2.9)
        : 0;
  const rookieBoost = profile.rookie ? draftCapitalFactor(candidate.player) : 1;
  return Math.max(0.05, ((profile.recentTargets * profile.historyTrust) + (rolePrior * (1 - profile.historyTrust))) * rookieBoost);
}

export function carryPrior(candidate: PlayerProjectionCandidate, profile: UsageProfile): number {
  const position = candidate.base.position;
  const starter = candidate.override?.startProbability ?? candidate.base.startProbability;
  const rolePrior = position === 'RB'
    ? 2.5 + (starter * 12.5)
    : position === 'QB'
      ? 0.8 + (Math.min(profile.recentCarries || 3.5, 9) * 0.7)
      : position === 'WR'
        ? 0.08 + (profile.recentCarries * 0.72)
        : 0;
  const rookieBoost = profile.rookie && position === 'RB' ? draftCapitalFactor(candidate.player) : 1;
  return Math.max(0.02, ((profile.recentCarries * profile.historyTrust) + (rolePrior * (1 - profile.historyTrust))) * rookieBoost);
}

export function passPrior(candidate: PlayerProjectionCandidate, profile: UsageProfile): number {
  if (candidate.base.position !== 'QB') return 0;
  const startProbability = clamp(candidate.override?.startProbability ?? candidate.base.startProbability, 0, 1);
  const rolePrior = 2 + (startProbability * 32);
  const blended = (profile.recentPassAttempts * profile.historyTrust) + (rolePrior * (1 - profile.historyTrust));
  const startingWeight = 0.03 + (0.97 * Math.pow(startProbability, 2.35));
  return Math.max(0.01, blended * startingWeight);
}

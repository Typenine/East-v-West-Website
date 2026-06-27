import type { NflverseTeamWeek } from '@/lib/fantasy/nflverse-team-stats';
import type { ProjectionOverrideRecord } from '@/lib/fantasy/projection-overrides';
import type { PlayerProjectionCandidate, TeamOpportunityPlan } from '@/lib/fantasy/projection-opportunity-types';
import { buildUsageProfile, clamp, weightedMean } from '@/lib/fantasy/projection-usage';

const LEAGUE_PRIOR = { passAttempts: 34, rushAttempts: 27, passEpaPerPlay: 0, rushEpaPerPlay: 0 };

function recentAverage(rows: NflverseTeamWeek[], key: keyof NflverseTeamWeek, fallback: number): number {
  if (!rows.length) return fallback;
  return weightedMean(rows.map((row, index) => {
    const parsed = Number(row[key]);
    return {
      value: parsed,
      weight: Number.isFinite(parsed) ? Math.exp(-Math.log(2) * (rows.length - 1 - index) / 5) : 0,
    };
  }), fallback);
}

export function projectTeamOpportunityPlan(args: {
  team: string;
  currentRows: NflverseTeamWeek[];
  previousRows: NflverseTeamWeek[];
  candidates: PlayerProjectionCandidate[];
  preseason: boolean;
  teamOverride?: ProjectionOverrideRecord;
}): TeamOpportunityPlan {
  const { currentRows, previousRows, candidates, teamOverride } = args;
  const previousPass = recentAverage(previousRows, 'passAttempts', LEAGUE_PRIOR.passAttempts);
  const previousRush = recentAverage(previousRows, 'rushAttempts', LEAGUE_PRIOR.rushAttempts);
  const currentPass = recentAverage(currentRows, 'passAttempts', previousPass);
  const currentRush = recentAverage(currentRows, 'rushAttempts', previousRush);
  let passAttempts: number;
  let rushAttempts: number;
  let source: TeamOpportunityPlan['source'];
  let uncertaintyMultiplier = 1;

  if (currentRows.length >= 4) {
    passAttempts = (currentPass * 0.78) + (previousPass * 0.22);
    rushAttempts = (currentRush * 0.78) + (previousRush * 0.22);
    source = 'current-season';
  } else if (currentRows.length > 0) {
    const currentWeight = clamp(currentRows.length / 5, 0.22, 0.65);
    passAttempts = (currentPass * currentWeight) + (previousPass * (1 - currentWeight));
    rushAttempts = (currentRush * currentWeight) + (previousRush * (1 - currentWeight));
    source = 'blended';
    uncertaintyMultiplier = 1.08;
  } else if (previousRows.length) {
    passAttempts = (previousPass * 0.56) + (LEAGUE_PRIOR.passAttempts * 0.44);
    rushAttempts = (previousRush * 0.56) + (LEAGUE_PRIOR.rushAttempts * 0.44);
    source = 'preseason-prior';
    uncertaintyMultiplier = 1.18;
  } else {
    passAttempts = LEAGUE_PRIOR.passAttempts;
    rushAttempts = LEAGUE_PRIOR.rushAttempts;
    source = 'league-prior';
    uncertaintyMultiplier = 1.25;
  }

  const environmentRows = currentRows.length ? currentRows : previousRows;
  const passEpa = recentAverage(environmentRows, 'passEpaPerPlay', LEAGUE_PRIOR.passEpaPerPlay);
  const rushEpa = recentAverage(environmentRows, 'rushEpaPerPlay', LEAGUE_PRIOR.rushEpaPerPlay);
  const epaGap = clamp(passEpa - rushEpa, -0.25, 0.25);
  passAttempts += epaGap * 5;
  rushAttempts -= epaGap * 3;
  const basePlays = passAttempts + rushAttempts;
  const basePassRate = passAttempts / Math.max(1, basePlays);
  const neutralPassRate = recentAverage(environmentRows, 'neutralPassRate', basePassRate);
  const blendedPassRate = clamp((basePassRate * 0.75) + (neutralPassRate * 0.25), 0.46, 0.70);
  const secondsPerPlay = recentAverage(environmentRows, 'secondsPerPlay', 29);
  const pacedPlays = basePlays * clamp(29 / Math.max(22, secondsPerPlay), 0.96, 1.04);
  passAttempts = pacedPlays * blendedPassRate;
  rushAttempts = pacedPlays * (1 - blendedPassRate);

  const quarterback = candidates
    .filter((candidate) => candidate.base.position === 'QB')
    .sort((a, b) => b.base.startProbability - a.base.startProbability)[0];
  const profile = quarterback ? buildUsageProfile(quarterback) : null;
  const quarterbackStability = quarterback
    ? clamp((quarterback.base.startProbability * 0.58) + (clamp((profile?.sampleGames || 0) / 8, 0, 1) * 0.42), 0.62, 1)
    : 0.75;
  if (quarterbackStability < 0.82) {
    passAttempts *= 0.96;
    uncertaintyMultiplier *= 1.08;
  }

  let passingEfficiencyFactor = clamp(1 + (passEpa * 0.12), 0.96, 1.04);
  const rushingEfficiencyFactor = clamp(1 + (rushEpa * 0.10), 0.97, 1.035);
  passingEfficiencyFactor *= clamp(0.94 + (quarterbackStability * 0.06), 0.965, 1);
  const redZonePasses = recentAverage(environmentRows, 'redZonePassAttempts', 0);
  const redZoneRushes = recentAverage(environmentRows, 'redZoneRushAttempts', 0);
  const redZoneTotal = redZonePasses + redZoneRushes;
  const redZonePassRate = redZoneTotal > 0 ? redZonePasses / redZoneTotal : blendedPassRate;
  const passingTouchdownFactor = clamp(1 + ((redZonePassRate - blendedPassRate) * 0.22), 0.94, 1.06);
  const rushingTouchdownFactor = clamp(1 + (((1 - redZonePassRate) - (1 - blendedPassRate)) * 0.22), 0.94, 1.06);

  if (Number.isFinite(teamOverride?.teamPassAttempts)) {
    passAttempts = Number(teamOverride?.teamPassAttempts);
    source = 'manual';
  }
  if (Number.isFinite(teamOverride?.teamRushAttempts)) {
    rushAttempts = Number(teamOverride?.teamRushAttempts);
    source = 'manual';
  }
  passAttempts = clamp(passAttempts, 24, 45);
  rushAttempts = clamp(rushAttempts, 18, 38);
  return {
    team: args.team,
    passAttempts,
    rushAttempts,
    targetPool: passAttempts * 0.955,
    passingEfficiencyFactor,
    rushingEfficiencyFactor,
    passingTouchdownFactor,
    rushingTouchdownFactor,
    quarterbackStability,
    uncertaintyMultiplier,
    source,
  };
}

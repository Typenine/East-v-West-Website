import type { PlayerAvailabilityEntry } from '@/lib/utils/player-availability';
import type { ProjectionConfidence, ProjectedStatLine } from '@/lib/fantasy/lineup-types';
import type { NflverseTeamWeek } from '@/lib/fantasy/nflverse-team-stats';

export type NumericStats = Record<string, number | string | undefined>;

export type PlayerGameSample = {
  season: number;
  week: number;
  stats: NumericStats;
};

export type PlayerProjectionInput = {
  position: string;
  games: PlayerGameSample[];
  availability?: PlayerAvailabilityEntry;
  currentTeam: string | null;
  opponent: string | null;
  teamWeeks: NflverseTeamWeek[];
  opponentWeeks: NflverseTeamWeek[];
  currentSeasonGames: number;
  projectionSeason: number;
  preseason: boolean;
  scoring: Record<string, number>;
  injuryStatus?: string | null;
};

export type PlayerProjectionResult = {
  points: number;
  neutralPoints: number;
  statLine: ProjectedStatLine;
  matchupFactor: number;
  activeProbability: number;
  startProbability: number;
  expectedRole: string;
  workload: string;
  assumption: string | null;
  confidence: ProjectionConfidence;
  rangeLow: number;
  rangeHigh: number;
  sampleGames: number;
};

const POSITION_PRIORS: Record<string, Record<string, number>> = {
  QB: { passAtt: 31.5, passYpa: 6.8, passTdRate: 0.043, intRate: 0.023, rushAtt: 4.2, rushYpa: 4.7, rushTdRate: 0.035 },
  RB: { carries: 8.5, rushYpa: 4.15, targets: 2.6, catchRate: 0.73, recYpt: 6.2, rushTdRate: 0.026, recTdRate: 0.035 },
  WR: { targets: 5.4, catchRate: 0.63, recYpt: 8.0, recTdRate: 0.055, carries: 0.25, rushYpa: 6.0, rushTdRate: 0.02 },
  TE: { targets: 4.1, catchRate: 0.68, recYpt: 7.0, recTdRate: 0.052, carries: 0.05, rushYpa: 3.5, rushTdRate: 0.01 },
  K: { xpa: 2.2, fga: 1.9, fgPct: 0.84 },
  DEF: { pointsAllowed: 22.5, sacks: 2.3, interceptions: 0.75, fumbleRecoveries: 0.55, touchdowns: 0.16, safeties: 0.04, blocks: 0.08 },
};

const RANGE_SD: Record<string, number> = { QB: 6.2, RB: 5.2, WR: 5.5, TE: 4.5, K: 3.5, DEF: 4.8 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function weightedAverage(values: Array<{ value: number; weight: number }>, fallback = 0): number {
  const valid = values.filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);
  const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
  return totalWeight > 0
    ? valid.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight
    : fallback;
}

function sampleWeight(sample: PlayerGameSample, latestSeason: number, latestWeek: number): number {
  const age = ((latestSeason - sample.season) * 18) + Math.max(0, latestWeek - sample.week);
  return Math.exp(-Math.log(2) * age / 8);
}

function shrink(rate: number, attempts: number, prior: number, priorAttempts: number): number {
  const n = Math.max(0, attempts);
  return ((rate * n) + (prior * priorAttempts)) / Math.max(1, n + priorAttempts);
}

function sumStat(games: PlayerGameSample[], key: string): number {
  return games.reduce((sum, game) => sum + finite(game.stats[key]), 0);
}

function hasAnyOpportunity(position: string, stats: NumericStats): boolean {
  if (position === 'QB') return finite(stats.pass_att) + finite(stats.rush_att) > 0;
  if (position === 'RB' || position === 'WR' || position === 'TE') {
    return finite(stats.rush_att) + finite(stats.rec_tgt) + finite(stats.rec) > 0;
  }
  if (position === 'K') return finite(stats.fga) + finite(stats.xpa) > 0;
  if (position === 'DEF') return true;
  return false;
}

function opportunityGames(position: string, games: PlayerGameSample[]): PlayerGameSample[] {
  return games.filter((game) => hasAnyOpportunity(position, game.stats));
}

function roleProbabilities(input: PlayerProjectionInput, opportunityCount: number): {
  active: number;
  start: number;
  role: string;
  assumption: string | null;
} {
  const tier = input.availability?.tier || 'unknown';
  const status = String(input.injuryStatus || '').toLowerCase();
  const reasons = input.availability?.reasons || [];
  const offseason = input.preseason;

  if (input.position === 'DEF') {
    return { active: 1, start: 1, role: 'Starting team defense', assumption: null };
  }

  let active = input.availability?.weight ?? (offseason ? 0.94 : 0.97);
  let start = 0.55;
  let role = 'Uncertain role';

  if (tier === 'starter') {
    start = input.position === 'QB' ? 0.92 : 0.90;
    role = 'Expected starter';
  } else if (tier === 'primary_backup') {
    start = input.position === 'QB' ? 0.18 : 0.42;
    role = input.position === 'QB' ? 'Primary backup' : 'Committee / secondary role';
  } else if (tier === 'rotational') {
    start = input.position === 'QB' ? 0.06 : 0.26;
    role = 'Rotational role';
  } else if (tier === 'inactive') {
    active = offseason ? 0.35 : 0.02;
    start = 0.01;
    role = 'Not expected to be active';
  } else {
    start = input.position === 'QB' ? 0.34 : 0.52;
  }

  if (/out|susp|inactive/.test(status)) {
    active = offseason ? Math.min(active, 0.45) : 0.01;
  } else if (/ir|pup|nfi/.test(status)) {
    active = offseason ? Math.min(active, 0.68) : 0.03;
  } else if (/doubtful/.test(status)) {
    active = Math.min(active, 0.22);
  } else if (/questionable/.test(status)) {
    active = Math.min(active, 0.82);
  }

  if (opportunityCount >= 6 && tier === 'starter') {
    start = input.position === 'QB' ? Math.max(start, 0.94) : Math.max(start, 0.95);
  } else if (opportunityCount >= 6 && tier === 'unknown') {
    start = input.position === 'QB' ? Math.max(start, 0.55) : Math.max(start, 0.62);
  }

  const depthReason = reasons.find((reason) => reason.startsWith('espn-depth-'));
  const assumption = depthReason
    ? `${role} based partly on current depth-chart placement.`
    : offseason
      ? `${role}; preseason depth charts and injuries can still change.`
      : tier === 'unknown'
        ? 'Role is not fully confirmed, so starter and backup scenarios are blended.'
        : null;

  return { active: clamp(active, 0, 1), start: clamp(start, 0, 1), role, assumption };
}

function teamEnvironment(teamWeeks: NflverseTeamWeek[]): { plays: number; passAttempts: number; rushAttempts: number; touchdowns: number } {
  if (!teamWeeks.length) return { plays: 64, passAttempts: 34, rushAttempts: 27, touchdowns: 2.55 };
  const weights = teamWeeks.map((week, index) => ({ week, weight: Math.exp(-Math.log(2) * (teamWeeks.length - 1 - index) / 6) }));
  const passAttempts = weightedAverage(weights.map(({ week, weight }) => ({ value: week.passAttempts, weight })), 34);
  const rushAttempts = weightedAverage(weights.map(({ week, weight }) => ({ value: week.rushAttempts, weight })), 27);
  const touchdowns = weightedAverage(weights.map(({ week, weight }) => ({ value: week.passTouchdowns + week.rushTouchdowns, weight })), 2.55);
  return { plays: passAttempts + rushAttempts, passAttempts, rushAttempts, touchdowns };
}

function opponentFactor(position: string, opponentWeeks: NflverseTeamWeek[], currentSeasonGames: number): number {
  if (!opponentWeeks.length || currentSeasonGames <= 0) return 1;
  const league = position === 'QB' || position === 'WR' || position === 'TE'
    ? { yards: 225, touchdowns: 1.45 }
    : { yards: 112, touchdowns: 0.85 };
  const passPosition = position === 'QB' || position === 'WR' || position === 'TE';
  const allowedYards = average(opponentWeeks.map((week) => passPosition ? week.passYards : week.rushYards));
  const allowedTouchdowns = average(opponentWeeks.map((week) => passPosition ? week.passTouchdowns : week.rushTouchdowns));
  if (allowedYards <= 0) return 1;
  const raw = ((allowedYards / league.yards) * 0.7) + ((allowedTouchdowns / league.touchdowns) * 0.3);
  const confidence = clamp(currentSeasonGames / 8, 0, 1) * 0.35;
  return clamp(1 + ((raw - 1) * confidence), 0.94, 1.06);
}


function normalCdf(x: number, mean: number, standardDeviation: number): number {
  const z = (x - mean) / Math.max(0.001, standardDeviation * Math.sqrt(2));
  const sign = z < 0 ? -1 : 1;
  const absolute = Math.abs(z);
  const t = 1 / (1 + 0.3275911 * absolute);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-absolute * absolute));
  return clamp(0.5 * (1 + erf), 0, 1);
}

function projectedPoints(statLine: ProjectedStatLine, scoring: Record<string, number>, position: string): number {
  let points = 0;
  for (const [key, multiplier] of Object.entries(scoring)) {
    if (!Number.isFinite(multiplier) || multiplier === 0) continue;
    if (key === 'bonus_rec_te' && position === 'TE') {
      points += (statLine.rec || 0) * multiplier;
      continue;
    }
    if (key === 'bonus_rec_wr' && position === 'WR') {
      points += (statLine.rec || 0) * multiplier;
      continue;
    }
    if (key === 'bonus_rec_rb' && position === 'RB') {
      points += (statLine.rec || 0) * multiplier;
      continue;
    }
    const value = statLine[key];
    if (Number.isFinite(value)) points += value * multiplier;
  }
  return points;
}

function addYardageBonuses(line: ProjectedStatLine, position: string): void {
  if (position === 'QB') {
    const yards = line.pass_yd || 0;
    line.bonus_pass_yd_300 = clamp((yards - 250) / 100, 0, 1);
    line.bonus_pass_yd_400 = clamp((yards - 350) / 100, 0, 1);
  }
  if (position === 'RB' || position === 'WR' || position === 'TE') {
    const rushYards = line.rush_yd || 0;
    const recYards = line.rec_yd || 0;
    line.bonus_rush_yd_100 = clamp((rushYards - 75) / 75, 0, 1);
    line.bonus_rush_yd_200 = clamp((rushYards - 175) / 75, 0, 1);
    line.bonus_rec_yd_100 = clamp((recYards - 75) / 75, 0, 1);
    line.bonus_rec_yd_200 = clamp((recYards - 175) / 75, 0, 1);
  }
}

function scenarioWorkload(input: PlayerProjectionInput, role: ReturnType<typeof roleProbabilities>): {
  line: ProjectedStatLine;
  workload: string;
} {
  const position = input.position;
  const priors = POSITION_PRIORS[position] || POSITION_PRIORS.WR;
  const games = opportunityGames(position, input.games);
  const latestSeason = Math.max(...input.games.map((game) => game.season), 0);
  const latestWeek = Math.max(...input.games.filter((game) => game.season === latestSeason).map((game) => game.week), 1);
  const environment = teamEnvironment(input.teamWeeks);
  const weights = games.map((game) => ({ game, weight: sampleWeight(game, latestSeason, latestWeek) }));
  const weightedStat = (key: string, fallback: number): number => weightedAverage(
    weights.map(({ game, weight }) => ({ value: finite(game.stats[key]), weight })),
    fallback,
  );

  const starter = role.start;
  const active = role.active;
  const line: ProjectedStatLine = {};

  if (position === 'QB') {
    const observedPassAtt = weightedStat('pass_att', priors.passAtt);
    const observedRushAtt = weightedStat('rush_att', priors.rushAtt);
    const starterPassAtt = clamp((environment.passAttempts * 0.72) + (observedPassAtt * 0.28), 22, 43);
    const backupPassAtt = clamp(starterPassAtt * 0.16, 2.5, 8);
    const passAtt = active * ((starter * starterPassAtt) + ((1 - starter) * backupPassAtt));
    const attempts = sumStat(games, 'pass_att');
    const ypa = shrink(attempts > 0 ? sumStat(games, 'pass_yd') / attempts : priors.passYpa, attempts, priors.passYpa, 180);
    const tdRate = shrink(attempts > 0 ? sumStat(games, 'pass_td') / attempts : priors.passTdRate, attempts, priors.passTdRate, 220);
    const intRate = shrink(attempts > 0 ? sumStat(games, 'pass_int') / attempts : priors.intRate, attempts, priors.intRate, 220);
    const rushAttempts = sumStat(games, 'rush_att');
    const rushYpa = shrink(rushAttempts > 0 ? sumStat(games, 'rush_yd') / rushAttempts : priors.rushYpa, rushAttempts, priors.rushYpa, 45);
    const rushTdRate = shrink(rushAttempts > 0 ? sumStat(games, 'rush_td') / rushAttempts : priors.rushTdRate, rushAttempts, priors.rushTdRate, 55);
    const starterRushAtt = clamp((observedRushAtt * 0.65) + (priors.rushAtt * 0.35), 1, 11);
    const rushAtt = active * ((starter * starterRushAtt) + ((1 - starter) * Math.min(2, starterRushAtt * 0.35)));
    line.pass_att = passAtt;
    line.pass_cmp = passAtt * shrink(attempts > 0 ? sumStat(games, 'pass_cmp') / attempts : 0.635, attempts, 0.635, 160);
    line.pass_inc = Math.max(0, line.pass_att - line.pass_cmp);
    line.pass_yd = passAtt * ypa;
    line.pass_td = passAtt * tdRate;
    line.pass_int = passAtt * intRate;
    line.rush_att = rushAtt;
    line.rush_yd = rushAtt * rushYpa;
    line.rush_td = rushAtt * rushTdRate;
    line.pass_fd = line.pass_cmp * 0.49;
    line.rush_fd = rushAtt * 0.22;
    line.pass_2pt = 0.04 * active * starter;
    line.rush_2pt = 0.02 * active * starter;
    line.fum_lost = 0.10 * active;
    addYardageBonuses(line, position);
    return { line, workload: `${passAtt.toFixed(0)} pass attempts, ${rushAtt.toFixed(1)} rushes` };
  }

  if (position === 'RB') {
    const observedCarries = weightedStat('rush_att', priors.carries);
    const observedTargets = weightedStat('rec_tgt', priors.targets);
    const starterCarries = clamp((observedCarries * 0.62) + (environment.rushAttempts * 0.38 * 0.56), 5, 23);
    const backupCarries = clamp(Math.min(observedCarries, environment.rushAttempts * 0.24), 2, 9);
    const carries = active * ((starter * starterCarries) + ((1 - starter) * backupCarries));
    const starterTargets = clamp((observedTargets * 0.7) + (priors.targets * 0.3), 1, 8);
    const targets = active * ((starter * starterTargets) + ((1 - starter) * Math.max(0.8, starterTargets * 0.48)));
    const rushAttempts = sumStat(games, 'rush_att');
    const targetAttempts = sumStat(games, 'rec_tgt');
    const rushYpa = shrink(rushAttempts > 0 ? sumStat(games, 'rush_yd') / rushAttempts : priors.rushYpa, rushAttempts, priors.rushYpa, 70);
    const catchRate = shrink(targetAttempts > 0 ? sumStat(games, 'rec') / targetAttempts : priors.catchRate, targetAttempts, priors.catchRate, 45);
    const recYpt = shrink(targetAttempts > 0 ? sumStat(games, 'rec_yd') / targetAttempts : priors.recYpt, targetAttempts, priors.recYpt, 50);
    const rushTdRate = shrink(rushAttempts > 0 ? sumStat(games, 'rush_td') / rushAttempts : priors.rushTdRate, rushAttempts, priors.rushTdRate, 110);
    const recTdRate = shrink(targetAttempts > 0 ? sumStat(games, 'rec_td') / targetAttempts : priors.recTdRate, targetAttempts, priors.recTdRate, 75);
    line.rush_att = carries;
    line.rush_yd = carries * rushYpa;
    line.rush_td = carries * rushTdRate * clamp(environment.touchdowns / 2.55, 0.75, 1.25);
    line.rec_tgt = targets;
    line.rec = targets * catchRate;
    line.rec_yd = targets * recYpt;
    line.rec_td = targets * recTdRate;
    line.rush_fd = carries * 0.20;
    line.rec_fd = line.rec * 0.38;
    line.fum_lost = 0.045 * active;
    addYardageBonuses(line, position);
    return { line, workload: `${carries.toFixed(1)} carries, ${targets.toFixed(1)} targets` };
  }

  if (position === 'WR' || position === 'TE') {
    const observedTargets = weightedStat('rec_tgt', priors.targets);
    const starterTargets = clamp((observedTargets * 0.72) + (priors.targets * 0.28), position === 'TE' ? 2 : 2.5, position === 'TE' ? 10 : 13);
    const backupTargets = Math.max(0.8, starterTargets * (position === 'TE' ? 0.42 : 0.30));
    const targets = active * ((starter * starterTargets) + ((1 - starter) * backupTargets));
    const targetAttempts = sumStat(games, 'rec_tgt');
    const catchRate = shrink(targetAttempts > 0 ? sumStat(games, 'rec') / targetAttempts : priors.catchRate, targetAttempts, priors.catchRate, 70);
    const recYpt = shrink(targetAttempts > 0 ? sumStat(games, 'rec_yd') / targetAttempts : priors.recYpt, targetAttempts, priors.recYpt, 85);
    const recTdRate = shrink(targetAttempts > 0 ? sumStat(games, 'rec_td') / targetAttempts : priors.recTdRate, targetAttempts, priors.recTdRate, 115);
    const observedCarries = weightedStat('rush_att', priors.carries);
    const carries = active * ((starter * observedCarries) + ((1 - starter) * observedCarries * 0.25));
    const rushAttempts = sumStat(games, 'rush_att');
    const rushYpa = shrink(rushAttempts > 0 ? sumStat(games, 'rush_yd') / rushAttempts : priors.rushYpa, rushAttempts, priors.rushYpa, 25);
    line.rec_tgt = targets;
    line.rec = targets * catchRate;
    line.rec_yd = targets * recYpt;
    line.rec_td = targets * recTdRate * clamp(environment.touchdowns / 2.55, 0.8, 1.2);
    line.rush_att = carries;
    line.rush_yd = carries * rushYpa;
    line.rush_td = carries * priors.rushTdRate;
    line.rec_fd = line.rec * (position === 'TE' ? 0.48 : 0.44);
    line.rush_fd = carries * 0.24;
    line.fum_lost = 0.025 * active;
    addYardageBonuses(line, position);
    return { line, workload: `${targets.toFixed(1)} targets${carries >= 0.5 ? `, ${carries.toFixed(1)} rushes` : ''}` };
  }

  if (position === 'K') {
    const xpa = active * weightedStat('xpa', priors.xpa);
    const fga = active * weightedStat('fga', priors.fga);
    const fgAttempts = sumStat(games, 'fga');
    const fgMade = sumStat(games, 'fgm');
    const fgPct = shrink(fgAttempts > 0 ? fgMade / fgAttempts : priors.fgPct, fgAttempts, priors.fgPct, 55);
    line.xpa = xpa;
    line.xpm = xpa * 0.95;
    line.fga = fga;
    line.fgm = fga * fgPct;
    line.fgmiss = Math.max(0, fga - line.fgm);
    line.fgm_0_19 = line.fgm * 0.05;
    line.fgm_20_29 = line.fgm * 0.18;
    line.fgm_30_39 = line.fgm * 0.27;
    line.fgm_40_49 = line.fgm * 0.31;
    line.fgm_50p = line.fgm * 0.19;
    return { line, workload: `${fga.toFixed(1)} field-goal attempts, ${xpa.toFixed(1)} extra-point attempts` };
  }

  const def = priors;
  const strength = opponentFactor('DEF', input.opponentWeeks, input.currentSeasonGames);
  line.sack = def.sacks / strength;
  line.int = def.interceptions / strength;
  line.fum_rec = def.fumbleRecoveries / strength;
  line.def_td = def.touchdowns / strength;
  line.safe = def.safeties;
  line.blk_kick = def.blocks;
  const pointsAllowed = def.pointsAllowed * strength;
  const totalYards = input.opponentWeeks.length
    ? average(input.opponentWeeks.map((week) => week.passYards + week.rushYards))
    : 337;
  const pointCdf = (x: number) => normalCdf(x, pointsAllowed, 9);
  line.pts_allow_0 = pointCdf(0.5);
  line.pts_allow_1_6 = pointCdf(6.5) - pointCdf(0.5);
  line.pts_allow_7_13 = pointCdf(13.5) - pointCdf(6.5);
  line.pts_allow_14_20 = pointCdf(20.5) - pointCdf(13.5);
  line.pts_allow_21_27 = pointCdf(27.5) - pointCdf(20.5);
  line.pts_allow_28_34 = pointCdf(34.5) - pointCdf(27.5);
  line.pts_allow_35p = 1 - pointCdf(34.5);
  const yardCdf = (x: number) => normalCdf(x, totalYards, 72);
  line.yds_allow_0_100 = yardCdf(100);
  line.yds_allow_100_199 = yardCdf(200) - yardCdf(100);
  line.yds_allow_200_299 = yardCdf(300) - yardCdf(200);
  line.yds_allow_300_349 = yardCdf(350) - yardCdf(300);
  line.yds_allow_350_399 = yardCdf(400) - yardCdf(350);
  line.yds_allow_400_449 = yardCdf(450) - yardCdf(400);
  line.yds_allow_450_499 = yardCdf(500) - yardCdf(450);
  line.yds_allow_500p = 1 - yardCdf(500);
  return { line, workload: `${line.sack.toFixed(1)} sacks, ${(line.int + line.fum_rec).toFixed(1)} takeaways` };
}

export function buildPlayerStatProjection(input: PlayerProjectionInput): PlayerProjectionResult {
  const position = input.position.toUpperCase();
  const games = opportunityGames(position, input.games);
  const role = roleProbabilities(input, games.length);
  const { line, workload } = scenarioWorkload({ ...input, position }, role);
  const neutralPoints = projectedPoints(line, input.scoring, position);
  const matchupFactor = position === 'K' || position === 'DEF'
    ? 1
    : opponentFactor(position, input.opponentWeeks, input.currentSeasonGames);
  const adjustedLine = Object.fromEntries(
    Object.entries(line).map(([key, value]) => {
      if (key.includes('att') || key === 'rec_tgt' || key === 'rec' || key === 'pass_cmp' || key === 'pass_inc') return [key, value];
      if (key === 'pass_int' || key === 'fum_lost') return [key, value / Math.max(0.01, matchupFactor)];
      return [key, value * matchupFactor];
    }),
  );
  const points = projectedPoints(adjustedLine, input.scoring, position);
  const currentSamples = input.games.filter((game) => game.season === input.projectionSeason).length;
  let confidence: ProjectionConfidence = 'low';
  if (!input.preseason && currentSamples >= 4 && role.active >= 0.85 && Math.abs(role.start - 0.5) >= 0.25) confidence = 'high';
  else if (!input.preseason && (currentSamples >= 2 || games.length >= 6)) confidence = 'medium';
  const uncertainty = (RANGE_SD[position] || 5) * (confidence === 'high' ? 0.9 : confidence === 'medium' ? 1.15 : 1.45) * (1 + (0.5 - Math.abs(role.start - 0.5)) * 0.5);
  return {
    points: Math.max(0, points),
    neutralPoints: Math.max(0, neutralPoints),
    statLine: Object.fromEntries(Object.entries(adjustedLine).map(([key, value]) => [key, Number(value.toFixed(3))])),
    matchupFactor,
    activeProbability: role.active,
    startProbability: role.start,
    expectedRole: role.role,
    workload,
    assumption: role.assumption,
    confidence,
    rangeLow: Math.max(0, points - uncertainty),
    rangeHigh: Math.max(0, points + uncertainty),
    sampleGames: games.length,
  };
}

export function scoreProjectedStatLine(
  statLine: ProjectedStatLine,
  scoring: Record<string, number>,
  position: string,
): number {
  return projectedPoints(statLine, scoring, position.toUpperCase());
}

import type { WeeklyProjectedPlayer, ProjectedStatLine } from '@/lib/fantasy/lineup-types';
import type { NflverseTeamWeek } from '@/lib/fantasy/nflverse-team-stats';
import type { ProjectionOverrideRecord } from '@/lib/fantasy/projection-overrides';
import type {
  PlayerProjectionCandidate,
  TeamOpportunityPlan,
  UsageProfile,
} from '@/lib/fantasy/projection-opportunity-types';
import {
  buildUsageProfile,
  carryPrior,
  clamp,
  finite,
  passPrior,
  targetPrior,
} from '@/lib/fantasy/projection-usage';
import { projectTeamOpportunityPlan } from '@/lib/fantasy/projection-team-plan';

function scoreProjectedStatLine(statLine: ProjectedStatLine, scoring: Record<string, number>, position: string): number {
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

type Allocation = {
  amount: number;
  share: number;
  profile: UsageProfile;
};

function allocatePool(args: {
  candidates: PlayerProjectionCandidate[];
  pool: number;
  eligible: (candidate: PlayerProjectionCandidate) => boolean;
  rawWeight: (candidate: PlayerProjectionCandidate, profile: UsageProfile) => number;
  overrideShare: (override: ProjectionOverrideRecord | undefined) => number | null;
}): Map<string, Allocation> {
  const eligible = args.candidates.filter(args.eligible);
  const profiles = new Map(eligible.map((candidate) => [candidate.id, buildUsageProfile(candidate)] as const));
  const fixed = new Map<string, number>();
  for (const candidate of eligible) {
    const override = args.overrideShare(candidate.override);
    if (override != null && Number.isFinite(override)) fixed.set(candidate.id, clamp(override, 0, 1));
  }

  const fixedTotal = [...fixed.values()].reduce((sum, value) => sum + value, 0);
  const normalizedFixedScale = fixedTotal > 0.98 ? 0.98 / fixedTotal : 1;
  const used = fixedTotal * normalizedFixedScale;
  const remainingShare = Math.max(0, 1 - used);
  const variable = eligible.filter((candidate) => !fixed.has(candidate.id));
  const raw = new Map<string, number>();
  for (const candidate of variable) {
    const profile = profiles.get(candidate.id)!;
    const active = clamp(candidate.override?.activeProbability ?? candidate.base.activeProbability, 0, 1);
    raw.set(candidate.id, args.rawWeight(candidate, profile) * Math.pow(active, 1.65));
  }
  const rawTotal = [...raw.values()].reduce((sum, value) => sum + value, 0);
  const result = new Map<string, Allocation>();
  for (const candidate of eligible) {
    const profile = profiles.get(candidate.id)!;
    let share = 0;
    if (fixed.has(candidate.id)) {
      share = (fixed.get(candidate.id) || 0) * normalizedFixedScale;
    } else if (variable.length) {
      share = rawTotal > 0
        ? remainingShare * ((raw.get(candidate.id) || 0) / rawTotal)
        : remainingShare / variable.length;
    }
    result.set(candidate.id, { amount: args.pool * share, share, profile });
  }
  return result;
}

function rate(line: ProjectedStatLine, numerator: string, denominator: string, fallback: number): number {
  const den = finite(line[denominator]);
  if (den <= 0) return fallback;
  return finite(line[numerator]) / den;
}

function refreshBonuses(line: ProjectedStatLine, position: string): void {
  if (position === 'QB') {
    const yards = finite(line.pass_yd);
    line.bonus_pass_yd_300 = clamp((yards - 250) / 100, 0, 1);
    line.bonus_pass_yd_400 = clamp((yards - 350) / 100, 0, 1);
  }
  if (position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE') {
    const rushYards = finite(line.rush_yd);
    line.bonus_rush_yd_100 = clamp((rushYards - 75) / 75, 0, 1);
    line.bonus_rush_yd_200 = clamp((rushYards - 175) / 75, 0, 1);
  }
  if (position === 'RB' || position === 'WR' || position === 'TE') {
    const recYards = finite(line.rec_yd);
    line.bonus_rec_yd_100 = clamp((recYards - 75) / 75, 0, 1);
    line.bonus_rec_yd_200 = clamp((recYards - 175) / 75, 0, 1);
  }
}

function roleLabel(candidate: PlayerProjectionCandidate, targetShare: number, carryShare: number, passShare: number): string {
  if (candidate.override?.roleLabel) return candidate.override.roleLabel;
  const position = candidate.base.position;
  if (position === 'QB') {
    if (passShare >= 0.72) return 'Expected starting quarterback';
    if (passShare >= 0.18) return 'Potential quarterback rotation';
    return 'Backup quarterback';
  }
  if (position === 'RB') {
    if (carryShare >= 0.50 || (carryShare >= 0.38 && targetShare >= 0.10)) return 'Lead back';
    if (carryShare >= 0.22 || targetShare >= 0.10) return 'Committee / secondary back';
    return 'Change-of-pace / depth back';
  }
  if (position === 'WR') {
    if (targetShare >= 0.24) return 'Featured starting receiver';
    if (targetShare >= 0.15) return 'Starting receiver';
    if (targetShare >= 0.08) return 'Slot / rotational receiver';
    return 'Depth receiver';
  }
  if (position === 'TE') {
    if (targetShare >= 0.16) return 'Lead tight end';
    if (targetShare >= 0.08) return 'Secondary tight end';
    return 'Blocking / depth tight end';
  }
  return candidate.base.expectedRole;
}

function mergeAssumption(...parts: Array<string | null | undefined>): string | null {
  const values = parts.map((part) => String(part || '').trim()).filter(Boolean);
  return values.length ? Array.from(new Set(values)).join(' ') : null;
}

export function reconcileTeamOpportunityBudgets(args: {
  candidates: PlayerProjectionCandidate[];
  currentRowsByTeam: Map<string, NflverseTeamWeek[]>;
  previousRowsByTeam: Map<string, NflverseTeamWeek[]>;
  preseason: boolean;
  scoring: Record<string, number>;
  teamOverrides: Map<string, ProjectionOverrideRecord>;
}): { players: WeeklyProjectedPlayer[]; plans: Record<string, TeamOpportunityPlan> } {
  const byTeam = new Map<string, PlayerProjectionCandidate[]>();
  const passthrough: WeeklyProjectedPlayer[] = [];
  for (const candidate of args.candidates) {
    const team = candidate.base.nflTeam;
    if (!team || candidate.base.isBye) {
      passthrough.push(candidate.base);
      continue;
    }
    const rows = byTeam.get(team) || [];
    rows.push(candidate);
    byTeam.set(team, rows);
  }

  const players: WeeklyProjectedPlayer[] = [...passthrough];
  const plans: Record<string, TeamOpportunityPlan> = {};

  for (const [team, candidates] of byTeam.entries()) {
    const plan = projectTeamOpportunityPlan({
      team,
      currentRows: args.currentRowsByTeam.get(team) || [],
      previousRows: args.previousRowsByTeam.get(team) || [],
      candidates,
      preseason: args.preseason,
      teamOverride: args.teamOverrides.get(team),
    });
    plans[team] = plan;

    const passes = allocatePool({
      candidates,
      pool: plan.passAttempts,
      eligible: (candidate) => candidate.base.position === 'QB',
      rawWeight: passPrior,
      overrideShare: (override) => override?.passAttemptShare ?? null,
    });
    const targets = allocatePool({
      candidates,
      pool: plan.targetPool,
      eligible: (candidate) => ['RB', 'WR', 'TE'].includes(candidate.base.position),
      rawWeight: targetPrior,
      overrideShare: (override) => override?.targetShare ?? null,
    });
    const carries = allocatePool({
      candidates,
      pool: plan.rushAttempts,
      eligible: (candidate) => ['QB', 'RB', 'WR'].includes(candidate.base.position),
      rawWeight: carryPrior,
      overrideShare: (override) => override?.carryShare ?? null,
    });

    for (const candidate of candidates) {
      const position = candidate.base.position;
      if (!['QB', 'RB', 'WR', 'TE'].includes(position)) {
        players.push({
          ...candidate.base,
          teamPassAttempts: Number(plan.passAttempts.toFixed(1)),
          teamRushAttempts: Number(plan.rushAttempts.toFixed(1)),
          allocationSource: plan.source,
          workloadUncertainty: plan.uncertaintyMultiplier,
          overrideApplied: Boolean(candidate.override),
        });
        continue;
      }

      const original = candidate.base.statLine || {};
      const line: ProjectedStatLine = { ...original };
      const pass = passes.get(candidate.id);
      const target = targets.get(candidate.id);
      const carry = carries.get(candidate.id);
      const targetShare = target?.share || 0;
      const carryShare = carry?.share || 0;
      const passShare = pass?.share || 0;
      const profile = pass?.profile || target?.profile || carry?.profile || buildUsageProfile(candidate);
      const activeProbability = clamp(candidate.override?.activeProbability ?? candidate.base.activeProbability, 0, 1);
      const startProbability = clamp(candidate.override?.startProbability ?? candidate.base.startProbability, 0, 1);

      if (position === 'QB') {
        const passAttempts = pass?.amount || 0;
        const completionRate = clamp(rate(original, 'pass_cmp', 'pass_att', 0.635), 0.48, 0.76);
        const yardsPerAttempt = clamp(rate(original, 'pass_yd', 'pass_att', 6.8) * plan.passingEfficiencyFactor, 5.1, 9.3);
        const touchdownRate = clamp(rate(original, 'pass_td', 'pass_att', 0.043) * plan.passingTouchdownFactor, 0.018, 0.075);
        const interceptionRate = clamp(rate(original, 'pass_int', 'pass_att', 0.023) / Math.max(0.96, plan.passingEfficiencyFactor), 0.008, 0.05);
        line.pass_att = passAttempts;
        line.pass_cmp = passAttempts * completionRate;
        line.pass_inc = Math.max(0, passAttempts - line.pass_cmp);
        line.pass_yd = passAttempts * yardsPerAttempt;
        line.pass_td = passAttempts * touchdownRate;
        line.pass_int = passAttempts * interceptionRate;
        line.pass_fd = line.pass_cmp * 0.49;
        line.pass_2pt = 0.04 * activeProbability * startProbability;
      }

      if (position === 'QB' || position === 'RB' || position === 'WR') {
        const rushAttempts = carry?.amount || 0;
        const fallbackYpa = position === 'QB' ? 4.7 : position === 'RB' ? 4.15 : 6;
        const rushYpa = clamp(rate(original, 'rush_yd', 'rush_att', fallbackYpa) * plan.rushingEfficiencyFactor, position === 'WR' ? 2.5 : 2.2, position === 'WR' ? 11 : 8.5);
        const rushTdRate = clamp(rate(original, 'rush_td', 'rush_att', position === 'QB' ? 0.035 : 0.026) * plan.rushingTouchdownFactor, 0.004, 0.11);
        line.rush_att = rushAttempts;
        line.rush_yd = rushAttempts * rushYpa;
        line.rush_td = rushAttempts * rushTdRate;
        line.rush_fd = rushAttempts * (position === 'QB' ? 0.22 : 0.20);
      }

      if (position === 'RB' || position === 'WR' || position === 'TE') {
        const targetCount = target?.amount || 0;
        const fallbackCatchRate = position === 'RB' ? 0.73 : position === 'TE' ? 0.68 : 0.63;
        const fallbackYpt = position === 'RB' ? 6.2 : position === 'TE' ? 7 : 8;
        const catchRate = clamp(rate(original, 'rec', 'rec_tgt', fallbackCatchRate), 0.42, 0.88);
        const yardsPerTarget = clamp(rate(original, 'rec_yd', 'rec_tgt', fallbackYpt) * plan.passingEfficiencyFactor, 4, 12.5);
        const touchdownRate = clamp(rate(original, 'rec_td', 'rec_tgt', position === 'TE' ? 0.052 : 0.05) * plan.passingTouchdownFactor, 0.01, 0.12);
        line.rec_tgt = targetCount;
        line.rec = targetCount * catchRate;
        line.rec_yd = targetCount * yardsPerTarget;
        line.rec_td = targetCount * touchdownRate;
        line.rec_fd = line.rec * (position === 'TE' ? 0.48 : position === 'RB' ? 0.38 : 0.44);
      }

      refreshBonuses(line, position);
      const computedPoints = Math.max(0, scoreProjectedStatLine(line, args.scoring, position));
      const projection = Number.isFinite(candidate.override?.projectionPoints)
        ? Math.max(0, Number(candidate.override?.projectionPoints))
        : computedPoints;
      const opportunityLabel = position === 'QB'
        ? `${finite(line.pass_att).toFixed(0)} pass attempts, ${finite(line.rush_att).toFixed(1)} rushes`
        : position === 'RB'
          ? `${finite(line.rush_att).toFixed(1)} carries, ${finite(line.rec_tgt).toFixed(1)} targets`
          : `${finite(line.rec_tgt).toFixed(1)} targets${finite(line.rush_att) >= 0.5 ? `, ${finite(line.rush_att).toFixed(1)} rushes` : ''}`;
      const contextAssumption = profile.changedTeams
        ? 'Previous-team volume is discounted; transferable efficiency receives more weight.'
        : profile.rookie && profile.sampleGames === 0
          ? 'NFL workload uses a rookie prior informed by draft capital and current role.'
          : null;
      const overrideAssumption = candidate.override
        ? candidate.override.note
          ? `Manual projection override: ${candidate.override.note}`
          : 'A temporary manual projection override is active.'
        : null;

      players.push({
        ...candidate.base,
        projection: Number(projection.toFixed(1)),
        baseline: Number(computedPoints.toFixed(1)),
        statLine: Object.fromEntries(Object.entries(line).map(([key, value]) => [key, Number(value.toFixed(3))])),
        expectedRole: roleLabel(candidate, targetShare, carryShare, passShare),
        workload: opportunityLabel,
        assumption: mergeAssumption(candidate.base.assumption, contextAssumption, overrideAssumption),
        startProbability,
        activeProbability,
        availabilityWeight: activeProbability,
        targetShare: target ? Number(targetShare.toFixed(3)) : undefined,
        carryShare: carry ? Number(carryShare.toFixed(3)) : undefined,
        teamPassAttempts: Number(plan.passAttempts.toFixed(1)),
        teamRushAttempts: Number(plan.rushAttempts.toFixed(1)),
        allocationSource: candidate.override?.projectionPoints != null ? 'manual' : plan.source,
        overrideApplied: Boolean(candidate.override),
        workloadUncertainty: Number((plan.uncertaintyMultiplier * (profile.changedTeams ? 1.12 : profile.rookie && profile.sampleGames === 0 ? 1.18 : 1)).toFixed(3)),
      });
    }
  }

  return { players, plans };
}

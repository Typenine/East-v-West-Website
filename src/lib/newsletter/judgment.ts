/**
 * Event Judgment Layer.
 *
 * Scores section stakes/heat and injects targeted continuity. The continuity
 * block is shared show memory, not a command to preserve an old take: each host
 * should compare today's evidence with what was actually published before.
 */

import type { BotMemory, TeamMemory, NarrativeHeat } from './types';
import { computeNarrativeHeat, heatSummary } from './narrative-heat';
import { computeRivalryScore } from './team-narratives';

export type JudgmentStakes = 'trivial' | 'low' | 'medium' | 'high' | 'critical';
export type JudgmentWeight = 'low' | 'medium' | 'high';

export interface JudgmentInput {
  sectionType: string;
  episodeType: string;
  week: number;
  season: number;
  teamNames?: string[];
  teamMemory?: Partial<TeamMemory>;
  matchupMargin?: number;
  winnerPoints?: number;
  loserPoints?: number;
  isBlowout?: boolean;
  isNailbiter?: boolean;
  eventRelevanceScore?: number;
  isPlayoffs?: boolean;
  isChampionship?: boolean;
  isTradeDeadline?: boolean;
  isRivalryMatchup?: boolean;
  rivalryScore?: number;
  playoffImplication?: 'clinched' | 'eliminated' | 'bubble' | null;
  winStreaks?: number[];
  trajectories?: string[];
  wasDiscussedLastWeek?: boolean;
  hasH2HHistory?: boolean;
  hasChampionshipMeeting?: boolean;
  memoryCallbacks?: string[];
}

export interface EventJudgment {
  eventType: string;
  stakes: JudgmentStakes;
  historicalWeight: JudgmentWeight;
  comedyValue: number;
  sensitivity: number;
  recommendedStance: string;
  shouldLeanIn: boolean;
  avoidList: string[];
  note: string;
  narrativeHeat: NarrativeHeat;
  rivalryScore: number;
  memoryCallbacks: string[];
}

function compact(lines: Array<string | undefined | null>, limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const value = raw?.replace(/\s+/g, ' ').trim();
    if (!value || value.length < 12) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value.slice(0, 520));
    if (out.length >= limit) break;
  }
  return out;
}

function classifyEventType(sectionType: string, episodeType: string): string {
  if (sectionType === 'Intro') return `${episodeType}_intro`;
  if (sectionType === 'FinalWord') return 'final_word';
  if (sectionType.startsWith('Recap_')) return 'matchup_recap';
  if (sectionType.startsWith('Trade_')) return 'trade_grade';
  if (sectionType === 'WaiversAndFA') return 'waiver_wire';
  if (sectionType === 'Spotlight') return 'spotlight_team';
  if (sectionType === 'Forecast') return 'forecast';
  if (sectionType === 'Blurt') return 'blurt';
  if (sectionType === 'PowerRankings') return 'power_rankings';
  if (sectionType.startsWith('MockDraft')) return 'mock_draft';
  if (sectionType.startsWith('DraftGrade')) return 'draft_grade';
  return 'unknown';
}

export function judgeSection(input: JudgmentInput): EventJudgment {
  const teamNames = input.teamNames ?? [];
  const winStreaks = input.winStreaks ?? [];
  const trajectories = input.trajectories ?? [];
  const isIntro = input.sectionType === 'Intro' || input.sectionType === 'FinalWord';
  const isRecap = input.sectionType.startsWith('Recap_');
  const isTrade = input.sectionType.startsWith('Trade_');
  const isWaiver = input.sectionType === 'WaiversAndFA';
  const isSpotlight = input.sectionType === 'Spotlight';
  const isBlurt = input.sectionType === 'Blurt';
  const isForecast = input.sectionType === 'Forecast';
  const relevance = input.eventRelevanceScore ?? 0;
  const isBlowout = input.isBlowout ?? false;
  const isNailbiter = input.isNailbiter ?? false;
  const isPlayoffs = input.isPlayoffs ?? false;
  const isChampionship = input.isChampionship ?? false;
  const isTradeDeadline = input.isTradeDeadline ?? false;
  const isRivalryMatchup = input.isRivalryMatchup ?? false;

  let stakes: JudgmentStakes = 'low';
  if (isChampionship) stakes = 'critical';
  else if (isPlayoffs || (isTradeDeadline && isTrade) || (isTrade && relevance >= 70)) stakes = 'high';
  else if ((isRecap && (isBlowout || isNailbiter)) || isRivalryMatchup || relevance >= 40 || isForecast || isIntro) stakes = 'medium';

  let historicalWeight: JudgmentWeight = 'low';
  if (isRivalryMatchup || isChampionship) historicalWeight = 'high';
  else if (winStreaks.some(s => Math.abs(s) >= 3) || trajectories.some(t => t === 'rising' || t === 'falling')) historicalWeight = 'medium';

  const trust = input.teamMemory?.trust ?? 0;
  const frustration = input.teamMemory?.frustration ?? 0;
  let comedyValue = 4;
  if (isBlowout && !isPlayoffs) comedyValue += 3;
  if (isBlurt) comedyValue = 8;
  if (isChampionship) comedyValue = 1;
  if (isRivalryMatchup) comedyValue += 2;
  if (frustration >= 15 || trust < -10) comedyValue += 1;
  comedyValue = Math.min(10, Math.max(0, comedyValue));

  let sensitivity = 2;
  if (isChampionship) sensitivity = 7;
  if (isPlayoffs) sensitivity += 2;
  if (isTrade && relevance >= 70) sensitivity += 2;
  if (isRivalryMatchup) sensitivity += 1;
  sensitivity = Math.min(10, sensitivity);

  let recommendedStance = 'Town Crier';
  if (isIntro && input.week <= 3) recommendedStance = 'Hype Man';
  else if (isIntro && isChampionship) recommendedStance = 'Historian';
  else if (isTrade && relevance >= 70) recommendedStance = 'Accountant';
  else if (isTrade) recommendedStance = 'Prosecutor';
  else if (isWaiver) recommendedStance = 'Sicko Scout';
  else if (isRecap && isChampionship) recommendedStance = 'Historian';
  else if (isRecap && isBlowout) recommendedStance = 'Undertaker';
  else if (isRecap && isNailbiter) recommendedStance = 'Town Crier';
  else if (isRecap && isRivalryMatchup) recommendedStance = 'Rivalry Arsonist';
  else if (isRecap) recommendedStance = comedyValue >= 6 ? 'Undertaker' : 'Defense Attorney';
  else if (isSpotlight) recommendedStance = trajectories[0] === 'rising' ? 'Hype Man' : trajectories[0] === 'falling' ? 'Undertaker' : 'Historian';
  else if (isForecast) recommendedStance = 'Prosecutor';

  const avoidList: string[] = [];
  if (isChampionship || isPlayoffs) avoidList.push('casual dismissiveness — every playoff team earned its spot');
  if (sensitivity >= 6) avoidList.push('piling on — one strong take is enough');
  if (!isRivalryMatchup) avoidList.push('inventing a rivalry without evidence');
  if (isBlurt) avoidList.push('long paragraphs');

  let rivalryScore = input.rivalryScore ?? 0;
  if (!input.rivalryScore && teamNames.length >= 2) rivalryScore = computeRivalryScore(teamNames[0], teamNames[1]);
  const isActualRivalry = isRivalryMatchup || rivalryScore >= 5;
  if (isActualRivalry && rivalryScore >= 7 && stakes === 'low') stakes = 'medium';

  const narrativeHeat = computeNarrativeHeat({
    matchupMargin: input.matchupMargin,
    winnerPoints: input.winnerPoints,
    loserPoints: input.loserPoints,
    isPlayoffs,
    isChampionship,
    isTradeDeadline,
    rivalryScore,
    eventRelevanceScore: relevance,
    playoffImplication: input.playoffImplication,
    teamTrustDelta: Math.abs(trust - frustration),
    winStreak: winStreaks.length ? Math.max(...winStreaks.map(Math.abs)) : undefined,
    hasActiveNarrative: false,
    hasH2HHistory: input.hasH2HHistory,
    hasChampionshipMeeting: input.hasChampionshipMeeting,
    wasDiscussedLastWeek: input.wasDiscussedLastWeek,
  });

  const shouldLeanIn = stakes === 'critical' || stakes === 'high' || isActualRivalry || isBlowout || comedyValue >= 7 || narrativeHeat.shouldLeanIn;
  const teamLabel = teamNames.length ? teamNames.slice(0, 2).join(' vs ') : input.sectionType;
  let note = `Week ${input.week}, ${input.episodeType}: ${teamLabel}. Stakes: ${stakes}.`;
  if (isChampionship) note = 'Championship week — this is the biggest game of the season.';
  else if (isPlayoffs) note = 'Playoff stakes — single elimination.';
  else if (isTradeDeadline) note = 'Trade deadline — buyers and sellers are sorting out.';
  else if (rivalryScore >= 7) note += ' Blood feud — history matters.';
  else if (rivalryScore >= 5) note += ' Rivalry matchup — history matters.';
  else if (isBlowout) note += ` Blowout (${input.matchupMargin?.toFixed(0)} pts).`;
  else if (isNailbiter) note += ' Nail-biter.';
  note += ` ${heatSummary(narrativeHeat)}`;

  const memoryCallbacks = compact([
    ...(input.memoryCallbacks ?? []),
    input.teamMemory?.lastAssessment?.text ? `Most recent published assessment: ${input.teamMemory.lastAssessment.text}` : undefined,
  ]);

  return {
    eventType: classifyEventType(input.sectionType, input.episodeType),
    stakes,
    historicalWeight,
    comedyValue,
    sensitivity,
    recommendedStance,
    shouldLeanIn,
    avoidList,
    note,
    narrativeHeat,
    rivalryScore,
    memoryCallbacks,
  };
}

export function buildJudgmentContext(judgment: EventJudgment): string {
  const lines = [
    'SECTION GUIDANCE:',
    `Event: ${judgment.eventType} | Stakes: ${judgment.stakes} | Comedy: ${judgment.comedyValue}/10 | Sensitivity: ${judgment.sensitivity}/10`,
    `Note: ${judgment.note}`,
  ];

  if (judgment.memoryCallbacks.length) {
    lines.push('RELEVANT PUBLISHED MEMORY FROM EARLIER COVERAGE:');
    for (const callback of judgment.memoryCallbacks.slice(0, 5)) lines.push(`- ${callback}`);
    lines.push('ANALYSIS TASK: Connect the current evidence to this history. Identify whether it confirms, complicates, or overturns the earlier analysis. A host may change his mind, but should acknowledge the reason. Do not force a callback when it is not relevant and never invent a prior take.');
  }
  if (judgment.rivalryScore >= 7) lines.push('Blood feud detected — use the real rivalry history.');
  else if (judgment.rivalryScore >= 5) lines.push('Rival teams — keep the historical tension in the background.');
  if (judgment.shouldLeanIn) lines.push("Lean in — this section has real weight. Don't play it safe.");
  if (judgment.avoidList.length) lines.push(`Avoid: ${judgment.avoidList.join('; ')}.`);
  return `\n${lines.join('\n')}`;
}

function hostLabel(mem: BotMemory): string {
  return mem.bot === 'entertainer' ? 'Mason' : 'Westy';
}

function teamCallbacks(mem: BotMemory, team: string): string[] {
  const label = hostLabel(mem);
  const rel = mem.deepTeamRelationships?.[team];
  const tm = mem.teams[team];
  return compact([
    rel?.currentNarrative ? `${label} on ${team}: ${rel.currentNarrative}` : undefined,
    ...(rel?.takeHistory?.slice(-2).reverse().map(t => `${label} on ${team}, S${t.season} W${t.week}: ${t.take}`) ?? []),
    tm?.lastAssessment?.text ? `${team} latest stored assessment: ${tm.lastAssessment.text}` : undefined,
  ], 3);
}

function playerCallbacksForTeams(mem: BotMemory, teams: string[]): string[] {
  const label = hostLabel(mem);
  const teamSet = new Set(teams.map(t => t.toLowerCase()));
  const relationships = Object.values(mem.deepPlayerRelationships ?? {})
    .filter(rel => rel.team && teamSet.has(rel.team.toLowerCase()))
    .sort((a, b) => (b.mentionFrequency ?? 0) - (a.mentionFrequency ?? 0));
  const lines: string[] = [];
  for (const rel of relationships.slice(0, 3)) {
    const thesis = rel.history?.slice().reverse().find(h => h.event.startsWith('Current thesis:'));
    const take = rel.history?.slice().reverse().find(h => h.event.startsWith('Published take:'));
    const prediction = rel.predictions?.slice(-1)[0];
    const raw = thesis?.event ?? take?.event ?? (prediction ? `Prediction: ${prediction.prediction}` : '');
    if (raw) lines.push(`${label} on ${rel.playerName}: ${raw.replace(/^(Current thesis:|Published take:)\s*/, '')}`);
  }
  return lines;
}

export function judgeMatchup(
  mem: BotMemory,
  teamA: string,
  teamB: string,
  margin: number,
  week: number,
  season: number,
  episodeType: string,
  sectionIndex: number,
): EventJudgment {
  const memA = mem.teams[teamA];
  const memB = mem.teams[teamB];
  const refMem = Math.abs((memA?.trust ?? 0) - (memA?.frustration ?? 0)) > Math.abs((memB?.trust ?? 0) - (memB?.frustration ?? 0)) ? memA : memB;
  const recentLabels = mem.recentOutputLog?.teamLabels ?? {};

  return judgeSection({
    sectionType: `Recap_${sectionIndex}`,
    episodeType,
    week,
    season,
    teamNames: [teamA, teamB],
    teamMemory: refMem,
    matchupMargin: margin,
    isBlowout: margin >= 30,
    isNailbiter: margin <= 5,
    isPlayoffs: episodeType === 'playoffs_round' || episodeType === 'championship',
    isChampionship: episodeType === 'championship',
    isTradeDeadline: episodeType === 'trade_deadline',
    wasDiscussedLastWeek: Boolean(recentLabels[teamA] || recentLabels[teamB]),
    winStreaks: [memA?.winStreak ?? 0, memB?.winStreak ?? 0],
    trajectories: [memA?.trajectory ?? 'steady', memB?.trajectory ?? 'steady'],
    memoryCallbacks: compact([
      ...teamCallbacks(mem, teamA),
      ...teamCallbacks(mem, teamB),
      ...playerCallbacksForTeams(mem, [teamA, teamB]),
    ], 5),
  });
}

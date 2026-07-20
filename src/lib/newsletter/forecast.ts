/**
 * Forecast Module
 * Generates grounded matchup picks and bold-player predictions.
 *
 * Bold-player candidates are built from current opportunity/news signals plus
 * recent performers. The model may only select from that candidate set, which
 * prevents stale-memory or previous-week-top-scorer-only predictions.
 */

import type { UpcomingPair, MatchupPair, BotMemory, ForecastData, ForecastPick } from './types';
import { isEnhancedMemory } from './types';
import { generateSection } from './llm/groq';
import { recordPrediction } from './enhanced-context';

interface ForecastInput {
  upcoming_pairs: UpcomingPair[];
  last_pairs: MatchupPair[];
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  nextWeek: number;
  enhancedContext?: string;
  standings?: Array<{ name: string; wins: number; losses: number; pointsFor: number }>;
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  topPlayers?: Array<{ playerId: string; playerName: string; team: string; position: string; points: number }>;
  injuries?: Array<{ playerId: string; playerName: string; team: string; status: string }>;
}

interface ForecastResult {
  forecast: ForecastData;
  pending: PendingPicks;
}

interface PendingPicks {
  week: number;
  picks: Array<{
    matchup_id: string | number;
    entertainer_pick: string;
    analyst_pick: string;
  }>;
}

type BoldCandidate = {
  name: string;
  position?: string;
  nflTeam?: string;
  fantasyTeam?: string;
  recentPoints?: number;
  signal: string;
  signalScore: number;
  injured: boolean;
};

const PLAYER_SIGNAL_HEADINGS = [
  'LIVE FANTASY NEWS FOR LEAGUE ROSTERS',
  'CURRENT OPPORTUNITY / BREAKOUT / INJURY SIGNALS',
  'ROSTER INJURIES',
  'EXTERNAL INJURY REPORT',
  'TRENDING PLAYERS',
  'LATEST NFL NEWS',
];

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanCandidateName(value: string): string {
  return value
    .replace(/^[-•🔥❄️🏥📰📝📊\s]+/, '')
    .replace(/^\[[0-9]{4}-[0-9]{2}-[0-9]{2}\]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\([^)]*\).*$/, '')
    .replace(/\s*\[[^\]]*\].*$/, '')
    .replace(/\s*[-–—:]\s.*$/, '')
    .trim();
}

function looksLikePlayerName(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (value.length < 5 || value.length > 45) return false;
  const blocked = /^(current|latest|roster|injury|news|trending|hot pickups|being dropped|week|season|team of|playoff|fantasy|sleeper)/i;
  return !blocked.test(value) && words.every(word => /^[A-Za-zÀ-ÖØ-öø-ÿ'.-]+$/.test(word));
}

function extractRelevantContextLines(context: string): string[] {
  if (!context.trim()) return [];
  const lines = context.split('\n');
  const selected: string[] = [];
  let active = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^={3,}|^-{3,}/.test(line)) {
      const upper = line.toUpperCase();
      active = PLAYER_SIGNAL_HEADINGS.some(h => upper.includes(h));
      continue;
    }
    if (active && line) selected.push(line);
  }
  return selected.slice(0, 80);
}

function buildBoldCandidates(input: ForecastInput): BoldCandidate[] {
  const candidates = new Map<string, BoldCandidate>();
  const injuryNames = new Set(
    (input.injuries ?? [])
      .filter(i => /out|doubtful|ir|pup|suspend/i.test(i.status))
      .map(i => normalizeName(i.playerName)),
  );

  const add = (candidate: BoldCandidate) => {
    const key = normalizeName(candidate.name);
    if (!key || !looksLikePlayerName(candidate.name)) return;
    const existing = candidates.get(key);
    const injured = candidate.injured || injuryNames.has(key);
    if (!existing || candidate.signalScore > existing.signalScore) {
      candidates.set(key, { ...candidate, injured });
    } else if (candidate.signal && !existing.signal.includes(candidate.signal)) {
      existing.signal = `${existing.signal}; ${candidate.signal}`;
      existing.injured ||= injured;
    }
  };

  for (const p of input.topPlayers ?? []) {
    add({
      name: p.playerName,
      position: p.position,
      fantasyTeam: p.team,
      recentPoints: p.points,
      signal: `${p.points.toFixed(1)} fantasy points last week`,
      signalScore: 30 + Math.min(20, p.points / 2),
      injured: false,
    });
  }

  for (const pair of input.last_pairs) {
    for (const side of [pair.winner, pair.loser]) {
      for (const p of side.topPlayers ?? []) {
        add({
          name: p.name,
          fantasyTeam: side.name,
          recentPoints: p.points,
          signal: `${p.points.toFixed(1)} points for ${side.name} last week`,
          signalScore: 20 + Math.min(18, p.points / 2),
          injured: false,
        });
      }
    }
  }

  for (const line of extractRelevantContextLines(input.enhancedContext ?? '')) {
    const name = cleanCandidateName(line);
    if (!looksLikePlayerName(name)) continue;
    const lower = line.toLowerCase();
    const positive = /starter|starting|promoted|lead role|role increase|more snaps|more targets|expected to|return|activated|breakout|rising|hot pickup|added|signed|cleared|full practice/.test(lower);
    const negative = /out\b|doubtful|injured reserve|\bir\b|suspended|season-ending|being dropped/.test(lower);
    const score = positive ? 65 : negative ? 8 : 45;
    add({
      name,
      signal: line.replace(/^[-•\s]+/, '').slice(0, 220),
      signalScore: score,
      injured: negative,
    });
  }

  return [...candidates.values()]
    .filter(c => !c.injured)
    .sort((a, b) => b.signalScore - a.signalScore || (b.recentPoints ?? 0) - (a.recentPoints ?? 0))
    .slice(0, 14);
}

function formatBoldCandidates(candidates: BoldCandidate[]): string {
  if (candidates.length === 0) return '';
  return candidates.map((c, i) => {
    const detail = [c.position, c.nflTeam, c.fantasyTeam ? `owned by ${c.fantasyTeam}` : ''].filter(Boolean).join(', ');
    return `${i + 1}. ${c.name}${detail ? ` (${detail})` : ''} — ${c.signal}`;
  }).join('\n');
}

function selectCandidateFromText(raw: string, candidates: BoldCandidate[]): BoldCandidate | null {
  const normalized = normalizeName(raw);
  return candidates.find(c => normalized.includes(normalizeName(c.name))) ?? null;
}

function deterministicBold(candidate: BoldCandidate | undefined, persona: 'entertainer' | 'analyst'): string {
  if (!candidate) return '';
  const reason = candidate.signal.replace(/[.!]+$/, '');
  return persona === 'entertainer'
    ? `${candidate.name} - The opportunity signal is real: ${reason}. This is the ceiling swing.`
    : `${candidate.name} - ${reason}. The role-based evidence gives this prediction a stronger foundation than last-week points alone.`;
}

function buildLastWeekScores(lastPairs: MatchupPair[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const p of lastPairs) {
    scores.set(p.winner.name, p.winner.points);
    scores.set(p.loser.name, p.loser.points);
  }
  return scores;
}

function calibrateConfidence(
  base: 'high' | 'medium' | 'low',
  stats: BotMemory['predictionStats'] | undefined,
): 'high' | 'medium' | 'low' {
  const toScore = (c: 'high' | 'medium' | 'low') => c === 'high' ? 2 : c === 'medium' ? 1 : 0;
  const toLabel = (s: number) => (s >= 2 ? 'high' : s === 1 ? 'medium' : 'low') as 'high' | 'medium' | 'low';
  let score = toScore(base);
  if (stats) {
    const total = stats.correct + stats.wrong;
    if (total >= 8) {
      if (stats.winRate > 0.65 || stats.hotStreak >= 3) score += 1;
      else if (stats.winRate < 0.45 || stats.hotStreak <= -3) score -= 1;
    }
  }
  return toLabel(Math.max(0, Math.min(2, score)));
}

export function makeForecastSync(input: ForecastInput): ForecastResult {
  const { upcoming_pairs, last_pairs, memEntertainer, memAnalyst, nextWeek } = input;
  const lastWeekScores = buildLastWeekScores(last_pairs);
  const picks: ForecastPick[] = [];
  const pending: PendingPicks['picks'] = [];

  for (const pair of upcoming_pairs) {
    const [team1, team2] = pair.teams;
    const t1Last = lastWeekScores.get(team1) ?? 100;
    const t2Last = lastWeekScores.get(team2) ?? 100;
    const ent1 = (memEntertainer.teams[team1]?.trust ?? 0) + t1Last / 12;
    const ent2 = (memEntertainer.teams[team2]?.trust ?? 0) + t2Last / 12;
    const ana1 = (memAnalyst.teams[team1]?.trust ?? 0) + t1Last / 9;
    const ana2 = (memAnalyst.teams[team2]?.trust ?? 0) + t2Last / 9;
    const bot1_pick = ent1 >= ent2 ? team1 : team2;
    const bot2_pick = ana1 >= ana2 ? team1 : team2;
    const c1 = calibrateConfidence(Math.abs(ent1 - ent2) > 10 ? 'high' : Math.abs(ent1 - ent2) > 4 ? 'medium' : 'low', memEntertainer.predictionStats);
    const c2 = calibrateConfidence(Math.abs(ana1 - ana2) > 13 ? 'high' : Math.abs(ana1 - ana2) > 6 ? 'medium' : 'low', memAnalyst.predictionStats);
    const pick: ForecastPick = {
      matchup_id: pair.matchup_id,
      team1,
      team2,
      bot1_pick,
      bot2_pick,
      confidence_bot1: c1,
      confidence_bot2: c2,
      note_bot1: `${bot1_pick} has the stronger blend of recent scoring and Mason's earned trust.`,
      note_bot2: `${bot2_pick} has the stronger evidence in the available recent-score sample.`,
      upset_bot1: false,
      upset_bot2: false,
    };
    if (isEnhancedMemory(memEntertainer)) recordPrediction(memEntertainer, { week: nextWeek, matchupId: pair.matchup_id, team1, team2, pick: bot1_pick, confidence: c1, reasoning: pick.note_bot1 });
    if (isEnhancedMemory(memAnalyst)) recordPrediction(memAnalyst, { week: nextWeek, matchupId: pair.matchup_id, team1, team2, pick: bot2_pick, confidence: c2, reasoning: pick.note_bot2 });
    picks.push(pick);
    pending.push({ matchup_id: pair.matchup_id, entertainer_pick: bot1_pick, analyst_pick: bot2_pick });
  }

  const candidates = buildBoldCandidates(input);
  const masonCandidate = candidates[0];
  const westyCandidate = candidates.find(c => normalizeName(c.name) !== normalizeName(masonCandidate?.name ?? '')) ?? candidates[0];
  const disagreements = picks.filter(p => p.bot1_pick !== p.bot2_pick);
  return {
    forecast: {
      picks,
      bot1_matchup_of_the_week: disagreements[0] ? `${disagreements[0].team1} vs ${disagreements[0].team2}` : picks[0] ? `${picks[0].team1} vs ${picks[0].team2}` : '',
      bot2_matchup_of_the_week: picks.find(p => p.confidence_bot2 === 'high') ? `${picks.find(p => p.confidence_bot2 === 'high')!.team1} vs ${picks.find(p => p.confidence_bot2 === 'high')!.team2}` : picks[0] ? `${picks[0].team1} vs ${picks[0].team2}` : '',
      bot1_bold_player: deterministicBold(masonCandidate, 'entertainer'),
      bot2_bold_player: deterministicBold(westyCandidate, 'analyst'),
      summary: { agree_count: picks.length - disagreements.length, total: picks.length, disagreements: disagreements.map(p => `${p.team1} vs ${p.team2}`) },
    },
    pending: { week: nextWeek, picks: pending },
  };
}

export async function makeForecast(input: ForecastInput): Promise<ForecastResult> {
  const { upcoming_pairs, last_pairs, nextWeek, enhancedContext, standings, h2hData, injuries } = input;
  if (upcoming_pairs.length === 0) {
    return { forecast: { picks: [], summary: { agree_count: 0, total: 0, disagreements: [] } }, pending: { week: nextWeek, picks: [] } };
  }

  const lastWeekScores = buildLastWeekScores(last_pairs);
  const matchupContexts = upcoming_pairs.map(pair => {
    const [team1, team2] = pair.teams;
    const t1Standing = standings?.find(s => s.name === team1);
    const t2Standing = standings?.find(s => s.name === team2);
    const h2h = h2hData?.[team1]?.[team2];
    const lines = [`${team1} vs ${team2}`];
    if (t1Standing) lines.push(`${team1}: ${t1Standing.wins}-${t1Standing.losses}, ${t1Standing.pointsFor.toFixed(1)} PF`);
    if (t2Standing) lines.push(`${team2}: ${t2Standing.wins}-${t2Standing.losses}, ${t2Standing.pointsFor.toFixed(1)} PF`);
    if (lastWeekScores.has(team1)) lines.push(`Last week ${team1}: ${lastWeekScores.get(team1)!.toFixed(1)}`);
    if (lastWeekScores.has(team2)) lines.push(`Last week ${team2}: ${lastWeekScores.get(team2)!.toFixed(1)}`);
    if (h2h) lines.push(`H2H: ${team1} ${h2h.wins}-${h2h.losses} vs ${team2}`);
    return lines.join('\n  ');
  }).join('\n\n');

  const injuryContext = (injuries ?? []).filter(i => /out|doubtful|ir/i.test(i.status)).slice(0, 12)
    .map(i => `- ${i.playerName} (${i.team}): ${i.status}`).join('\n');
  const candidates = buildBoldCandidates(input);
  const candidateText = formatBoldCandidates(candidates);
  const fullContext = [
    `WEEK ${nextWeek} MATCHUPS TO PREDICT:\n${matchupContexts}`,
    injuryContext ? `KEY INJURIES:\n${injuryContext}` : '',
    candidateText ? `APPROVED BOLD-PLAYER CANDIDATES:\n${candidateText}` : '',
    enhancedContext ?? '',
  ].filter(Boolean).join('\n\n');

  try {
    const [entertainerResponse, analystResponse, boldEntRaw, boldAnaRaw, masonDialogueRaw, westyDialogueRaw] = await Promise.all([
      generateSection({
        persona: 'entertainer', sectionType: 'Matchup Predictions', context: fullContext,
        constraints: `For each matchup, pick a winner and confidence. Format exactly:\n1. [TEAM1 vs TEAM2]: Pick: [WINNER] | Confidence: [high/medium/low] | Reason: [specific evidence-based reason]\nUse only team names and facts in context. Mason may embrace upside, but he must cite the evidence before the narrative.`, maxTokens: 700,
        validate: t => /Pick:\s*/i.test(t) && /Confidence:\s*/i.test(t),
      }),
      generateSection({
        persona: 'analyst', sectionType: 'Matchup Predictions', context: fullContext,
        constraints: `For each matchup, pick a winner and confidence. Format exactly:\n1. [TEAM1 vs TEAM2]: Pick: [WINNER] | Confidence: [high/medium/low] | Reason: [specific evidence-based reason]\nUse only supplied records, scoring, injuries, and trends. Do not imply projections or usage data that are absent.`, maxTokens: 700,
        validate: t => /Pick:\s*/i.test(t) && /Confidence:\s*/i.test(t),
      }),
      candidates.length ? generateSection({
        persona: 'entertainer', sectionType: 'Bold Player Prediction',
        context: `Choose only from this approved list:\n${candidateText}`,
        constraints: 'Pick exactly one approved player. Lead with the player name, then one sentence explaining the current opportunity signal. Format: "PLAYER - reason". Do not simply choose the highest scorer because he scored most last week.', maxTokens: 100,
        validate: t => !!selectCandidateFromText(t, candidates),
      }) : Promise.resolve(''),
      candidates.length ? generateSection({
        persona: 'analyst', sectionType: 'Bold Player Prediction',
        context: `Choose only from this approved list:\n${candidateText}`,
        constraints: 'Pick exactly one approved player. Lead with the player name, then one sentence grounded in role, availability, trend, or current news. Format: "PLAYER - reason". Do not invent matchup or usage data.', maxTokens: 100,
        validate: t => !!selectCandidateFromText(t, candidates),
      }) : Promise.resolve(''),
      generateSection({ persona: 'entertainer', sectionType: 'Week Preview Opener', context: fullContext, constraints: '3-4 sentences. Identify one real matchup storyline and one evidence-backed ceiling case. Tease, do not list every pick.', maxTokens: 220 }),
      generateSection({ persona: 'analyst', sectionType: 'Week Preview Response', context: fullContext, constraints: '3-4 sentences. Respond to the week through the strongest available evidence and explicitly flag where the data is thin.', maxTokens: 220 }),
    ]);

    const basePicks = parseLLMPredictions(upcoming_pairs, entertainerResponse, analystResponse);
    const picks = basePicks.map(p => {
      const c1 = calibrateConfidence(p.confidence_bot1, input.memEntertainer.predictionStats);
      const c2 = calibrateConfidence(p.confidence_bot2, input.memAnalyst.predictionStats);
      if (isEnhancedMemory(input.memEntertainer)) recordPrediction(input.memEntertainer, { week: nextWeek, matchupId: p.matchup_id, team1: p.team1, team2: p.team2, pick: p.bot1_pick, confidence: c1, reasoning: p.note_bot1 });
      if (isEnhancedMemory(input.memAnalyst)) recordPrediction(input.memAnalyst, { week: nextWeek, matchupId: p.matchup_id, team1: p.team1, team2: p.team2, pick: p.bot2_pick, confidence: c2, reasoning: p.note_bot2 });
      return { ...p, confidence_bot1: c1, confidence_bot2: c2 };
    });

    const pendingPicks = picks.map(p => ({ matchup_id: p.matchup_id, entertainer_pick: p.bot1_pick, analyst_pick: p.bot2_pick }));
    const disagreements = picks.filter(p => p.bot1_pick !== p.bot2_pick);
    const masonCandidate = selectCandidateFromText(boldEntRaw, candidates) ?? candidates[0];
    const westyCandidate = selectCandidateFromText(boldAnaRaw, candidates)
      ?? candidates.find(c => normalizeName(c.name) !== normalizeName(masonCandidate?.name ?? ''))
      ?? candidates[0];
    const cleanTake = (raw: string) => raw.trim().split('\n').map(l => l.replace(/^(?:entertainer|mason(?: reed)?|analyst|trent(?: weston)?|westy)[:\s]+/i, '').replace(/^\*\*|\*\*$/g, '').trim()).filter(l => l.length > 10).join(' ');
    const intro_dialogue: Array<{ speaker: 'entertainer' | 'analyst'; text: string }> = [];
    const masonTake = cleanTake(masonDialogueRaw);
    const westyTake = cleanTake(westyDialogueRaw);
    if (masonTake) intro_dialogue.push({ speaker: 'entertainer', text: masonTake });
    if (westyTake) intro_dialogue.push({ speaker: 'analyst', text: westyTake });

    return {
      forecast: {
        picks,
        intro_dialogue: intro_dialogue.length ? intro_dialogue : undefined,
        bot1_matchup_of_the_week: disagreements[0] ? `${disagreements[0].team1} vs ${disagreements[0].team2}` : `${picks[0].team1} vs ${picks[0].team2}`,
        bot2_matchup_of_the_week: picks.find(p => p.confidence_bot2 === 'high') ? `${picks.find(p => p.confidence_bot2 === 'high')!.team1} vs ${picks.find(p => p.confidence_bot2 === 'high')!.team2}` : `${picks[0].team1} vs ${picks[0].team2}`,
        bot1_bold_player: masonCandidate ? (selectCandidateFromText(boldEntRaw, candidates) ? boldEntRaw.trim() : deterministicBold(masonCandidate, 'entertainer')) : '',
        bot2_bold_player: westyCandidate ? (selectCandidateFromText(boldAnaRaw, candidates) ? boldAnaRaw.trim() : deterministicBold(westyCandidate, 'analyst')) : '',
        summary: { agree_count: picks.length - disagreements.length, total: picks.length, disagreements: disagreements.map(p => `${p.team1} vs ${p.team2}`) },
      },
      pending: { week: nextWeek, picks: pendingPicks },
    };
  } catch (error) {
    console.error('[Forecast] LLM generation failed, falling back to grounded heuristics:', error);
    return makeForecastSync(input);
  }
}

function parseLLMPredictions(pairs: UpcomingPair[], entertainerResponse: string, analystResponse: string): ForecastPick[] {
  return pairs.map(pair => {
    const [team1, team2] = pair.teams;
    const ent = extractPick(entertainerResponse, team1, team2);
    const ana = extractPick(analystResponse, team1, team2);
    return {
      matchup_id: pair.matchup_id,
      team1,
      team2,
      bot1_pick: ent.winner,
      bot2_pick: ana.winner,
      confidence_bot1: ent.confidence,
      confidence_bot2: ana.confidence,
      note_bot1: ent.reason || undefined,
      note_bot2: ana.reason || undefined,
      upset_bot1: false,
      upset_bot2: false,
    };
  });
}

function extractPick(response: string, team1: string, team2: string): { winner: string; confidence: 'high' | 'medium' | 'low'; reason: string } {
  let winner = team1;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let reason = 'The structured prediction could not be parsed cleanly, so confidence is reduced.';
  const t1 = normalizeName(team1);
  const t2 = normalizeName(team2);
  for (const line of response.split('\n')) {
    const normalizedLine = normalizeName(line);
    if (!normalizedLine.includes(t1) && !normalizedLine.includes(t2)) continue;
    const pickMatch = line.match(/pick:\s*([^|]+)/i);
    if (pickMatch) {
      const selected = normalizeName(pickMatch[1]);
      if (selected.includes(t2)) winner = team2;
      else if (selected.includes(t1)) winner = team1;
    }
    const confMatch = line.match(/confidence:\s*(high|medium|low)/i);
    if (confMatch) confidence = confMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
    const reasonMatch = line.match(/reason:\s*(.+)$/i);
    if (reasonMatch?.[1]?.trim()) reason = reasonMatch[1].trim();
    break;
  }
  return { winner, confidence, reason };
}

export interface ForecastRecords {
  entertainer: { w: number; l: number };
  analyst: { w: number; l: number };
}

export function gradePendingPicks(pending: PendingPicks | null, matchup_pairs: MatchupPair[], records: ForecastRecords): ForecastRecords {
  if (!pending || !Array.isArray(pending.picks)) return records;
  const winnersById = new Map(matchup_pairs.map(p => [String(p.matchup_id), p.winner.name]));
  for (const pick of pending.picks) {
    const actual = winnersById.get(String(pick.matchup_id));
    if (!actual) continue;
    if (pick.entertainer_pick) pick.entertainer_pick === actual ? records.entertainer.w++ : records.entertainer.l++;
    if (pick.analyst_pick) pick.analyst_pick === actual ? records.analyst.w++ : records.analyst.l++;
  }
  return records;
}

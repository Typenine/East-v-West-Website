/**
 * Publish-time editorial memory extraction.
 *
 * This module is deliberately model-free. Newsletter writing may still use the
 * legacy provider cascade when that old workflow is explicitly invoked, but
 * publication memory must never require a paid AI call. These functions turn
 * already-published Mason/Westy copy into conservative, directly grounded
 * claims using only deterministic text matching.
 */

import type { BotName } from './types';

export type EditorialClaimType = 'evaluation' | 'prediction' | 'strategy' | 'reaction';
export type EditorialStance = 'positive' | 'negative' | 'mixed' | 'neutral';

export interface EditorialClaim {
  bot: BotName;
  subjectType: 'team' | 'player' | 'league';
  subject: string;
  claim: string;
  claimType: EditorialClaimType;
  stance: EditorialStance;
  memorable: boolean;
  confidence: number;
  relatedTeam?: string;
}

export interface EditorialTeamThesis {
  bot: BotName;
  team: string;
  thesis: string;
}

export interface EditorialPlayerThesis {
  bot: BotName;
  player: string;
  thesis: string;
  team?: string;
}

export interface EditorialMemoryDigest {
  claims: EditorialClaim[];
  teamTheses: EditorialTeamThesis[];
  playerTheses: EditorialPlayerThesis[];
}

interface SynthesisInput {
  season: number;
  week: number;
  teamNames: string[];
  playerNames: string[];
  entertainerText: string;
  analystText: string;
}

const MAX_HOST_CHARS = 120_000;
const MAX_CLAIMS_PER_HOST = 24;

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueCanonical(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = normalizeSpace(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.sort((a, b) => b.length - a.length);
}

function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];
  return (normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [normalized])
    .map(normalizeSpace)
    .filter(sentence => sentence.length >= 30 && sentence.length <= 520);
}

function firstMention(text: string, candidates: string[]): string | undefined {
  const lower = text.toLowerCase();
  return candidates.find(candidate => candidate.length >= 3 && lower.includes(candidate.toLowerCase()));
}

function classifyClaimType(text: string): EditorialClaimType {
  const lower = text.toLowerCase();
  if (/\b(wrong|missed|whiffed|changed my mind|change my mind|take the l|receipt|called it|revisit|reversing)\b/.test(lower)) return 'reaction';
  if (/\b(my pick|championship pick|champion|wins? the league|make[s]? the playoffs|miss(?:es)? the playoffs|finish(?:es)?|bold prediction|i(?:'m| am) taking|i have .* over|will be|will finish|will make|will miss|going to)\b/.test(lower)) return 'prediction';
  if (/\b(trade|deal|draft|pick|asset|buy|sell|hold|rebuild|contend|roster construction|waiver|faab|allocation|cut|roster spot)\b/.test(lower)) return 'strategy';
  return 'evaluation';
}

function classifyStance(text: string): EditorialStance {
  const lower = text.toLowerCase();
  const positive = /\b(i love|i like|i trust|believer|contender|elite|strong|best|top[- ]?two|top[- ]?three|playoff team|championship pick|buying|bullish|good bet|i respect)\b/.test(lower);
  const negative = /\b(i don't trust|i do not trust|skeptic|fragile|weak|worried|outside the seven|miss(?:es)? the playoffs|selling|fade|bad bet|not buying|liability|problem)\b/.test(lower);
  if (positive && negative) return 'mixed';
  if (positive) return 'positive';
  if (negative) return 'negative';
  return 'neutral';
}

function isHighSignal(text: string, claimType: EditorialClaimType): boolean {
  if (claimType === 'prediction' || claimType === 'reaction' || claimType === 'strategy') return true;
  return /\b(i think|i believe|i trust|i don't|i do not|my ranking|my pick|i have|i'm|i am|contender|pretender|ceiling|floor|risk|pressure|hinge|bet|playoff|championship|rank|tier)\b/i.test(text);
}

function scoreClaim(text: string, claimType: EditorialClaimType, hasTeam: boolean, hasPlayer: boolean): number {
  let score = hasTeam ? 5 : 0;
  if (hasPlayer) score += 5;
  if (claimType === 'prediction') score += 8;
  if (claimType === 'reaction') score += 8;
  if (claimType === 'strategy') score += 4;
  if (/\b(i think|i believe|i trust|i don't|i do not|my ranking|my pick|i have|i'm|i am)\b/i.test(text)) score += 3;
  if (/\b(rank|tier|playoff|championship|contender|pretender|ceiling|floor|risk|pressure|hinge|bet)\b/i.test(text)) score += 3;
  return score;
}

function claimsForBot(bot: BotName, text: string, teamNames: string[], playerNames: string[]): EditorialClaim[] {
  const teams = uniqueCanonical(teamNames);
  const players = uniqueCanonical(playerNames);
  const candidates = splitSentences(text.slice(0, MAX_HOST_CHARS)).map((sentence, order) => {
    const team = firstMention(sentence, teams);
    const player = firstMention(sentence, players);
    const claimType = classifyClaimType(sentence);
    if (!team && !player && !isHighSignal(sentence, claimType)) return null;

    const subjectType: EditorialClaim['subjectType'] = player ? 'player' : team ? 'team' : 'league';
    const subject = player ?? team ?? 'East v. West';
    const stance = classifyStance(sentence);

    return {
      order,
      score: scoreClaim(sentence, claimType, Boolean(team), Boolean(player)),
      claim: {
        bot,
        subjectType,
        subject,
        claim: sentence.slice(0, 520),
        claimType,
        stance,
        memorable: claimType === 'prediction' || claimType === 'reaction' || /\b(book it|mark my words|all in|out on|love|hate|steal|disaster)\b/i.test(sentence),
        confidence: 1,
        relatedTeam: player ? team : undefined,
      } satisfies EditorialClaim,
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (candidates.length <= MAX_CLAIMS_PER_HOST) return candidates.map(row => row.claim);

  const selected = new Set<number>();
  for (const team of teams) {
    const best = candidates
      .filter(row => row.claim.subjectType === 'team' && row.claim.subject === team)
      .sort((a, b) => b.score - a.score || a.order - b.order)[0];
    if (best) selected.add(best.order);
  }

  for (const row of [...candidates].sort((a, b) => b.score - a.score || a.order - b.order)) {
    if (selected.size >= MAX_CLAIMS_PER_HOST) break;
    selected.add(row.order);
  }

  return candidates.filter(row => selected.has(row.order)).sort((a, b) => a.order - b.order).map(row => row.claim);
}

function buildTheses(claims: EditorialClaim[], teamNames: string[]): { teamTheses: EditorialTeamThesis[]; playerTheses: EditorialPlayerThesis[] } {
  const teamTheses: EditorialTeamThesis[] = [];
  const playerTheses: EditorialPlayerThesis[] = [];

  for (const bot of ['entertainer', 'analyst'] as const) {
    for (const team of teamNames) {
      const relevant = claims.filter(claim =>
        claim.bot === bot &&
        ((claim.subjectType === 'team' && claim.subject.toLowerCase() === team.toLowerCase()) || claim.relatedTeam?.toLowerCase() === team.toLowerCase())
      );
      const latest = relevant[relevant.length - 1];
      if (latest) teamTheses.push({ bot, team, thesis: latest.claim });
    }

    const playerSubjects = uniqueCanonical(claims.filter(claim => claim.bot === bot && claim.subjectType === 'player').map(claim => claim.subject));
    for (const player of playerSubjects) {
      const relevant = claims.filter(claim => claim.bot === bot && claim.subjectType === 'player' && claim.subject.toLowerCase() === player.toLowerCase());
      const latest = relevant[relevant.length - 1];
      if (latest) playerTheses.push({ bot, player, thesis: latest.claim, team: latest.relatedTeam });
    }
  }

  return { teamTheses, playerTheses };
}

export async function synthesizePublishedIntelligence(input: SynthesisInput): Promise<EditorialMemoryDigest> {
  const entertainerText = input.entertainerText.slice(0, MAX_HOST_CHARS);
  const analystText = input.analystText.slice(0, MAX_HOST_CHARS);
  if (!entertainerText.trim() && !analystText.trim()) return { claims: [], teamTheses: [], playerTheses: [] };

  const claims = [
    ...claimsForBot('entertainer', entertainerText, input.teamNames, input.playerNames),
    ...claimsForBot('analyst', analystText, input.teamNames, input.playerNames),
  ];
  const { teamTheses, playerTheses } = buildTheses(claims, input.teamNames);
  return { claims, teamTheses, playerTheses };
}

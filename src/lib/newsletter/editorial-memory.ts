/**
 * Publish-time editorial memory extraction.
 *
 * This module is deliberately model-free. It converts already-published
 * Mason/Westy copy into conservative receipts using deterministic text matching.
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

interface ContextBlock {
  body: string;
  team?: string;
  section?: string;
}

const MAX_HOST_CHARS = 120_000;
const MAX_CLAIMS_PER_HOST = 64;

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

function parseBlocks(text: string): ContextBlock[] {
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map(raw => {
      let body = raw.trim();
      const teamMatch = body.match(/^\[\[TEAM:([^\]]+)\]\]\s*/i);
      const team = teamMatch ? normalizeSpace(teamMatch[1]) : undefined;
      if (teamMatch) body = body.slice(teamMatch[0].length);
      const sectionMatch = body.match(/^\[\[SECTION:([^\]]+)\]\]\s*/i);
      const section = sectionMatch ? normalizeSpace(sectionMatch[1]) : undefined;
      if (sectionMatch) body = body.slice(sectionMatch[0].length);
      if (!section && teamMatch) {
        const secondSection = body.match(/^\[\[SECTION:([^\]]+)\]\]\s*/i);
        if (secondSection) {
          body = body.slice(secondSection[0].length);
          return { body: body.trim(), team, section: normalizeSpace(secondSection[1]) };
        }
      }
      return { body: body.trim(), team, section };
    })
    .filter(block => block.body.length >= 15);
}

function splitSentences(text: string): string[] {
  const normalized = normalizeSpace(text);
  if (!normalized) return [];
  return (normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [normalized])
    .map(normalizeSpace)
    .filter(sentence => sentence.length >= 20 && sentence.length <= 520);
}

function firstMentionByPosition(text: string, candidates: string[]): string | undefined {
  const lower = text.toLowerCase();
  let best: { candidate: string; index: number } | undefined;
  for (const candidate of candidates) {
    if (candidate.length < 3) continue;
    const index = lower.indexOf(candidate.toLowerCase());
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && candidate.length > best.candidate.length)) {
      best = { candidate, index };
    }
  }
  return best?.candidate;
}

function classifyClaimType(text: string, section?: string): EditorialClaimType {
  const lower = text.toLowerCase();
  if (/\b(wrong|missed|whiffed|changed my mind|change my mind|take the l|receipt|called it|revisit|reversing|walk that back|taking that back)\b/.test(lower)) return 'reaction';
  if (/\b(my pick|championship pick|champion|wins? the league|make[s]? the playoffs|miss(?:es)? the playoffs|finish(?:es)?|bold prediction|i(?:'m| am) taking|i have .* over|will be|will finish|will make|will miss|going to|over .* in the final|defining championship player|lead regular-season points|highest-scoring)\b/.test(lower)) return 'prediction';
  if (section && /OFFICIAL SEASON PICKS|BOLD PREDICTIONS/i.test(section) && /\b(first|second|third|top[- ]?two|top[- ]?three|playoff|final|points|championship|title|defining|over)\b/i.test(text)) return 'prediction';
  if (/\b(trade|deal|draft|pick|asset|buy|sell|hold|rebuild|contend|roster construction|waiver|faab|allocation|cut|roster spot)\b/.test(lower)) return 'strategy';
  return 'evaluation';
}

function classifyStance(text: string): EditorialStance {
  const lower = text.toLowerCase();
  const positive = /\b(i love|i like|i trust|believer|contender|elite|strong|best|top[- ]?two|top[- ]?three|playoff team|championship pick|buying|bullish|good bet|i respect|wins? the title|wins? the league)\b/.test(lower);
  const negative = /\b(i don't trust|i do not trust|skeptic|fragile|weak|worried|outside the seven|miss(?:es)? the playoffs|selling|fade|bad bet|not buying|liability|problem|last place)\b/.test(lower);
  if (positive && negative) return 'mixed';
  if (positive) return 'positive';
  if (negative) return 'negative';
  return 'neutral';
}

function isHighSignal(text: string, claimType: EditorialClaimType, section?: string): boolean {
  if (claimType === 'prediction' || claimType === 'reaction' || claimType === 'strategy') return true;
  if (section && /POWER RANKINGS|OFFICIAL SEASON PICKS|BOLD PREDICTIONS|FINAL RECEIPTS/i.test(section)) return true;
  return /\b(i think|i believe|i trust|i don't|i do not|my ranking|my pick|i have|i'm|i am|contender|pretender|ceiling|floor|risk|pressure|hinge|bet|playoff|championship|rank|tier)\b/i.test(text);
}

function scoreClaim(text: string, claimType: EditorialClaimType, hasTeam: boolean, hasPlayer: boolean, hasContext: boolean): number {
  let score = hasTeam ? 5 : 0;
  if (hasPlayer) score += 5;
  if (hasContext) score += 2;
  if (claimType === 'prediction') score += 10;
  if (claimType === 'reaction') score += 9;
  if (claimType === 'strategy') score += 4;
  if (/\b(i think|i believe|i trust|i don't|i do not|my ranking|my pick|i have|i'm|i am)\b/i.test(text)) score += 3;
  if (/\b(rank|tier|playoff|championship|contender|pretender|ceiling|floor|risk|pressure|hinge|bet|defining)\b/i.test(text)) score += 3;
  return score;
}

function looksPlayerFocused(sentence: string, player?: string, section?: string): boolean {
  if (!player) return false;
  if (section && /DEFINING|BOLD PREDICTIONS|OFFICIAL SEASON PICKS/i.test(section) && /defining|player|quarterback|receiver|running back|tight end/i.test(sentence)) return true;
  const lower = sentence.toLowerCase();
  const playerLower = player.toLowerCase();
  return lower.startsWith(playerLower) || lower.startsWith(`${playerLower}'s`) || /\bmy defining championship player\b/i.test(sentence);
}

function claimsForBot(bot: BotName, text: string, teamNames: string[], playerNames: string[]): EditorialClaim[] {
  const teams = uniqueCanonical(teamNames);
  const players = uniqueCanonical(playerNames);
  const candidates: Array<{ order: number; score: number; claim: EditorialClaim }> = [];
  let order = 0;

  for (const block of parseBlocks(text.slice(0, MAX_HOST_CHARS))) {
    const blockTeam = block.team ? teams.find(team => team.toLowerCase() === block.team!.toLowerCase()) ?? block.team : undefined;
    for (const sentence of splitSentences(block.body)) {
      const team = firstMentionByPosition(sentence, teams) ?? blockTeam;
      const directTeam = firstMentionByPosition(sentence, teams);
      const player = firstMentionByPosition(sentence, players);
      const claimType = classifyClaimType(sentence, block.section);
      if (!team && !player && !isHighSignal(sentence, claimType, block.section)) {
        order += 1;
        continue;
      }

      const playerFocused = looksPlayerFocused(sentence, player, block.section);
      const subjectType: EditorialClaim['subjectType'] = playerFocused || (!directTeam && player && !blockTeam)
        ? 'player'
        : team
          ? 'team'
          : player
            ? 'player'
            : 'league';
      const subject = subjectType === 'player' ? player! : subjectType === 'team' ? team! : 'East v. West';
      const stance = classifyStance(sentence);
      const relatedTeam = subjectType === 'player' ? (directTeam ?? blockTeam) : undefined;

      candidates.push({
        order,
        score: scoreClaim(sentence, claimType, Boolean(team), Boolean(player), Boolean(blockTeam || block.section)),
        claim: {
          bot,
          subjectType,
          subject,
          claim: sentence.slice(0, 520),
          claimType,
          stance,
          memorable: claimType === 'prediction' || claimType === 'reaction' || /\b(book it|mark my words|all in|out on|love|hate|steal|disaster|defining championship player)\b/i.test(sentence),
          confidence: blockTeam && !directTeam && subjectType === 'team' ? 0.9 : 1,
          relatedTeam,
        },
      });
      order += 1;
    }
  }

  if (candidates.length <= MAX_CLAIMS_PER_HOST) return candidates.map(row => row.claim);

  const selected = new Set<number>();

  for (const row of candidates.filter(row => row.claim.claimType === 'prediction' || row.claim.claimType === 'reaction')) {
    selected.add(row.order);
  }

  for (const team of teams) {
    const best = candidates
      .filter(row => row.claim.subjectType === 'team' && row.claim.subject.toLowerCase() === team.toLowerCase())
      .sort((a, b) => b.score - a.score || a.order - b.order)[0];
    if (best) selected.add(best.order);
  }

  for (const row of [...candidates].sort((a, b) => b.score - a.score || a.order - b.order)) {
    if (selected.size >= MAX_CLAIMS_PER_HOST) break;
    selected.add(row.order);
  }

  return candidates
    .filter(row => selected.has(row.order))
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_CLAIMS_PER_HOST)
    .map(row => row.claim);
}

function preferredCurrentClaim(relevant: EditorialClaim[]): EditorialClaim | undefined {
  const substantive = relevant.filter(claim => claim.claimType !== 'prediction' && claim.claimType !== 'reaction');
  return substantive[substantive.length - 1] ?? relevant[relevant.length - 1];
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
      const current = preferredCurrentClaim(relevant);
      if (current) teamTheses.push({ bot, team, thesis: current.claim });
    }

    const playerSubjects = uniqueCanonical(claims.filter(claim => claim.bot === bot && claim.subjectType === 'player').map(claim => claim.subject));
    for (const player of playerSubjects) {
      const relevant = claims.filter(claim => claim.bot === bot && claim.subjectType === 'player' && claim.subject.toLowerCase() === player.toLowerCase());
      const current = preferredCurrentClaim(relevant);
      if (current) playerTheses.push({ bot, player, thesis: current.claim, team: current.relatedTeam });
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

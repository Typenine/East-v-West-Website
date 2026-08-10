/**
 * Editorial intelligence synthesis.
 *
 * Runs once when a newsletter is published. It converts the hosts' finished
 * copy into compact, structured memory that can be retrieved in later episodes.
 * The synthesis is deliberately separated from voice generation: this pass is
 * about what each host believes, what changed, and which team/player thesis is
 * now active.
 */

import type { BotName } from './types';
import { generateWithCascade } from './llm/cascade';

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

const MAX_HOST_CHARS = 18_000;
const MAX_CLAIMS = 36;

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function isBotName(value: unknown): value is BotName {
  return value === 'entertainer' || value === 'analyst';
}

function sanitizeDigest(value: unknown, teams: string[], players: string[]): EditorialMemoryDigest | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const teamLookup = new Map(teams.map(t => [t.toLowerCase(), t]));
  const playerLookup = new Map(players.map(p => [p.toLowerCase(), p]));

  const claims: EditorialClaim[] = [];
  if (Array.isArray(obj.claims)) {
    for (const row of obj.claims.slice(0, MAX_CLAIMS)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (!isBotName(r.bot) || typeof r.claim !== 'string' || typeof r.subject !== 'string') continue;
      const claim = normalizeSpace(r.claim).slice(0, 420);
      if (claim.length < 20) continue;
      const subjectType = r.subjectType === 'player' || r.subjectType === 'league' ? r.subjectType : 'team';
      const rawSubject = normalizeSpace(r.subject);
      const subject = subjectType === 'team'
        ? (teamLookup.get(rawSubject.toLowerCase()) ?? rawSubject)
        : subjectType === 'player'
          ? (playerLookup.get(rawSubject.toLowerCase()) ?? rawSubject)
          : rawSubject;
      const claimType: EditorialClaimType = ['prediction', 'strategy', 'reaction'].includes(String(r.claimType))
        ? r.claimType as EditorialClaimType
        : 'evaluation';
      const stance: EditorialStance = ['positive', 'negative', 'mixed'].includes(String(r.stance))
        ? r.stance as EditorialStance
        : 'neutral';
      const relatedTeam = typeof r.relatedTeam === 'string'
        ? (teamLookup.get(r.relatedTeam.toLowerCase()) ?? normalizeSpace(r.relatedTeam))
        : undefined;
      claims.push({
        bot: r.bot,
        subjectType,
        subject,
        claim,
        claimType,
        stance,
        memorable: r.memorable === true,
        confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.65,
        relatedTeam,
      });
    }
  }

  const teamTheses: EditorialTeamThesis[] = [];
  if (Array.isArray(obj.teamTheses)) {
    for (const row of obj.teamTheses.slice(0, 24)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (!isBotName(r.bot) || typeof r.team !== 'string' || typeof r.thesis !== 'string') continue;
      const thesis = normalizeSpace(r.thesis).slice(0, 520);
      if (thesis.length < 20) continue;
      teamTheses.push({
        bot: r.bot,
        team: teamLookup.get(r.team.toLowerCase()) ?? normalizeSpace(r.team),
        thesis,
      });
    }
  }

  const playerTheses: EditorialPlayerThesis[] = [];
  if (Array.isArray(obj.playerTheses)) {
    for (const row of obj.playerTheses.slice(0, 24)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (!isBotName(r.bot) || typeof r.player !== 'string' || typeof r.thesis !== 'string') continue;
      const thesis = normalizeSpace(r.thesis).slice(0, 420);
      if (thesis.length < 20) continue;
      playerTheses.push({
        bot: r.bot,
        player: playerLookup.get(r.player.toLowerCase()) ?? normalizeSpace(r.player),
        thesis,
        team: typeof r.team === 'string' ? (teamLookup.get(r.team.toLowerCase()) ?? normalizeSpace(r.team)) : undefined,
      });
    }
  }

  if (claims.length === 0 && teamTheses.length === 0 && playerTheses.length === 0) return null;
  return { claims, teamTheses, playerTheses };
}

function sentenceClaims(bot: BotName, text: string, teams: string[], players: string[]): EditorialClaim[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeSpace)
    .filter(s => s.length >= 35 && s.length <= 420);
  const claims: EditorialClaim[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const team = teams.find(t => lower.includes(t.toLowerCase()));
    const player = players.find(p => p.length >= 5 && lower.includes(p.toLowerCase()));
    if (!team && !player) continue;
    const prediction = /\b(will|going to|expect|project|future|next year|next season|in two years|long[- ]term)\b/i.test(sentence);
    claims.push({
      bot,
      subjectType: player ? 'player' : 'team',
      subject: player ?? team ?? 'League',
      claim: sentence,
      claimType: prediction ? 'prediction' : 'evaluation',
      stance: 'neutral',
      memorable: /\b(mark my words|book it|i was wrong|i was right|all in|out on|love|hate|cooked|steal|disaster)\b/i.test(sentence),
      confidence: 0.5,
      relatedTeam: team,
    });
    if (claims.length >= 16) break;
  }
  return claims;
}

function fallbackDigest(input: SynthesisInput): EditorialMemoryDigest {
  const claims = [
    ...sentenceClaims('entertainer', input.entertainerText, input.teamNames, input.playerNames),
    ...sentenceClaims('analyst', input.analystText, input.teamNames, input.playerNames),
  ];
  const teamTheses: EditorialTeamThesis[] = [];
  for (const bot of ['entertainer', 'analyst'] as const) {
    for (const team of input.teamNames) {
      const relevant = claims.filter(c => c.bot === bot && (c.subject === team || c.relatedTeam === team));
      if (relevant.length) teamTheses.push({ bot, team, thesis: relevant[relevant.length - 1].claim });
    }
  }
  const playerTheses: EditorialPlayerThesis[] = claims
    .filter(c => c.subjectType === 'player')
    .map(c => ({ bot: c.bot, player: c.subject, thesis: c.claim, team: c.relatedTeam }));
  return { claims, teamTheses, playerTheses };
}

export async function synthesizePublishedIntelligence(input: SynthesisInput): Promise<EditorialMemoryDigest> {
  const entertainerText = input.entertainerText.slice(0, MAX_HOST_CHARS);
  const analystText = input.analystText.slice(0, MAX_HOST_CHARS);
  if (!entertainerText.trim() && !analystText.trim()) return { claims: [], teamTheses: [], playerTheses: [] };

  const systemPrompt = `You are the memory editor for a long-running fantasy-football publication. Your job is NOT to write sports copy. Extract durable beliefs and evolving theses from the two hosts' already-published words so a future episode can remember what each person actually said.

Rules:
- Never invent a fact, opinion, team, player, or relationship.
- Attribute every claim to the correct host.
- Capture substantive evaluations, predictions, roster-strategy opinions, changed minds, admissions of error, and strong reactions.
- Prefer claims that could matter in a later episode. Ignore filler, jokes without a real position, greetings, and generic transitions.
- A team thesis should summarize the host's CURRENT view of that team, not merely repeat a score.
- A player thesis should summarize the host's CURRENT view of that player's dynasty/fantasy significance when the text supports one.
- If a host changes their mind, the newest position is the current thesis, but preserve the changed position as a claim.
- Return strict JSON only. No markdown.`;

  const userPrompt = `Season ${input.season}, Week ${input.week}.

CANONICAL TEAM NAMES:
${input.teamNames.join('\n')}

KNOWN PLAYER NAMES FROM THIS ISSUE:
${input.playerNames.slice(0, 120).join('\n') || '(none extracted)'}

MASON / ENTERTAINER PUBLISHED COPY:
${entertainerText || '(none)'}

WESTY / ANALYST PUBLISHED COPY:
${analystText || '(none)'}

Return this exact JSON shape:
{
  "claims": [
    {
      "bot": "entertainer" | "analyst",
      "subjectType": "team" | "player" | "league",
      "subject": "canonical subject name",
      "claim": "one concise statement of what the host believes/said",
      "claimType": "evaluation" | "prediction" | "strategy" | "reaction",
      "stance": "positive" | "negative" | "mixed" | "neutral",
      "memorable": true | false,
      "confidence": 0.0-1.0,
      "relatedTeam": "team name if this is a player claim"
    }
  ],
  "teamTheses": [{ "bot": "entertainer" | "analyst", "team": "team", "thesis": "current team-level view" }],
  "playerTheses": [{ "bot": "entertainer" | "analyst", "player": "player", "team": "team if known", "thesis": "current player-level view" }]
}

Keep at most 18 claims per host and only include theses supported by the published copy.`;

  try {
    const response = await generateWithCascade({
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      maxTokens: 2600,
      claudeThinkingBudget: 2048,
      sectionName: 'Editorial Memory Synthesis',
      validate: (content) => {
        try {
          const parsed = JSON.parse(cleanJsonText(content));
          return Boolean(parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).claims));
        } catch {
          return false;
        }
      },
    });
    const parsed = JSON.parse(cleanJsonText(response.content)) as unknown;
    return sanitizeDigest(parsed, input.teamNames, input.playerNames) ?? fallbackDigest(input);
  } catch (error) {
    console.warn('[EditorialMemory] LLM synthesis failed; using deterministic fallback:', error instanceof Error ? error.message : String(error));
    return fallbackDigest(input);
  }
}

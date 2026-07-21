import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { ANALYST_BRAIN, ENTERTAINER_BRAIN, type BotBrain } from '@/lib/newsletter/bot-brain';
import { buildStaticLeagueContext } from '@/lib/newsletter/league-knowledge';
import { getAllTeamCards } from '@/lib/newsletter/team-narratives';
import { getLeagueRulesContext } from '@/lib/newsletter';
import type { BotName } from '@/lib/newsletter/types';
import {
  loadAllPhrasePools,
  loadAllTeamNarrativeOverrides,
  loadBotSettings,
} from '@/server/db/personality-queries';
import { loadBotMemory } from '@/server/db/newsletter-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExportPack = 'mason' | 'westy' | 'shared';
type ExportFormat = 'md' | 'json';
type SignaturePhrases = { openers?: string[]; closers?: string[]; verbalTics?: string[] };

function isAdmin(req: NextRequest): boolean {
  return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function mergeBrain(base: BotBrain, settings: Awaited<ReturnType<typeof loadBotSettings>>): BotBrain {
  const signature = (settings?.signaturePhrases ?? null) as SignaturePhrases | null;
  return {
    ...base,
    displayName: settings?.displayName?.trim() || base.displayName,
    role: settings?.roleDescription?.trim() || base.role,
    voice: { ...base.voice, ...(settings?.voiceConfig ?? {}) },
    safetyBoundaries: unique([...base.safetyBoundaries, ...(settings?.safetyBoundaries ?? [])]),
    verbalTics: unique([...base.verbalTics, ...(signature?.verbalTics ?? [])]),
    openers: unique([...base.openers, ...(signature?.openers ?? [])]),
    closers: unique([...base.closers, ...(signature?.closers ?? [])]),
  };
}

function markdownList(values: string[]): string {
  return values.length > 0 ? values.map(value => `- ${value}`).join('\n') : '- None recorded';
}

function markdownTable(entries: Array<[string, string | number]>): string {
  return ['| Dimension | Value |', '|---|---:|', ...entries.map(([key, value]) => `| ${key} | ${String(value)} |`)].join('\n');
}

function jsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function botKey(pack: ExportPack): BotName | null {
  if (pack === 'mason') return 'entertainer';
  if (pack === 'westy') return 'analyst';
  return null;
}

function botBase(bot: BotName): BotBrain {
  return bot === 'entertainer' ? ENTERTAINER_BRAIN : ANALYST_BRAIN;
}

function botFileName(bot: BotName, season: number, format: ExportFormat): string {
  const name = bot === 'entertainer' ? 'mason-reed' : 'trent-weston';
  return `${name}-personality-pack-${season}.${format === 'md' ? 'md' : 'json'}`;
}

function renderBotMarkdown(payload: {
  season: number;
  exportedAt: string;
  brain: BotBrain;
  currentState: unknown;
  adminSettings: unknown;
  phrasePools: Record<string, string[]>;
}): string {
  const { brain } = payload;
  return `# ${brain.displayName} — Claude Project Personality Pack

Generated for the ${payload.season} East v. West season on ${payload.exportedAt}.

## How to use this file

Upload this file to the Claude Project that will write a special East v. West episode. Treat **Permanent Personality Matrix** as the character's stable identity. Treat **Current Evolving State** as the latest continuity snapshot. The stable identity wins whenever the current state is incomplete or contradictory.

## Permanent Personality Matrix

- **Character key:** ${brain.key}
- **Name:** ${brain.displayName}
- **Short name:** ${brain.shortName}
- **Role:** ${brain.role}
- **Editorial color:** ${brain.color}

### Voice controls

${markdownTable([
    ['Sarcasm', brain.voice.sarcasm],
    ['Excitability', brain.voice.excitability],
    ['Depth', brain.voice.depth],
    ['Snark', brain.voice.snark],
    ['Pacing', brain.voice.pacing],
    ['Model temperature reference', brain.voice.temperature],
  ])}

### Debate behavior

- **Risk bias:** ${brain.debate.riskBias}
- **Concede rate:** ${brain.debate.concedeRate}
- **Concede style:** ${brain.debate.concedeStyle}
- **Pushback style:** ${brain.debate.attackStyle}

### Baseline traits

${markdownTable(Object.entries(brain.baseTraits).map(([key, value]) => [key, value]))}

### Blind spots

${markdownList(brain.blindSpots)}

### Natural verbal tics

${markdownList(brain.verbalTics)}

### Approved opening patterns

${markdownList(brain.openers)}

### Approved closing patterns

${markdownList(brain.closers)}

### Non-negotiable boundaries

${markdownList(brain.safetyBoundaries)}

## Performance discipline

- Evidence comes before personality. Character voice may sharpen a supported conclusion but may not replace the supporting facts.
- Distinguish verified facts, reported news, and inference.
- Use exact team and player names. Explain what happened, why it happened, and what changes next.
- Do not invent scores, roster roles, transaction details, statistics, quotations, or certainty.
- Criticize roster and management decisions rather than attacking the manager personally.
- Maintain continuity with earlier sections. When changing an opinion, identify the new evidence that caused the change.

## Current Evolving State

This is the complete saved state available to the website for this season, including team relationships, player relationships, predictions, emotional state, speech evolution, corrections, favorites, disappointments, and partner dynamics.

${jsonBlock(payload.currentState)}

## Effective admin settings

${jsonBlock(payload.adminSettings)}

## Relevant phrase pools

${jsonBlock(payload.phrasePools)}

## Claude writing instruction

Write as ${brain.displayName}, not as an assistant describing ${brain.displayName}. Preserve the role, risk bias, pacing, blind spots, and evidence rules above. Use verbal tics sparingly and organically. Do not force catchphrases. When another host's material is provided, respond to what that host actually said rather than restarting the topic.
`;
}

function mergeTeamCards(overrides: Awaited<ReturnType<typeof loadAllTeamNarrativeOverrides>>): unknown[] {
  const baseCards = getAllTeamCards();
  const byName = new Map(overrides.map(row => [row.teamName.toLowerCase(), row.cardData]));
  const merged: unknown[] = baseCards.map(card => ({ ...card, ...(byName.get(card.teamName.toLowerCase()) ?? {}) }));
  const existing = new Set(baseCards.map(card => card.teamName.toLowerCase()));
  for (const override of overrides) {
    if (!existing.has(override.teamName.toLowerCase())) merged.push({ teamName: override.teamName, ...override.cardData });
  }
  return merged;
}

function renderSharedMarkdown(payload: {
  season: number;
  exportedAt: string;
  staticLeagueContext: string;
  leagueRules: string;
  teamNarrativeCards: unknown[];
  phrasePools: Record<string, string[]>;
}): string {
  return `# East v. West — Shared Show Bible

Generated for the ${payload.season} season on ${payload.exportedAt}.

## Project setup

Upload this file together with the separate Mason Reed and Trent Weston personality packs. This document is shared factual and editorial context. It does not replace either host's individual personality matrix.

## Show premise and host division

- Mason Reed is the narrative-first entertainer. He identifies stakes, conflict, emotion, surprise, and memorable franchise stories.
- Trent "Westy" Weston is the process-first analyst. He audits value, probability, roster construction, evidence quality, and long-term consequences.
- The hosts should sound like collaborators in one production. The second speaker responds to the first rather than repeating the introduction.
- Disagreement should arise from their different priorities, not from contradictory facts.
- Special episodes may be longer and more structured than the automated weekly newsletter, but they must remain recognizably East v. West.

## Editorial standards

1. Ground every factual claim in the supplied league export, uploaded research, or current cited reporting.
2. Never infer a trade chain, roster need, player role, or historical result when the evidence is missing.
3. Use the full league rules when evaluating strategy, especially SuperFlex value, scoring, roster limits, taxi rules, and draft eligibility.
4. Keep team names canonical and preserve exact player-team pairings.
5. Separate fact from projection. Bold predictions are allowed only when labeled and supported by a concrete trigger.
6. Avoid duplicated paragraphs between hosts. Mason should carry the narrative spine; Westy should add an independent audit or counterpoint.
7. Retired jokes remain retired. Running jokes are optional, not mandatory.
8. Critique decisions without personal attacks, collusion claims, or commissioner-style rulings.

## Recommended special-episode workflow

1. Establish the episode's central question and methodology.
2. Build a shared evidence packet before drafting prose.
3. Give Mason the primary narrative assignment and Westy a distinct analytical assignment.
4. Compare all teams or subjects under one consistent rubric.
5. Run a final editorial pass for factual consistency, grade normalization, repetition, and unsupported claims.
6. Export the finished issue as a PDF for upload to the website's newsletter archive.

## Static league context

${payload.staticLeagueContext}

## League rules

${payload.leagueRules}

## Team narrative cards

These cards include franchise archetypes, historical and current arcs, bot relationships, running and retired jokes, rivalries, sensitivities, achievements, wounds, and preferred angles. Treat objective fields as context and subjective fields as optional framing.

${jsonBlock(payload.teamNarrativeCards)}

## Shared phrase pools

${jsonBlock(payload.phrasePools)}
`;
}

function responseWithDownload(body: string, fileName: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const pack = (req.nextUrl.searchParams.get('pack') || 'mason') as ExportPack;
  const format = (req.nextUrl.searchParams.get('format') || 'md') as ExportFormat;
  const seasonRaw = Number(req.nextUrl.searchParams.get('season') || new Date().getFullYear());
  const season = Number.isFinite(seasonRaw) ? Math.trunc(seasonRaw) : new Date().getFullYear();

  if (!['mason', 'westy', 'shared'].includes(pack)) return Response.json({ error: 'pack must be mason, westy, or shared' }, { status: 400 });
  if (!['md', 'json'].includes(format)) return Response.json({ error: 'format must be md or json' }, { status: 400 });

  const exportedAt = new Date().toISOString();
  const bot = botKey(pack);

  if (bot) {
    const [settings, currentState, allPhrasePools] = await Promise.all([
      loadBotSettings(bot),
      loadBotMemory(bot, season),
      loadAllPhrasePools(),
    ]);
    const brain = mergeBrain(botBase(bot), settings);
    const relevantPrefix = bot === 'entertainer' ? 'mason_' : 'westy_';
    const phrasePools = Object.fromEntries(
      allPhrasePools
        .filter(row => row.poolKey === 'banned_global' || row.poolKey.startsWith(relevantPrefix))
        .map(row => [row.poolKey, row.phrases]),
    );
    const payload = {
      schemaVersion: 1,
      pack: bot === 'entertainer' ? 'mason' : 'westy',
      season,
      exportedAt,
      brain,
      currentState,
      adminSettings: settings,
      phrasePools,
    };
    if (format === 'json') return responseWithDownload(JSON.stringify(payload, null, 2), botFileName(bot, season, format), 'application/json; charset=utf-8');
    return responseWithDownload(renderBotMarkdown(payload), botFileName(bot, season, format), 'text/markdown; charset=utf-8');
  }

  const [overrides, allPhrasePools] = await Promise.all([
    loadAllTeamNarrativeOverrides(),
    loadAllPhrasePools(),
  ]);
  const phrasePools = Object.fromEntries(allPhrasePools.map(row => [row.poolKey, row.phrases]));
  const payload = {
    schemaVersion: 1,
    pack: 'shared',
    season,
    exportedAt,
    staticLeagueContext: buildStaticLeagueContext(),
    leagueRules: getLeagueRulesContext(),
    teamNarrativeCards: mergeTeamCards(overrides),
    phrasePools,
  };
  const fileName = `east-v-west-shared-show-bible-${season}.${format === 'md' ? 'md' : 'json'}`;
  if (format === 'json') return responseWithDownload(JSON.stringify(payload, null, 2), fileName, 'application/json; charset=utf-8');
  return responseWithDownload(renderSharedMarkdown(payload), fileName, 'text/markdown; charset=utf-8');
}

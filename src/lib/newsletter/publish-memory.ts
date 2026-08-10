/**
 * Publish-time memory feedback and editorial intelligence.
 *
 * Publishing is the canonical memory checkpoint. The finished issue gets one
 * synthesis pass that turns what Mason and Westy actually said into durable
 * claims and team/player theses. Both memory records also receive a compact
 * shared dossier so later section prompts can retrieve both hosts' history even
 * when a generator is working with only one BotMemory object.
 */

import { loadBotMemory, saveBotMemory, loadStagedNewsletter } from '@/server/db/newsletter-queries';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { TEAM_NAMES } from '@/lib/constants/league';
import type {
  BotMemory,
  BotName,
  DeepPlayerRelationship,
  DeepTeamRelationship,
  EditorialCorrectionEntry,
} from '@/lib/newsletter/types';
import {
  synthesizePublishedIntelligence,
  type EditorialClaim,
  type EditorialMemoryDigest,
} from '@/lib/newsletter/editorial-memory';

interface SectionContent {
  type: string;
  bot1_text?: string;
  bot2_text?: string;
  [key: string]: unknown;
}

const BOT_KEYS: Record<BotName, Set<string>> = {
  entertainer: new Set([
    'bot1_text', 'bot1', 'entertainer', 'entertainer_paragraph', 'entertainer_position',
    'entertainer_argument', 'note_bot1', 'est_bot1', 'bot1_bold_player',
    'bot1_matchup_of_the_week', 'entertainer_pick',
  ]),
  analyst: new Set([
    'bot2_text', 'bot2', 'analyst', 'analyst_paragraph', 'analyst_position',
    'analyst_argument', 'note_bot2', 'est_bot2', 'bot2_bold_player',
    'bot2_matchup_of_the_week', 'analyst_pick',
  ]),
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = normalize(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function hostLabel(bot: BotName): string {
  return bot === 'entertainer' ? 'Mason' : 'Westy';
}

function generateNote(original: string, published: string): string {
  const delta = published.length - original.length;
  const pctChange = original.length > 0 ? Math.abs(delta / original.length) : 1;
  if (pctChange > 0.5) return 'Section substantially rewritten';
  if (delta < -50) return 'Content shortened';
  if (delta > 50) return 'Content expanded';
  return 'Minor editorial correction';
}

function diffSections(
  published: SectionContent[],
  original: SectionContent[],
  field: 'bot1_text' | 'bot2_text',
): Array<{ section: string; original: string; published: string; note: string }> {
  const corrections: Array<{ section: string; original: string; published: string; note: string }> = [];
  for (let i = 0; i < published.length; i++) {
    const pub = published[i];
    const orig = original[i];
    if (!pub || !orig) continue;
    const pubText = String(pub[field] ?? '').trim();
    const origText = String(orig[field] ?? '').trim();
    if (!pubText || !origText || pubText === origText) continue;
    corrections.push({ section: pub.type ?? `section_${i}`, original: origText, published: pubText, note: generateNote(origText, pubText) });
  }
  return corrections;
}

/** Walk heterogeneous section JSON and collect only text attributable to one host. */
function collectBotText(value: unknown, bot: BotName, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectBotText(item, bot, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const obj = value as Record<string, unknown>;
  if (obj.speaker === bot && typeof obj.text === 'string' && normalize(obj.text).length >= 12) out.push(obj.text);
  for (const [key, child] of Object.entries(obj)) {
    if (BOT_KEYS[bot].has(key) && typeof child === 'string') {
      if (normalize(child).length >= 12) out.push(child);
    } else if (child && typeof child === 'object') {
      collectBotText(child, bot, out);
    }
  }
  return out;
}

function looksLikePersonName(value: string): boolean {
  const clean = normalize(value);
  if (clean.length < 4 || clean.length > 60 || /\d|https?:|\$/.test(clean)) return false;
  const words = clean.split(' ');
  return words.length >= 2 && words.length <= 4 && words.every(w => /^[A-Za-z.'-]+$/.test(w));
}

function collectPlayerNames(value: unknown, path = '', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectPlayerNames(item, path, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const obj = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(obj)) {
    const childPath = path ? `${path}.${key}` : key;
    if (typeof child === 'string') {
      const explicit = key === 'player' || key === 'playerName' || key === 'player_name';
      const nestedName = key === 'name' && /player|performer|pick/i.test(path);
      if ((explicit || nestedName) && looksLikePersonName(child)) out.push(child);
    } else if (child && typeof child === 'object') collectPlayerNames(child, childPath, out);
  }
  return out;
}

function ensureTeamMemory(mem: BotMemory, team: string): void {
  if (!mem.teams[team]) mem.teams[team] = { trust: 0, frustration: 0, mood: 'Neutral' };
}

function ensureTeamRelationship(mem: BotMemory, team: string): DeepTeamRelationship {
  ensureTeamMemory(mem, team);
  if (!mem.deepTeamRelationships) mem.deepTeamRelationships = {};
  let rel = mem.deepTeamRelationships[team];
  if (!rel) {
    const score = (mem.teams[team].trust ?? 0) - (mem.teams[team].frustration ?? 0);
    rel = {
      teamName: team,
      stance: score >= 18 ? 'believer' : score <= -12 ? 'skeptic' : 'neutral',
      trustLevel: mem.teams[team].trust ?? 0,
      takeHistory: [],
      timesBurned: 0,
      timesVindicated: 0,
      playerOpinions: {},
    };
    mem.deepTeamRelationships[team] = rel;
  }
  return rel;
}

function playerKey(name: string): string {
  return `editorial:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function ensurePlayerRelationship(mem: BotMemory, player: string, team?: string): DeepPlayerRelationship {
  if (!mem.deepPlayerRelationships) mem.deepPlayerRelationships = {};
  const existing = Object.values(mem.deepPlayerRelationships).find(r => r.playerName.toLowerCase() === player.toLowerCase());
  if (existing) {
    if (team) existing.team = team;
    return existing;
  }
  const key = playerKey(player);
  const rel: DeepPlayerRelationship = {
    playerId: key,
    playerName: player,
    team,
    sentiment: 'neutral',
    trustLevel: 0,
    history: [],
    predictions: [],
    nicknames: [],
    mentionFrequency: 30,
  };
  mem.deepPlayerRelationships[key] = rel;
  return rel;
}

function addOwnTeamClaim(mem: BotMemory, claim: EditorialClaim, season: number, week: number): void {
  const rel = ensureTeamRelationship(mem, claim.subject);
  const take = normalize(claim.claim).slice(0, 420);
  if (!rel.takeHistory.some(t => t.take.toLowerCase() === take.toLowerCase())) {
    rel.takeHistory.push({ week, season, take, memorable: claim.memorable });
    if (rel.takeHistory.length > 30) rel.takeHistory = rel.takeHistory.slice(-30);
  }
}

function addOwnPlayerClaim(mem: BotMemory, claim: EditorialClaim, season: number, week: number): void {
  const rel = ensurePlayerRelationship(mem, claim.subject, claim.relatedTeam);
  const take = normalize(claim.claim).slice(0, 420);
  const event = `Published take: ${take}`;
  if (!rel.history.some(h => h.event.toLowerCase() === event.toLowerCase())) {
    rel.history.push({ week, season, event, impact: 0, emotional: claim.memorable });
    if (rel.history.length > 18) rel.history = rel.history.slice(-18);
  }
  if (claim.claimType === 'prediction' && !rel.predictions.some(p => p.prediction.toLowerCase() === take.toLowerCase())) {
    rel.predictions.push({ week, prediction: take });
    if (rel.predictions.length > 12) rel.predictions = rel.predictions.slice(-12);
  }
  rel.mentionFrequency = Math.min(100, rel.mentionFrequency + (claim.memorable ? 6 : 2));
}

function latestClaimForTeam(digest: EditorialMemoryDigest, bot: BotName, team: string): string | undefined {
  const thesis = digest.teamTheses.find(t => t.bot === bot && t.team.toLowerCase() === team.toLowerCase());
  if (thesis) return normalize(thesis.thesis);
  const claims = digest.claims.filter(c => c.bot === bot && (c.subject.toLowerCase() === team.toLowerCase() || c.relatedTeam?.toLowerCase() === team.toLowerCase()));
  return claims.length ? normalize(claims[claims.length - 1].claim) : undefined;
}

function latestClaimForPlayer(digest: EditorialMemoryDigest, bot: BotName, player: string): { text?: string; team?: string } {
  const thesis = digest.playerTheses.find(t => t.bot === bot && t.player.toLowerCase() === player.toLowerCase());
  if (thesis) return { text: normalize(thesis.thesis), team: thesis.team };
  const claims = digest.claims.filter(c => c.bot === bot && c.subjectType === 'player' && c.subject.toLowerCase() === player.toLowerCase());
  const last = claims[claims.length - 1];
  return { text: last ? normalize(last.claim) : undefined, team: last?.relatedTeam };
}

/**
 * Persist the host's own ledger plus a shared, attributed dossier. The shared
 * dossier is intentionally written to both BotMemory records because some
 * section generators currently construct their common judgment block from one
 * memory object before Mason and Westy write separately.
 */
function applyDigest(mem: BotMemory, digest: EditorialMemoryDigest, bot: BotName, season: number, week: number): void {
  for (const claim of digest.claims.filter(c => c.bot === bot)) {
    if (claim.subjectType === 'team') addOwnTeamClaim(mem, claim, season, week);
    else if (claim.subjectType === 'player') addOwnPlayerClaim(mem, claim, season, week);
  }

  for (const thesis of digest.teamTheses.filter(t => t.bot === bot)) {
    ensureTeamRelationship(mem, thesis.team).currentNarrative = normalize(thesis.thesis).slice(0, 520);
  }
  for (const thesis of digest.playerTheses.filter(t => t.bot === bot)) {
    const rel = ensurePlayerRelationship(mem, thesis.player, thesis.team);
    const event = `Published take: ${normalize(thesis.thesis).slice(0, 420)}`;
    if (!rel.history.some(h => h.event.toLowerCase() === event.toLowerCase())) {
      rel.history.push({ week, season, event, impact: 0, emotional: false });
      if (rel.history.length > 18) rel.history = rel.history.slice(-18);
    }
  }

  const digestTeams = unique([
    ...digest.teamTheses.map(t => t.team),
    ...digest.claims.filter(c => c.subjectType === 'team').map(c => c.subject),
    ...digest.claims.map(c => c.relatedTeam ?? ''),
  ]);
  for (const team of digestTeams) {
    const mason = latestClaimForTeam(digest, 'entertainer', team);
    const westy = latestClaimForTeam(digest, 'analyst', team);
    if (!mason && !westy) continue;
    ensureTeamMemory(mem, team);
    mem.teams[team].lastAssessment = {
      week,
      text: [mason ? `Mason previously: ${mason}` : '', westy ? `Westy previously: ${westy}` : ''].filter(Boolean).join(' | ').slice(0, 900),
    };
  }

  const digestPlayers = unique([
    ...digest.playerTheses.map(t => t.player),
    ...digest.claims.filter(c => c.subjectType === 'player').map(c => c.subject),
  ]);
  for (const player of digestPlayers) {
    const mason = latestClaimForPlayer(digest, 'entertainer', player);
    const westy = latestClaimForPlayer(digest, 'analyst', player);
    if (!mason.text && !westy.text) continue;
    const team = mason.team ?? westy.team;
    const rel = ensurePlayerRelationship(mem, player, team);
    const event = `Current thesis: ${[mason.text ? `Mason previously: ${mason.text}` : '', westy.text ? `Westy previously: ${westy.text}` : ''].filter(Boolean).join(' | ').slice(0, 850)}`;
    if (!rel.history.some(h => h.event.toLowerCase() === event.toLowerCase())) {
      rel.history.push({ week, season, event, impact: 0, emotional: false });
      if (rel.history.length > 18) rel.history = rel.history.slice(-18);
    }
  }
}

export async function updateBotMemoryFromPublish(season: number, week: number): Promise<void> {
  try {
    const db = getDb();
    const rows = await db.select().from(newsletters)
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)))
      .limit(1);
    if (!rows.length) {
      console.warn(`[PublishMemory] No newsletter found for s${season}w${week} — skipping`);
      return;
    }

    const content = rows[0].content as { sections?: SectionContent[] } | null;
    const publishedSections = content?.sections ?? [];
    if (!publishedSections.length) return;

    const [entMem, anaMem] = await Promise.all([
      loadBotMemory('entertainer', season),
      loadBotMemory('analyst', season),
    ]);
    const memories: Record<BotName, BotMemory | null> = { entertainer: entMem, analyst: anaMem };

    const teamNames = unique([
      ...TEAM_NAMES,
      ...Object.keys(entMem?.teams ?? {}),
      ...Object.keys(anaMem?.teams ?? {}),
      ...Object.keys(entMem?.deepTeamRelationships ?? {}),
      ...Object.keys(anaMem?.deepTeamRelationships ?? {}),
    ]);
    const playerNames = unique([
      ...collectPlayerNames(publishedSections),
      ...Object.values(entMem?.deepPlayerRelationships ?? {}).map(r => r.playerName),
      ...Object.values(anaMem?.deepPlayerRelationships ?? {}).map(r => r.playerName),
    ]);

    const digest = await synthesizePublishedIntelligence({
      season,
      week,
      teamNames,
      playerNames,
      entertainerText: unique(collectBotText(publishedSections, 'entertainer')).join('\n'),
      analystText: unique(collectBotText(publishedSections, 'analyst')).join('\n'),
    });

    const staged = await loadStagedNewsletter(season, week).catch(() => null);
    let originalSections: SectionContent[] | null = null;
    if (staged?.generatedContent) {
      const gcLower = Object.fromEntries(Object.entries(staged.generatedContent).map(([k, v]) => [k.toLowerCase(), v]));
      originalSections = publishedSections.map(pub => {
        const stagedSection = staged.generatedContent[pub.type] ?? gcLower[pub.type?.toLowerCase() ?? ''];
        return stagedSection ? {
          ...pub,
          bot1_text: stagedSection.entertainer ?? pub.bot1_text,
          bot2_text: stagedSection.analyst ?? pub.bot2_text,
        } : pub;
      });
    }

    for (const { bot, field } of [
      { bot: 'entertainer' as const, field: 'bot1_text' as const },
      { bot: 'analyst' as const, field: 'bot2_text' as const },
    ]) {
      const mem = memories[bot];
      if (!mem) {
        console.warn(`[PublishMemory] ${bot}: no season ${season} memory record`);
        continue;
      }

      if (originalSections) {
        const corrections = diffSections(publishedSections, originalSections, field);
        if (corrections.length) {
          const entry: EditorialCorrectionEntry = { season, week, source: 'editorial_review', corrections };
          if (!mem.editorialCorrections) mem.editorialCorrections = [];
          const idx = mem.editorialCorrections.findIndex(e => e.season === season && e.week === week);
          if (idx >= 0) mem.editorialCorrections[idx] = entry;
          else mem.editorialCorrections.push(entry);
        }
      }

      applyDigest(mem, digest, bot, season, week);
      await saveBotMemory(bot, season, mem);
      const ownClaims = digest.claims.filter(c => c.bot === bot).length;
      console.log(`[PublishMemory] ${hostLabel(bot)} intelligence saved: ${ownClaims} claims; shared team/player dossiers refreshed`);
    }
  } catch (err) {
    console.error('[PublishMemory] updateBotMemoryFromPublish failed (non-fatal):', err instanceof Error ? err.message : String(err));
  }
}

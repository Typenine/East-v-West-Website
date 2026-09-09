import { TEAM_NAMES } from '@/lib/constants/league';
import type { BotMemory, BotName } from '@/lib/newsletter/types';
import { createEnhancedMemory } from '@/lib/newsletter/memory';
import { extractUploadedPdfContinuity } from '@/lib/newsletter/uploaded-pdf-continuity';
import { presignGet } from '@/server/storage/r2';
import {
  synthesizePublishedIntelligence,
  type EditorialClaim,
  type EditorialMemoryDigest,
  type EditorialStance,
} from '@/lib/newsletter/editorial-memory';
import {
  listNewslettersMeta,
  loadBotMemory,
  loadNewsletterById,
  saveBotMemory,
} from '@/server/db/newsletter-queries';
import {
  loadPublishedTakeLedgerState,
  savePublishedTakeLedgerState,
  type PublishedTakeLedgerEntry,
  type PublishedTakeLedgerState,
  type PublishedTakeStatus,
} from '@/lib/newsletter/published-take-store';

export type { PublishedTakeLedgerEntry, PublishedTakeStatus } from '@/lib/newsletter/published-take-store';

type NewsletterSection = { type: string; data?: unknown; [key: string]: unknown };

type RecoveredContinuity = {
  entertainerText: string;
  analystText: string;
  playerNames: string[];
  recoveredFromPdf: boolean;
};

const BOT_KEYS: Record<BotName, Set<string>> = {
  entertainer: new Set([
    'bot1_text', 'bot1', 'entertainer', 'entertainer_paragraph', 'entertainer_position',
    'entertainer_argument', 'note_bot1', 'est_bot1', 'bot1_bold_player',
    'bot1_matchup_of_the_week', 'entertainer_pick', 'masonText',
  ]),
  analyst: new Set([
    'bot2_text', 'bot2', 'analyst', 'analyst_paragraph', 'analyst_position',
    'analyst_argument', 'note_bot2', 'est_bot2', 'bot2_bold_player',
    'bot2_matchup_of_the_week', 'analyst_pick', 'westyText',
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
  if (clean.length < 4 || clean.length > 70 || /\d|https?:|\$/.test(clean)) return false;
  const words = clean.split(' ');
  return words.length >= 2 && words.length <= 5 && words.every(word => /^[A-Za-z.'-]+$/.test(word));
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
    } else if (child && typeof child === 'object') {
      collectPlayerNames(child, childPath, out);
    }
  }
  return out;
}

function uploadedPdfKey(sections: NewsletterSection[]): string | null {
  for (const section of sections) {
    if (section.type !== 'UploadedPdf' || !section.data || typeof section.data !== 'object') continue;
    const key = (section.data as Record<string, unknown>).key;
    if (typeof key === 'string' && key.trim()) return key.trim();
  }
  return null;
}

async function recoverContinuity(
  sections: NewsletterSection[],
  title: string,
): Promise<RecoveredContinuity> {
  let entertainerText = unique(collectBotText(sections, 'entertainer')).join('\n');
  let analystText = unique(collectBotText(sections, 'analyst')).join('\n');
  let playerNames = unique(collectPlayerNames(sections));

  if (entertainerText.trim() || analystText.trim()) {
    return { entertainerText, analystText, playerNames, recoveredFromPdf: false };
  }

  const key = uploadedPdfKey(sections);
  if (!key) return { entertainerText: '', analystText: '', playerNames, recoveredFromPdf: false };

  try {
    const url = await presignGet({ key, expiresSec: 180 });
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(150_000),
    });
    if (!response.ok) throw new Error(`R2 returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const recovered = await extractUploadedPdfContinuity(bytes, title);
    if (!recovered) return { entertainerText: '', analystText: '', playerNames, recoveredFromPdf: false };

    entertainerText = recovered.masonText;
    analystText = recovered.westyText;
    playerNames = unique([...playerNames, ...recovered.playerNames]);
    return { entertainerText, analystText, playerNames, recoveredFromPdf: true };
  } catch (error) {
    console.warn('[TakeLedger] uploaded PDF continuity recovery failed:', error instanceof Error ? error.message : String(error));
    return { entertainerText: '', analystText: '', playerNames, recoveredFromPdf: false };
  }
}

function oppositeStance(a: EditorialStance, b: EditorialStance): boolean {
  return (a === 'positive' && b === 'negative') || (a === 'negative' && b === 'positive');
}

function statusForClaim(claim: EditorialClaim, previous?: PublishedTakeLedgerEntry): PublishedTakeStatus {
  const text = claim.claim.toLowerCase();
  if (/\b(i was wrong|i got this wrong|i missed|i whiffed|take the l|own this l|wrong about)\b/.test(text)) return 'wrong';
  if (/\b(resolved|settled|case closed|that question is over|no longer matters)\b/.test(text)) return 'resolved';
  if (!previous) return 'active';
  if (oppositeStance(claim.stance, previous.stance)) return 'reversed';
  if ((claim.stance === 'mixed' || claim.stance === 'neutral') && (previous.stance === 'positive' || previous.stance === 'negative')) return 'weakened';
  if (claim.stance === previous.stance && claim.stance !== 'neutral') return 'strengthened';
  return 'active';
}

function claimKey(entry: Pick<PublishedTakeLedgerEntry, 'subjectType' | 'subject' | 'claimType'>): string {
  return `${entry.subjectType}:${entry.subject.toLowerCase()}:${entry.claimType}`;
}

function candidateClaims(digest: EditorialMemoryDigest, bot: BotName): EditorialClaim[] {
  const ownClaims = digest.claims.filter(claim => claim.bot === bot);
  const candidates: EditorialClaim[] = [];

  for (const thesis of digest.teamTheses.filter(row => row.bot === bot)) {
    const supporting = [...ownClaims].reverse().find(claim =>
      claim.subjectType === 'team' && claim.subject.toLowerCase() === thesis.team.toLowerCase()
    );
    candidates.push({
      bot,
      subjectType: 'team',
      subject: thesis.team,
      claim: thesis.thesis,
      claimType: supporting?.claimType ?? 'evaluation',
      stance: supporting?.stance ?? 'neutral',
      memorable: supporting?.memorable ?? false,
      confidence: supporting?.confidence ?? 0.7,
    });
  }

  for (const thesis of digest.playerTheses.filter(row => row.bot === bot)) {
    const supporting = [...ownClaims].reverse().find(claim =>
      claim.subjectType === 'player' && claim.subject.toLowerCase() === thesis.player.toLowerCase()
    );
    candidates.push({
      bot,
      subjectType: 'player',
      subject: thesis.player,
      relatedTeam: thesis.team ?? supporting?.relatedTeam,
      claim: thesis.thesis,
      claimType: supporting?.claimType ?? 'evaluation',
      stance: supporting?.stance ?? 'neutral',
      memorable: supporting?.memorable ?? false,
      confidence: supporting?.confidence ?? 0.7,
    });
  }

  for (const claim of ownClaims.filter(row => row.claimType === 'prediction' || row.memorable)) {
    const duplicate = candidates.some(candidate =>
      candidate.subjectType === claim.subjectType &&
      candidate.subject.toLowerCase() === claim.subject.toLowerCase() &&
      normalize(candidate.claim).toLowerCase() === normalize(claim.claim).toLowerCase()
    );
    if (!duplicate) candidates.push(claim);
  }

  return candidates.slice(0, 32);
}

function addLedgerEntries(
  existing: PublishedTakeLedgerEntry[],
  digest: EditorialMemoryDigest,
  bot: BotName,
  source: {
    newsletterId: string;
    title: string | null;
    episodeType: string | null;
    season: number;
    week: number;
    publishedAt: string;
  },
): PublishedTakeLedgerEntry[] {
  const ledger = [...existing];
  const candidates = candidateClaims(digest, bot);

  for (const claim of candidates) {
    const cleanedClaim = normalize(claim.claim).slice(0, 520);
    if (cleanedClaim.length < 20) continue;

    const duplicate = ledger.some(entry =>
      entry.sourceNewsletterId === source.newsletterId &&
      entry.subjectType === claim.subjectType &&
      entry.subject.toLowerCase() === claim.subject.toLowerCase() &&
      entry.claim.toLowerCase() === cleanedClaim.toLowerCase()
    );
    if (duplicate) continue;

    const key = `${claim.subjectType}:${claim.subject.toLowerCase()}:${claim.claimType}`;
    const previous = [...ledger].reverse().find(entry => claimKey(entry) === key);
    const status = statusForClaim(claim, previous);

    ledger.push({
      id: `${source.newsletterId}:${bot}:${ledger.length + 1}`,
      sourceNewsletterId: source.newsletterId,
      title: source.title,
      episodeType: source.episodeType,
      season: source.season,
      week: source.week,
      subjectType: claim.subjectType,
      subject: claim.subject,
      relatedTeam: claim.relatedTeam,
      claim: cleanedClaim,
      claimType: claim.claimType,
      stance: claim.stance,
      confidence: claim.confidence,
      memorable: claim.memorable,
      status,
      previousClaim: previous?.claim,
      publishedAt: source.publishedAt,
    });
  }

  return ledger.slice(-160);
}

function applySharedAssessments(mem: BotMemory, digest: EditorialMemoryDigest, week: number): void {
  const teams = unique([
    ...digest.teamTheses.map(row => row.team),
    ...digest.claims.filter(row => row.subjectType === 'team').map(row => row.subject),
    ...digest.claims.map(row => row.relatedTeam ?? ''),
  ]);

  for (const team of teams) {
    const mason = [...digest.teamTheses].reverse().find(row => row.bot === 'entertainer' && row.team.toLowerCase() === team.toLowerCase())?.thesis
      ?? [...digest.claims].reverse().find(row => row.bot === 'entertainer' && (row.subject.toLowerCase() === team.toLowerCase() || row.relatedTeam?.toLowerCase() === team.toLowerCase()))?.claim;
    const westy = [...digest.teamTheses].reverse().find(row => row.bot === 'analyst' && row.team.toLowerCase() === team.toLowerCase())?.thesis
      ?? [...digest.claims].reverse().find(row => row.bot === 'analyst' && (row.subject.toLowerCase() === team.toLowerCase() || row.relatedTeam?.toLowerCase() === team.toLowerCase()))?.claim;
    if (!mason && !westy) continue;
    if (!mem.teams[team]) mem.teams[team] = { trust: 0, frustration: 0, mood: 'Neutral' };
    mem.teams[team].lastAssessment = {
      week,
      text: [
        mason ? `Mason previously: ${normalize(mason)}` : '',
        westy ? `Westy previously: ${normalize(westy)}` : '',
      ].filter(Boolean).join(' | ').slice(0, 900),
    };
  }
}

function markProcessed(state: PublishedTakeLedgerState, newsletterId: string): PublishedTakeLedgerState {
  return {
    ...state,
    processedNewsletterIds: [...new Set([...state.processedNewsletterIds, newsletterId])],
  };
}

/**
 * Exact-ID continuity checkpoint. This runs after a newsletter is published and
 * creates a compact, durable record of what each host actually said. It works
 * for native structured newsletters and uploaded PDFs. If an older uploaded PDF
 * has empty stored attribution, the original PDF is reopened and re-extracted.
 */
export async function recordPublishedTakeLedger(newsletterId: string): Promise<boolean> {
  const issue = await loadNewsletterById(newsletterId);
  if (!issue) {
    console.warn(`[TakeLedger] Newsletter ${newsletterId} not found`);
    return false;
  }

  const sections = (issue.newsletter?.sections ?? []) as NewsletterSection[];
  const recovered = await recoverContinuity(sections, issue.title || 'East v. West Newsletter');
  const entertainerText = recovered.entertainerText;
  const analystText = recovered.analystText;
  if (!entertainerText.trim() && !analystText.trim()) {
    console.warn(`[TakeLedger] ${newsletterId} contains no attributable Mason/Westy text`);
    return false;
  }

  const [loadedEntMem, loadedAnaMem, entState, anaState] = await Promise.all([
    loadBotMemory('entertainer', issue.season),
    loadBotMemory('analyst', issue.season),
    loadPublishedTakeLedgerState('entertainer', issue.season),
    loadPublishedTakeLedgerState('analyst', issue.season),
  ]);

  // Publishing a newsletter must itself be enough to establish season memory.
  // Previously, the ledger silently returned when these rows did not exist.
  const entMem = loadedEntMem ?? createEnhancedMemory('entertainer', issue.season);
  const anaMem = loadedAnaMem ?? createEnhancedMemory('analyst', issue.season);

  const teamNames = unique([
    ...TEAM_NAMES,
    ...Object.keys(entMem.teams ?? {}),
    ...Object.keys(anaMem.teams ?? {}),
    ...Object.keys(entMem.deepTeamRelationships ?? {}),
    ...Object.keys(anaMem.deepTeamRelationships ?? {}),
  ]);
  const playerNames = unique([
    ...recovered.playerNames,
    ...Object.values(entMem.deepPlayerRelationships ?? {}).map(row => row.playerName),
    ...Object.values(anaMem.deepPlayerRelationships ?? {}).map(row => row.playerName),
  ]);

  const digest = await synthesizePublishedIntelligence({
    season: issue.season,
    week: issue.week,
    teamNames,
    playerNames,
    entertainerText,
    analystText,
  });

  const source = {
    newsletterId: issue.id,
    title: issue.title,
    episodeType: issue.episodeType,
    season: issue.season,
    week: issue.week,
    publishedAt: issue.generatedAt || new Date().toISOString(),
  };

  const updatedEntState = markProcessed({
    ...entState,
    entries: addLedgerEntries(entState.entries, digest, 'entertainer', source),
  }, issue.id);
  const updatedAnaState = markProcessed({
    ...anaState,
    entries: addLedgerEntries(anaState.entries, digest, 'analyst', source),
  }, issue.id);

  applySharedAssessments(entMem, digest, issue.week);
  applySharedAssessments(anaMem, digest, issue.week);

  // saveBotMemory creates the season row if needed. The ledger state is then
  // merged into enhanced_data without being dropped by saveBotMemory's serializer.
  await saveBotMemory('entertainer', issue.season, entMem);
  await saveBotMemory('analyst', issue.season, anaMem);
  await savePublishedTakeLedgerState('entertainer', issue.season, updatedEntState);
  await savePublishedTakeLedgerState('analyst', issue.season, updatedAnaState);

  console.log(`[TakeLedger] ${issue.id}: saved durable published continuity from ${digest.claims.length} extracted claims${recovered.recoveredFromPdf ? ' after PDF recovery' : ''}`);
  return true;
}

export interface PublishedContinuityHealth {
  publishedIssues: number;
  alreadyProcessed: number;
  backfilled: number;
  unresolvedIssueIds: string[];
  masonTakeCount: number;
  westyTakeCount: number;
}

/**
 * Source Pack exports call this before reading continuity. It provides a one-time
 * backfill for already-published issues and then becomes cheap because processed
 * newsletter IDs are persisted with the ledger.
 */
export async function ensurePublishedTakeLedgerForSeason(season: number): Promise<PublishedContinuityHealth> {
  const published = (await listNewslettersMeta(season))
    .filter(item => item.status === 'published')
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));

  let [entState, anaState] = await Promise.all([
    loadPublishedTakeLedgerState('entertainer', season),
    loadPublishedTakeLedgerState('analyst', season),
  ]);
  const processed = new Set([...entState.processedNewsletterIds, ...anaState.processedNewsletterIds]);
  let alreadyProcessed = 0;
  let backfilled = 0;
  const unresolvedIssueIds: string[] = [];

  for (const issue of published) {
    if (processed.has(issue.id)) {
      alreadyProcessed += 1;
      continue;
    }
    const recorded = await recordPublishedTakeLedger(issue.id).catch(error => {
      console.warn(`[TakeLedger] backfill failed for ${issue.id}:`, error instanceof Error ? error.message : String(error));
      return false;
    });
    if (recorded) backfilled += 1;
    else unresolvedIssueIds.push(issue.id);
  }

  [entState, anaState] = await Promise.all([
    loadPublishedTakeLedgerState('entertainer', season),
    loadPublishedTakeLedgerState('analyst', season),
  ]);

  return {
    publishedIssues: published.length,
    alreadyProcessed,
    backfilled,
    unresolvedIssueIds,
    masonTakeCount: entState.entries.length,
    westyTakeCount: anaState.entries.length,
  };
}

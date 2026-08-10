import { TEAM_NAMES } from '@/lib/constants/league';
import type { BotMemory, BotName } from '@/lib/newsletter/types';
import {
  synthesizePublishedIntelligence,
  type EditorialClaim,
  type EditorialClaimType,
  type EditorialMemoryDigest,
  type EditorialStance,
} from '@/lib/newsletter/editorial-memory';
import {
  loadBotMemory,
  loadNewsletterById,
  saveBotMemory,
} from '@/server/db/newsletter-queries';

export type PublishedTakeStatus = 'active' | 'strengthened' | 'weakened' | 'reversed' | 'resolved' | 'wrong';

export interface PublishedTakeLedgerEntry {
  id: string;
  sourceNewsletterId: string;
  title: string | null;
  episodeType: string | null;
  season: number;
  week: number;
  subjectType: 'team' | 'player' | 'league';
  subject: string;
  relatedTeam?: string;
  claim: string;
  claimType: EditorialClaimType;
  stance: EditorialStance;
  confidence: number;
  memorable: boolean;
  status: PublishedTakeStatus;
  previousClaim?: string;
  publishedAt: string;
}

type MemoryWithLedger = BotMemory & { publishedTakeLedger?: PublishedTakeLedgerEntry[] };

type NewsletterSection = { type: string; data?: unknown; [key: string]: unknown };

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

  return candidates.slice(0, 28);
}

function addLedgerEntries(
  mem: MemoryWithLedger,
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
): void {
  const ledger = Array.isArray(mem.publishedTakeLedger) ? [...mem.publishedTakeLedger] : [];
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

  mem.publishedTakeLedger = ledger.slice(-100);
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

/**
 * Exact-ID continuity checkpoint. This runs after a newsletter is published and
 * creates a compact, durable record of what each host actually said. It works
 * for both native structured newsletters and uploaded PDFs whose upload record
 * contains extracted Mason/Westy continuity text.
 */
export async function recordPublishedTakeLedger(newsletterId: string): Promise<void> {
  const issue = await loadNewsletterById(newsletterId);
  if (!issue) {
    console.warn(`[TakeLedger] Newsletter ${newsletterId} not found`);
    return;
  }

  const sections = (issue.newsletter?.sections ?? []) as NewsletterSection[];
  const entertainerText = unique(collectBotText(sections, 'entertainer')).join('\n');
  const analystText = unique(collectBotText(sections, 'analyst')).join('\n');
  if (!entertainerText.trim() && !analystText.trim()) {
    console.warn(`[TakeLedger] ${newsletterId} contains no attributable Mason/Westy text`);
    return;
  }

  const [entMem, anaMem] = await Promise.all([
    loadBotMemory('entertainer', issue.season),
    loadBotMemory('analyst', issue.season),
  ]);
  if (!entMem && !anaMem) return;

  const teamNames = unique([
    ...TEAM_NAMES,
    ...Object.keys(entMem?.teams ?? {}),
    ...Object.keys(anaMem?.teams ?? {}),
    ...Object.keys(entMem?.deepTeamRelationships ?? {}),
    ...Object.keys(anaMem?.deepTeamRelationships ?? {}),
  ]);
  const playerNames = unique([
    ...collectPlayerNames(sections),
    ...Object.values(entMem?.deepPlayerRelationships ?? {}).map(row => row.playerName),
    ...Object.values(anaMem?.deepPlayerRelationships ?? {}).map(row => row.playerName),
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
    publishedAt: new Date().toISOString(),
  };

  if (entMem) {
    addLedgerEntries(entMem as MemoryWithLedger, digest, 'entertainer', source);
    applySharedAssessments(entMem, digest, issue.week);
    await saveBotMemory('entertainer', issue.season, entMem);
  }
  if (anaMem) {
    addLedgerEntries(anaMem as MemoryWithLedger, digest, 'analyst', source);
    applySharedAssessments(anaMem, digest, issue.week);
    await saveBotMemory('analyst', issue.season, anaMem);
  }

  console.log(`[TakeLedger] ${issue.id}: saved exact published continuity from ${digest.claims.length} extracted claims`);
}

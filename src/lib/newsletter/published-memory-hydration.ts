/**
 * Deterministic, replay-safe materialization of each host's published opinions.
 * The source ledger stays authoritative. This does NOT grade predictions or
 * auto-change stable personality traits from subjective newsletter copy.
 */
import { TEAM_NAMES } from '@/lib/constants/league';
import type { BotMemory, DeepPlayerRelationship, DeepTeamRelationship } from './types';
import type { PublishedTakeLedgerEntry } from './published-take-store';

export interface PublishedRelationshipHealth {
  teams: number;
  players: number;
  teamTakes: number;
  playerTakes: number;
}

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const CANONICAL_TEAMS = new Map(TEAM_NAMES.map(name => [name.toLowerCase(), name]));

function validPlayerName(value: string): boolean {
  const words = normalized(value).split(' ');
  return words.length >= 2 && words.length <= 5 &&
    words.every(word => /^[A-Za-z][A-Za-z.'-]*$/.test(word)) &&
    !CANONICAL_TEAMS.has(value.toLowerCase());
}

function playerKey(name: string): string {
  return `editorial:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function ensureTeam(mem: BotMemory, name: string): DeepTeamRelationship {
  if (!mem.teams[name]) mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' };
  mem.deepTeamRelationships ??= {};
  if (!mem.deepTeamRelationships[name]) {
    mem.deepTeamRelationships[name] = {
      teamName: name,
      stance: 'neutral',
      trustLevel: mem.teams[name].trust ?? 0,
      takeHistory: [],
      timesBurned: 0,
      timesVindicated: 0,
      playerOpinions: {},
    };
  }
  return mem.deepTeamRelationships[name];
}

function ensurePlayer(mem: BotMemory, name: string, team?: string): DeepPlayerRelationship {
  mem.deepPlayerRelationships ??= {};
  const existing = Object.values(mem.deepPlayerRelationships)
    .find(row => row.playerName.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (team) existing.team = team;
    return existing;
  }
  const key = playerKey(name);
  const rel: DeepPlayerRelationship = {
    playerId: key,
    playerName: name,
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

/** Replaying a ledger or one of its issues cannot duplicate remembered takes. */
export function hydratePublishedRelationships(
  memory: BotMemory,
  entries: PublishedTakeLedgerEntry[],
): PublishedRelationshipHealth {
  const ordered = [...entries]
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
  let teamTakes = 0;
  let playerTakes = 0;

  for (const entry of ordered) {
    const take = normalized(entry.claim).slice(0, 420);
    if (take.length < 20) continue;

    if (entry.subjectType === 'team') {
      const canonical = CANONICAL_TEAMS.get(entry.subject.toLowerCase());
      if (!canonical) continue;
      const rel = ensureTeam(memory, canonical);
      // Historical marker cleanup should update the existing entry, not
      // create a second "memory" for the same published statement.
      const originalTake = entry.originalClaim ? normalized(entry.originalClaim).slice(0, 420) : take;
      const prior = rel.takeHistory.find(item =>
        item.season === entry.season && item.week === entry.week &&
        (item.take === take || item.take === originalTake));
      if (prior) prior.take = take;
      else {
        rel.takeHistory.push({ week: entry.week, season: entry.season, take, memorable: entry.memorable });
        rel.takeHistory = rel.takeHistory.slice(-30);
      }
      if (entry.claimType === 'evaluation' || entry.claimType === 'strategy') {
        rel.currentNarrative = take;
      }
      teamTakes++;
    } else if (entry.subjectType === 'player' && validPlayerName(entry.subject)) {
      const rel = ensurePlayer(memory, entry.subject, entry.relatedTeam);
      const event = `Published take: ${take}`;
      const originalTake = entry.originalClaim ? normalized(entry.originalClaim).slice(0, 420) : take;
      const originalEvent = `Published take: ${originalTake}`;
      const prior = rel.history.find(item => item.week === entry.week &&
        item.season === entry.season && (item.event === event || item.event === originalEvent));
      if (prior) prior.event = event;
      else {
        rel.history.push({ week: entry.week, season: entry.season, event, impact: 0, emotional: entry.memorable });
        rel.history = rel.history.slice(-18);
      }
      if (entry.claimType !== 'prediction') {
        rel.predictions = rel.predictions.filter(item => item.week !== entry.week ||
          (item.prediction !== take && item.prediction !== originalTake));
      } else {
        const existingPrediction = rel.predictions.find(item => item.week === entry.week &&
          (item.prediction === take || item.prediction === originalTake));
        if (existingPrediction) existingPrediction.prediction = take;
        else {
          rel.predictions.push({ week: entry.week, prediction: take });
          rel.predictions = rel.predictions.slice(-12);
        }
      }
      playerTakes++;
    }
  }

  return {
    teams: Object.keys(memory.deepTeamRelationships ?? {}).length,
    players: Object.keys(memory.deepPlayerRelationships ?? {}).length,
    teamTakes,
    playerTakes,
  };
}

/**
 * Recaps Module
 * Generates matchup recap commentary from both bot perspectives
 */

import type { MatchupPair, BotMemory, RecapItem } from './types';
import { getProfile, getTonePhrase, determineOutcome } from './personality';

// ============ Recap Generation ============

interface TagsBundle {
  teamTags?: Record<string, string[]>;
}

export function buildDeepRecaps(
  pairs: MatchupPair[],
  tagsBundle: TagsBundle | null,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory
): RecapItem[] {
  const recaps: RecapItem[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const seed = i;

    // Get profiles for this section
    const entProfile = getProfile('entertainer', 'MatchupRecaps');
    const anaProfile = getProfile('analyst', 'MatchupRecaps');

    // Determine outcomes
    const winnerOutcome = determineOutcome(p.margin, true);
    const loserOutcome = determineOutcome(p.margin, false);

    // Get tone phrases
    const entWinTone = getTonePhrase('entertainer', winnerOutcome, seed);
    const entLoseTone = getTonePhrase('entertainer', loserOutcome, seed + 1);
    const anaWinTone = getTonePhrase('analyst', winnerOutcome, seed);
    const anaLoseTone = getTonePhrase('analyst', loserOutcome, seed + 1);

    // Get memory context
    const winnerMoodEnt = memEntertainer.teams[p.winner.name]?.mood || 'Neutral';
    const loserMoodEnt = memEntertainer.teams[p.loser.name]?.mood || 'Neutral';
    const winnerMoodAna = memAnalyst.teams[p.winner.name]?.mood || 'Neutral';
    const loserMoodAna = memAnalyst.teams[p.loser.name]?.mood || 'Neutral';

    // Build entertainer recap
    let bot1 = '';
    if (p.margin >= 30) {
      bot1 = `${p.winner.name} absolutely cooked — ${entWinTone}. ${p.loser.name} ${entLoseTone}. +${p.margin.toFixed(1)} margin.`;
    } else if (p.margin <= 5) {
      bot1 = `${p.winner.name} ${entWinTone} by ${p.margin.toFixed(1)}. ${p.loser.name} — ${entLoseTone}. Chaos.`;
    } else {
      bot1 = `${p.winner.name} takes it, ${entWinTone}. ${p.loser.name} ${entLoseTone}. Margin: ${p.margin.toFixed(1)}.`;
    }

    // Add mood flavor for entertainer
    if (winnerMoodEnt === 'Confident') {
      bot1 += ' They keep proving me right.';
    } else if (loserMoodEnt === 'Irritated') {
      bot1 += ' Starting to lose patience here.';
    }

    // Build analyst recap
    let bot2 = '';
    if (p.margin >= 30) {
      bot2 = `${p.winner.name} posts ${p.winner.points.toFixed(1)} — ${anaWinTone}. ${p.loser.name} at ${p.loser.points.toFixed(1)}, ${anaLoseTone}.`;
    } else if (p.margin <= 5) {
      bot2 = `Tight one: ${p.winner.name} ${p.winner.points.toFixed(1)} vs ${p.loser.name} ${p.loser.points.toFixed(1)}. ${anaWinTone}. Margins this thin are noise.`;
    } else {
      bot2 = `${p.winner.name} ${p.winner.points.toFixed(1)}, ${p.loser.name} ${p.loser.points.toFixed(1)}. ${anaWinTone}. ${anaLoseTone}.`;
    }

    // Add mood flavor for analyst
    if (winnerMoodAna === 'Confident') {
      bot2 += ' Process continues to validate.';
    } else if (loserMoodAna === 'Suspicious') {
      bot2 += ' Watching for structural issues.';
    }

    recaps.push({
      matchup_id: p.matchup_id,
      bot1,
      bot2,
    });
  }

  return recaps;
}

// ============ Single Recap Helper ============

export function generateSingleRecap(
  pair: MatchupPair,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  seed = 0
): { entertainer: string; analyst: string } {
  const winnerOutcome = determineOutcome(pair.margin, true);
  
  const entTone = getTonePhrase('entertainer', winnerOutcome, seed);
  const anaTone = getTonePhrase('analyst', winnerOutcome, seed);

  const entertainer = `${pair.winner.name} over ${pair.loser.name} by ${pair.margin.toFixed(1)} — ${entTone}.`;
  const analyst = `${pair.winner.name} ${pair.winner.points.toFixed(1)} vs ${pair.loser.name} ${pair.loser.points.toFixed(1)}. ${anaTone}.`;

  return { entertainer, analyst };
}

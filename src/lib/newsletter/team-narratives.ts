/**
 * Team Narrative Cards — Phase 2
 *
 * Structured per-team narrative data that supplements the existing per-team
 * trust/frustration/mood memory in BotMemory. Separates objective facts
 * (championships, records) from narrative framing (archetypes, running angles).
 *
 * Design principles:
 * - Facts go here; bot opinions emerge from memory + this card together.
 * - Cards are code-defined for v1; shape is designed for future admin editing.
 * - Inject only the most relevant 2-4 lines into prompts — not the full card.
 * - Respect recent-output dedupe: retired jokes stay out; deduped angles get skipped.
 *
 * When adding or updating a team:
 * - Keep historicalArc factual and brief (no subjective claims).
 * - Keep botRelationship views as tendencies, not mandates.
 * - Only add runningJokes once they've organically appeared 2+ times.
 * - Mark retiredJokes when a bit has been used three weeks in a row.
 */

import type { TeamNarrativeCard, RivalryEntry } from './types';

// ============ The 12 East v. West Teams ============

const TEAM_CARDS: TeamNarrativeCard[] = [
  // ── HIGH CONFIDENCE (strong factual history) ────────────────────────────
  {
    teamName: 'Double Trouble',
    archetype: 'Perennial contender — the league\'s most consistent franchise',
    era: 'peak',
    historicalArc:
      'Three championship appearances in three seasons (2023–2025) — the only team to reach the final every year. ' +
      'Won it in 2023, runner-up in 2024 and 2025. The standard everyone else is measured against.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView:
        'Default respect, tinged with anticipation — Mason half-expects them to be there at the end again. ' +
        'When they stumble, it\'s a genuine story.',
      analystView:
        'Westy treats them as the statistical baseline. Championship appearance rate is hard to argue with. ' +
        'Skeptical when they struggle early — small-sample caveats.',
    },
    runningJokes: [
      'Always the runner-up when they don\'t win it',
      'The league\'s most reliable appointment to the championship weekend',
    ],
    retiredJokes: [],
    rivalries: [
      { team: 'Belltown Raptors', intensity: 'heated', notes: 'Championship meeting in 2024 — Belltown won. The rematch energy is real.' },
      { team: 'BeerNeverBrokeMyHeart', intensity: 'heated', notes: 'Championship meeting in 2025 — Beer won. Double Trouble is 1-2 in finals it reaches.' },
    ],
    sensitivityLevel: 'low',
    achievements: [
      '2023 champion (inaugural)',
      '3 consecutive championship appearances (2023, 2024, 2025)',
      'Only team to reach the final every season',
    ],
    wounds: [
      '2024 runner-up to Belltown Raptors',
      '2025 runner-up to BeerNeverBrokeMyHeart',
    ],
    preferredAngles: [
      'Dynasty ceiling question — can they finally win a second ring?',
      'Is consistency the floor or the ceiling for this team?',
      'The narrative of being "the team you have to go through"',
    ],
    dataConfidence: 'high',
  },

  {
    teamName: 'Belltown Raptors',
    archetype: '2024 champions — the team with the most explosive ceiling in league history',
    era: 'peak',
    historicalArc:
      '2024 champion with the most dominant performance in league history: 212.54 points in Week 14, ' +
      '98.42-point margin of victory (both league records). Lost to Double Trouble in the 2023 championship. ' +
      'Holds the all-time record for longest win streak (8 games, 2024).',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView:
        'Westy\'s 2024 championship call was correct. Mason uses them as the gold standard ' +
        'for "ceiling team" arguments.',
      analystView:
        'Westy correctly predicted the 2024 run. Holds them to a high standard. ' +
        'A slow start would be a legitimate regression concern, not just noise.',
    },
    runningJokes: [
      'The team that went nuclear in Week 14 — still the best single-week performance in league history',
    ],
    retiredJokes: [],
    rivalries: [
      { team: 'Double Trouble', intensity: 'heated', notes: '2023 championship loss, 2024 championship win — direct revenge narrative.' },
    ],
    sensitivityLevel: 'low',
    achievements: [
      '2024 champion',
      'League record: highest single-week score (212.54, Week 14 2024)',
      'League record: biggest margin of victory (98.42, Week 14 2024)',
      'League record: longest win streak (8 games, 2024)',
    ],
    wounds: [
      '2023 runner-up to Double Trouble (inaugural championship)',
    ],
    preferredAngles: [
      'Defending champion expectations',
      'Can the record-setting offense be rebuilt or was 2024 peak?',
      'Rivalry with Double Trouble — mutual respect through competition',
    ],
    dataConfidence: 'high',
  },

  {
    teamName: 'BeerNeverBrokeMyHeart',
    archetype: '2025 champion — the third different winner in three seasons',
    era: 'peak',
    historicalArc:
      '2025 champion, making them the third different franchise to win in three seasons. ' +
      'The league\'s depth of competition is one story; Beer\'s emergence is another.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView:
        'Mason was excited by the 2025 run — a new champion is a new story. ' +
        'Tends to give them the benefit of the doubt coming off the title.',
      analystView:
        'Westy notes that defending championships are statistically difficult. ' +
        'Watches their roster construction carefully — is this sustainable?',
    },
    runningJokes: [
      'The team that proved no one can run the table — three years, three champions',
    ],
    retiredJokes: [],
    rivalries: [
      { team: 'Double Trouble', intensity: 'heated', notes: '2025 championship — Beer beat Double Trouble for the title. Loaded rematch potential.' },
    ],
    sensitivityLevel: 'low',
    achievements: [
      '2025 champion',
      'Third different champion in three seasons — part of the league\'s parity story',
    ],
    wounds: [],
    preferredAngles: [
      'Can the 2025 champion defend?',
      'Parity league — every team has a real shot',
      'First-time champion trajectory — are they a dynasty in the making?',
    ],
    dataConfidence: 'high',
  },

  {
    teamName: 'Elemental Heroes',
    archetype: 'Inaugural runner-up — the team that was there at the beginning',
    era: 'unknown',
    historicalArc:
      '2023 runner-up in the inaugural season. Lost to Double Trouble in the first-ever championship. ' +
      'The franchise has the prestige of a founding-year finalist but no ring to show for it.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason sees them as a team with unfinished business. The original what-if.',
      analystView: 'Westy tracks whether their roster construction has improved since 2023.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [
      { team: 'Double Trouble', intensity: 'mild', notes: '2023 championship loss. The OG finals matchup.' },
    ],
    sensitivityLevel: 'low',
    achievements: [
      '2023 runner-up (inaugural season)',
    ],
    wounds: [
      'Lost the first-ever championship to Double Trouble',
    ],
    preferredAngles: [
      'The team that was close in Year 1 — where are they now?',
      'Unfinished business narrative',
    ],
    dataConfidence: 'high',
  },

  {
    teamName: 'bop pop',
    archetype: 'The team of millimeters — involved in the closest game in league history',
    era: 'unknown',
    historicalArc:
      'Part of the closest game in East v. West history: a 0.24-point margin of victory in Week 7, 2024. ' +
      'The franchise has league-lore status from that moment regardless of where they finish.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason always remembers the 0.24 game. Any close win by bop pop brings it up.',
      analystView: 'Westy uses them as a variance case study — luck vs. process.',
    },
    runningJokes: [
      '0.24 — the margin',
    ],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [
      'Holds the record for smallest margin of victory in league history (0.24 pts, Week 7 2024)',
    ],
    wounds: [],
    preferredAngles: [
      'The luck vs. skill debate — 0.24 lives rent-free',
      'Any close game involving bop pop has extra narrative weight',
    ],
    dataConfidence: 'high',
  },

  // ── MEDIUM CONFIDENCE (some factual history) ─────────────────────────────
  {
    teamName: 'Mt. Lebanon Cake Eaters',
    archetype: 'Third-place finisher — consistent enough to matter, never quite over the top',
    era: 'unknown',
    historicalArc:
      'Finished third in 2025. Has not yet reached a championship but has shown playoff-level competitiveness.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason respects the consistency but wants to see them make a run.',
      analystView: 'Westy tracks whether their roster is built for a championship window.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [
      '2025 third-place finish',
    ],
    wounds: [],
    preferredAngles: [
      'The perennial contender that hasn\'t broken through',
    ],
    dataConfidence: 'medium',
  },

  {
    teamName: 'Belleview Badgers',
    archetype: 'Third-place finisher — the 2024 semifinal survivor',
    era: 'unknown',
    historicalArc:
      'Finished third in the 2024 season. Playoff-proven but not yet a finalist.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason sees them as a team that can surprise.',
      analystView: 'Westy looks at their roster construction and win-rate sustainability.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [
      '2024 third-place finish',
    ],
    wounds: [],
    preferredAngles: [
      'The sleeper that showed up in 2024',
    ],
    dataConfidence: 'medium',
  },

  {
    teamName: 'Detroit Dawgs',
    archetype: 'Third-place finisher — a founding playoff team',
    era: 'unknown',
    historicalArc:
      'Finished third in the inaugural 2023 season, making them one of the original playoff contenders.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason has an early-days memory of the Dawgs as a contender.',
      analystView: 'Westy notes the regression from 2023 is worth tracking.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [
      '2023 third-place finish (inaugural season)',
    ],
    wounds: [],
    preferredAngles: [
      'Inaugural playoff team — can they recapture 2023 form?',
    ],
    dataConfidence: 'medium',
  },

  // ── LOW CONFIDENCE (limited factual history — speculative framing) ────────
  {
    teamName: "Minshew's Maniacs",
    archetype: 'Named for a QB — personality-forward franchise identity',
    era: 'unknown',
    historicalArc: 'A franchise that embraces its quarterback-forward identity in a SuperFlex league.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason appreciates the name energy.',
      analystView: 'Westy focuses purely on the roster, not the branding.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [],
    wounds: [],
    preferredAngles: ['QB-first dynasty building in a SuperFlex league'],
    dataConfidence: 'low',
  },

  {
    teamName: 'Red Pandas',
    archetype: 'Underdog energy — the name that makes you root for them',
    era: 'unknown',
    historicalArc: 'A franchise with a likeable identity that has not yet broken through to a championship.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason gravitates toward underdog narratives here.',
      analystView: 'Westy treats them like any other franchise — results over identity.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [],
    wounds: [],
    preferredAngles: ['Underdog story potential'],
    dataConfidence: 'low',
  },

  {
    teamName: 'The Lone Ginger',
    archetype: 'Singular identity — a one-of-a-kind franchise name in a league full of them',
    era: 'unknown',
    historicalArc: 'A franchise defined by its distinctive identity rather than its championship history (so far).',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason enjoys the name.',
      analystView: 'Westy cares about roster construction over names.',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [],
    wounds: [],
    preferredAngles: ['The long-shot with a memorable name'],
    dataConfidence: 'low',
  },

  {
    teamName: 'Bimg Bamg Boomg',
    archetype: 'Chaotic energy — a franchise name that defies easy categorization',
    era: 'unknown',
    historicalArc: 'A franchise whose name alone creates character — the results are still being written.',
    currentSeasonArc: '',
    botRelationship: {
      entertainerView: 'Mason: "The name alone earns attention."',
      analystView: 'Westy: "Ignoring the name and looking at the roster."',
    },
    runningJokes: [],
    retiredJokes: [],
    rivalries: [],
    sensitivityLevel: 'low',
    achievements: [],
    wounds: [],
    preferredAngles: ['High chaos potential'],
    dataConfidence: 'low',
  },
];

// ============ Index ============

const CARD_INDEX = new Map<string, TeamNarrativeCard>(
  TEAM_CARDS.map(c => [c.teamName.toLowerCase(), c])
);

// ============ Phase 3: Runtime override layer ============
// Admin-edited team card fields are merged over the hardcoded defaults at request time.
// setTeamCardOverride is called by the newsletter API route after loading from DB.

const _cardOverrides = new Map<string, Partial<TeamNarrativeCard>>();

/**
 * Apply an admin-edited partial card override for a team.
 * Fields present in `partial` override the hardcoded card; absent fields use the default.
 */
export function setTeamCardOverride(teamName: string, partial: Partial<TeamNarrativeCard>): void {
  _cardOverrides.set(teamName.toLowerCase(), partial);
}

/** Remove any admin override for a team (reverts to hardcoded card). */
export function clearTeamCardOverride(teamName: string): void {
  _cardOverrides.delete(teamName.toLowerCase());
}

/**
 * Returns the narrative card for a team, merged with any admin overrides.
 * Admin override fields take precedence; absent override fields use hardcoded defaults.
 * Returns null if the team has no hardcoded card AND no admin override.
 */
export function getTeamCard(teamName: string): TeamNarrativeCard | null {
  const base = CARD_INDEX.get(teamName.toLowerCase()) ?? null;
  const override = _cardOverrides.get(teamName.toLowerCase());

  if (!override) return base;

  // If there's an override but no hardcoded card (future team added via admin),
  // build a minimal card from the override. dataConfidence defaults to 'low'.
  if (!base) {
    return {
      teamName,
      archetype: override.archetype ?? 'Unknown franchise',
      era: override.era ?? 'unknown',
      historicalArc: override.historicalArc ?? '',
      currentSeasonArc: override.currentSeasonArc ?? '',
      botRelationship: override.botRelationship ?? { entertainerView: '', analystView: '' },
      runningJokes: override.runningJokes ?? [],
      retiredJokes: override.retiredJokes ?? [],
      rivalries: override.rivalries ?? [],
      sensitivityLevel: override.sensitivityLevel ?? 'low',
      achievements: override.achievements ?? [],
      wounds: override.wounds ?? [],
      preferredAngles: override.preferredAngles ?? [],
      dataConfidence: 'low',
    };
  }

  // Merge: override individual fields; list fields are replaced (not appended)
  // so admins can remove items, not just add them
  return {
    ...base,
    ...(override.archetype          ? { archetype: override.archetype }                 : {}),
    ...(override.era                ? { era: override.era }                             : {}),
    ...(override.historicalArc      ? { historicalArc: override.historicalArc }         : {}),
    ...(override.currentSeasonArc !== undefined ? { currentSeasonArc: override.currentSeasonArc } : {}),
    ...(override.botRelationship    ? { botRelationship: override.botRelationship }     : {}),
    ...(override.runningJokes       ? { runningJokes: override.runningJokes }           : {}),
    ...(override.retiredJokes       ? { retiredJokes: override.retiredJokes }           : {}),
    ...(override.rivalries          ? { rivalries: override.rivalries }                 : {}),
    ...(override.sensitivityLevel   ? { sensitivityLevel: override.sensitivityLevel }   : {}),
    ...(override.achievements       ? { achievements: override.achievements }           : {}),
    ...(override.wounds             ? { wounds: override.wounds }                       : {}),
    ...(override.preferredAngles    ? { preferredAngles: override.preferredAngles }     : {}),
  };
}

/** Returns all cards (useful for preseason context builds). */
export function getAllTeamCards(): TeamNarrativeCard[] {
  return TEAM_CARDS;
}

// ============ Rivalry detection ============

/**
 * Compute a rivalry score (0-10) between two teams based on:
 * - Explicit rivalry entries in their cards
 * - Championship meeting history (from league-knowledge.ts)
 *
 * This is used by judgment.ts and narrative-heat.ts.
 * Does NOT fabricate rivalries — returns 0 if no evidence exists.
 */
export function computeRivalryScore(
  team1: string,
  team2: string,
  h2hRecord?: { team1Wins: number; team2Wins: number; meetings: number } | null,
): number {
  const card1 = getTeamCard(team1);
  const card2 = getTeamCard(team2);

  let score = 0;

  // Check explicit rivalry entries
  const r1 = card1?.rivalries.find(r => r.team.toLowerCase() === team2.toLowerCase());
  const r2 = card2?.rivalries.find(r => r.team.toLowerCase() === team1.toLowerCase());

  const topEntry = r1 ?? r2;
  if (topEntry) {
    score += topEntry.intensity === 'blood_feud' ? 8 :
             topEntry.intensity === 'heated'     ? 6 :
             topEntry.intensity === 'mild'       ? 3 : 0;
  }

  // Supplement with H2H history if provided
  if (h2hRecord && h2hRecord.meetings >= 4) {
    const balance = Math.abs(h2hRecord.team1Wins - h2hRecord.team2Wins);
    const isClose = balance <= 1;
    const isDominated = balance >= Math.floor(h2hRecord.meetings * 0.7);
    if (isClose) score += 2;        // Evenly matched → rivalry potential
    if (isDominated) score += 1;    // Dominated series → resentment potential
  }

  return Math.min(10, score);
}

// ============ Prompt context builders ============

/**
 * Returns a compact 2-4 line team card context string for prompt injection.
 * Respects the recent-output dedupe log to avoid repeating angles.
 *
 * @param teamName        The team to describe
 * @param recentStance    The stance used for this team last week (from dedupe log)
 * @param includeRivalry  Whether to include rivalry notes (only when relevant matchup)
 */
export function buildTeamCardContext(
  teamName: string,
  opts: {
    recentStance?: string | undefined;
    includeRivalry?: boolean;
    rivalryOpponent?: string;
    dataConfidenceFilter?: 'high' | 'medium'; // skip low-confidence cards unless explicitly requested
  } = {},
): string {
  const card = getTeamCard(teamName);
  if (!card) return '';

  // Skip low-confidence cards unless caller explicitly wants them
  const minConfidence = opts.dataConfidenceFilter ?? 'medium';
  if (minConfidence === 'high' && card.dataConfidence !== 'high') return '';
  if (minConfidence === 'medium' && card.dataConfidence === 'low') return '';

  const lines: string[] = [];

  lines.push(`${card.teamName}: ${card.archetype}`);

  // Historical arc (always present for high/medium confidence)
  if (card.historicalArc && card.dataConfidence !== 'low') {
    lines.push(`History: ${card.historicalArc.slice(0, 120)}${card.historicalArc.length > 120 ? '…' : ''}`);
  }

  // Current arc if present
  if (card.currentSeasonArc) {
    lines.push(`This season: ${card.currentSeasonArc}`);
  }

  // Running joke — pick the first one not in retired list and not the recent stance angle
  const availableJoke = card.runningJokes.find(j => {
    if (card.retiredJokes.includes(j)) return false;
    if (opts.recentStance && j.toLowerCase().includes(opts.recentStance.toLowerCase())) return false;
    return true;
  });
  if (availableJoke) {
    lines.push(`Running angle: ${availableJoke}`);
  }

  // Rivalry note (only when this is a head-to-head section)
  if (opts.includeRivalry && opts.rivalryOpponent) {
    const rivalry = card.rivalries.find(
      r => r.team.toLowerCase() === opts.rivalryOpponent!.toLowerCase()
    );
    if (rivalry) {
      lines.push(`Rivalry (${rivalry.intensity.replace('_', ' ')}): ${rivalry.notes}`);
    }
  }

  return lines.length > 0 ? `\n[${card.teamName} narrative context]\n${lines.join('\n')}` : '';
}

/**
 * Build combined team card context for a matchup (both teams).
 * Only includes rivalry notes when rivalry score >= 5.
 */
export function buildMatchupCardContext(
  winnerName: string,
  loserName: string,
  rivalryScore: number,
  recentStances?: { [team: string]: string | undefined },
): string {
  const isRivalry = rivalryScore >= 5;

  const winnerCtx = buildTeamCardContext(winnerName, {
    recentStance: recentStances?.[winnerName],
    includeRivalry: isRivalry,
    rivalryOpponent: loserName,
  });
  const loserCtx = buildTeamCardContext(loserName, {
    recentStance: recentStances?.[loserName],
    includeRivalry: isRivalry,
    rivalryOpponent: winnerName,
  });

  return [winnerCtx, loserCtx].filter(Boolean).join('\n');
}

/**
 * Return the preferred angles for a team that aren't in the recent-output log.
 * Useful for injecting a fresh narrative angle when dedupe context fires.
 */
export function getFreshAngle(
  teamName: string,
  usedAngles: string[],
): string | null {
  const card = getTeamCard(teamName);
  if (!card || card.preferredAngles.length === 0) return null;

  const fresh = card.preferredAngles.find(angle =>
    !usedAngles.some(used =>
      angle.toLowerCase().includes(used.toLowerCase()) ||
      used.toLowerCase().includes(angle.toLowerCase())
    )
  );
  return fresh ?? null;
}

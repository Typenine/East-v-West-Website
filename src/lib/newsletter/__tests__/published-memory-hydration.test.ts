import { describe, expect, it } from 'vitest';
import type { BotMemory } from '../types';
import type { PublishedTakeLedgerEntry } from '../published-take-store';
import { hydratePublishedRelationships } from '../published-memory-hydration';

function freshMemory(): BotMemory {
  return {
    bot: 'entertainer',
    updated_at: new Date(0).toISOString(),
    summaryMood: 'Focused',
    teams: {},
    personality: {
      confidence: 60, optimism: 40, loyalty: 30, analyticalTrust: -20,
      grudgeLevel: 50, riskTolerance: 70, volatility: 60, contrarianism: 55,
      nostalgia: 40, pettiness: 60, patience: -20, superstition: 50,
      competitiveness: 70, underdogAffinity: 60, dramaAppreciation: 80,
    },
  };
}

function take(id: string, subjectType: PublishedTakeLedgerEntry['subjectType'], subject: string, claim: string): PublishedTakeLedgerEntry {
  return {
    id, sourceNewsletterId: 'issue-week-9', title: 'Week Nine', episodeType: 'regular',
    season: 2026, week: 9, subjectType, subject, claim, claimType: 'evaluation',
    stance: 'mixed', confidence: 0.9, memorable: false,
    status: 'active', publishedAt: '2026-11-11T14:33:51.947Z',
  };
}

describe('published newsletter memory hydration', () => {
  it('keeps separate team/player memories and never invents personality development', () => {
    const memory = freshMemory();
    const entries = [
      take('one', 'team', 'Belleview Badgers', 'The Badgers have shifted into a rebuild.'),
      take('two', 'player', 'Mike Evans', 'Evans remains a reliable veteran contributor.'),
      take('three', 'league', 'East v. West', 'The league feels different this season.'),
      take('four', 'team', 'Not A Real Team', 'This should not create a relationship.'),
    ];
    const priorConfidence = memory.personality?.confidence;
    const health = hydratePublishedRelationships(memory, entries);
    expect(health).toMatchObject({ teams: 1, players: 1, teamTakes: 1, playerTakes: 1 });
    expect(memory.deepTeamRelationships?.['Belleview Badgers'].takeHistory).toHaveLength(1);
    expect(memory.deepPlayerRelationships?.['editorial:mike-evans'].history).toHaveLength(1);
    expect(memory.personality?.confidence).toBe(priorConfidence);
    expect(memory.personalGrowth?.hardLessons).toBeUndefined();
  });

  it('reprocessing the same issue does not duplicate its relationship history', () => {
    const memory = freshMemory();
    const entries = [
      take('one', 'team', 'Belleview Badgers', 'The Badgers have shifted into a rebuild.'),
      { ...take('two', 'player', 'Mike Evans', 'Evans remains a reliable veteran contributor.'), claimType: 'prediction' as const },
    ];
    hydratePublishedRelationships(memory, entries);
    hydratePublishedRelationships(memory, entries);
    expect(memory.deepTeamRelationships?.['Belleview Badgers'].takeHistory).toHaveLength(1);
    expect(memory.deepPlayerRelationships?.['editorial:mike-evans'].history).toHaveLength(1);
    expect(memory.deepPlayerRelationships?.['editorial:mike-evans'].predictions).toHaveLength(1);
  });

  it('preserves previously established relationships when adding new takes', () => {
    const memory = freshMemory();
    const first = take('one', 'team', 'Belleview Badgers', 'The Badgers are leaning into a rebuild.');
    const second = { ...take('two', 'team', 'Belleview Badgers', 'Their recent lineups confirm a rebuilding approach.'), week: 10 };
    hydratePublishedRelationships(memory, [first]);
    const rel = memory.deepTeamRelationships?.['Belleview Badgers'];
    if (!rel) throw Error('Missing team');
    rel.trustLevel = -12;
    hydratePublishedRelationships(memory, [first, second]);
    expect(rel.trustLevel).toBe(-12);
    expect(rel.takeHistory).toHaveLength(2);
    expect(rel.currentNarrative).toBe(second.claim);
  });
});

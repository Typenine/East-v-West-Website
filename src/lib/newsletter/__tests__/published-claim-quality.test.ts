import { describe, expect, it } from 'vitest';
import {
  cleanPublishedClaim,
  classifyPublishedClaim,
  hasExplicitPrediction,
  reconcilePublishedClaim,
} from '../published-claim-quality';
import { synthesizePublishedIntelligence } from '../editorial-memory';

describe('published claim classification', () => {
  it.each([
    "Bimg Bamg Boomg looks like it's tanking now.",
    "Brian Robinson's arrival adds protection to a backfield whose best outcomes remain concentrated in two stars.",
    "I am not going to repeat the running back criticism.",
    "The champion did not put the trophy on the table.",
    "This is going to be tougher than last week.",
    "I'm not going to use my own correct prediction to pretend 90.",
    "I still think Detroit Dawgs can make the playoffs.",
    "I already know Westy is going to tell me not to grade the trade off three games.",
    "Going to a championship game is difficult.",
    "The next opponent is the defending champion.",
  ])('rejects vague commentary as a verifiable prediction: %s', quote => {
    expect(hasExplicitPrediction(quote)).toBe(false);
    expect(classifyPublishedClaim(quote)).not.toBe('prediction');
  });

  it.each([
    'Red Pandas is my pick.',
    'My pick is Mt. Lebanon Cake Eaters.',
    'I am taking bop pop for a fifth straight win.',
    'I predict a top-four finish and a championship appearance.',
    'Detroit Dawgs will make the playoffs.',
    'Elemental Heroes will miss the playoffs.',
    'I expect the Badgers to finish seventh.',
    'This team will score 150 points.',
  ])('recognizes explicit future outcomes: %s', quote => {
    expect(hasExplicitPrediction(quote)).toBe(true);
    expect(classifyPublishedClaim(quote)).toBe('prediction');
  });

  it('removes extraction markers but preserves original words and classification', () => {
    const raw = '[[TEAM:Belleview Badgers]] [[SECTION:LEAGUE PULSE]] I am not going to reward that lineup.';
    const old = { id: 'receipt-1', claim: raw, claimType: 'prediction' as const };
    const cleaned = reconcilePublishedClaim(old);
    expect(cleaned.claim).toBe('I am not going to reward that lineup.');
    expect(cleaned.claimType).toBe('evaluation');
    expect(cleaned.originalClaim).toBe(raw);
    expect(cleaned.originalClaimType).toBe('prediction');
    expect(reconcilePublishedClaim(cleaned)).toEqual(cleaned);
    expect(cleanPublishedClaim(raw)).not.toContain('[[');
  });

  it('does not truncate Mt. Lebanon, decimal scores or team context in PDF dialogue', async () => {
    const digest = await synthesizePublishedIntelligence({
      season: 2026, week: 9,
      teamNames: ['Belleview Badgers', 'Bimg Bamg Boomg', 'Mt. Lebanon Cake Eaters', 'Red Pandas'],
      playerNames: ['Mike Evans'],
      entertainerText: [
        '[[TEAM:Belleview Badgers]] [[SECTION:LEAGUE PULSE]] My pick is Mt. Lebanon Cake Eaters. Their 173.90 points were impressive.',
        '[[SECTION:OPENING EXCHANGE]] Bimg Bamg Boomg looks like it is tanking now. I am not going to invent another injury excuse.',
      ].join('\n\n'),
      analystText: '[[SECTION:LEAGUE PULSE]] I am taking Red Pandas for the win. Their 137.50 points last week should not be ignored.',
    });
    const mason = digest.claims.filter(x => x.bot === 'entertainer');
    const westy = digest.claims.filter(x => x.bot === 'analyst');
    expect(mason.some(x => x.claim.includes('My pick is Mt. Lebanon Cake Eaters.') && x.claimType === 'prediction' && x.subject === 'Mt. Lebanon Cake Eaters')).toBe(true);
    expect(mason.every(x => !x.claim.includes('[['))).toBe(true);
    expect(mason.some(x => x.claim.includes('Bimg Bamg Boomg looks like it is tanking now') && x.claimType !== 'prediction')).toBe(true);
    expect(westy.some(x => x.claim.includes('I am taking Red Pandas for the win') && x.claimType === 'prediction')).toBe(true);
    expect(westy.every(x => !x.claim.includes('[['))).toBe(true);
  });

  it('keeps source records untouched and never grades outcomes', () => {
    const old = { claim: '[[SECTION:OPENING EXCHANGE]] I am taking Red Pandas.', claimType: 'prediction' as const, sourceNewsletterId: 'week-7', status: 'active' };
    const upgraded = reconcilePublishedClaim(old);
    expect(old.claim).toContain('[[');
    expect(upgraded.sourceNewsletterId).toBe(old.sourceNewsletterId);
    expect(upgraded.status).toBe(old.status);
    expect(upgraded.claimType).toBe('prediction');
  });
});

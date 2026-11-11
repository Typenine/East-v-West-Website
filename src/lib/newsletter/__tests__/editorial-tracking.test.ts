import { describe, expect, it } from 'vitest';
import { buildScoreboard, extractEditorial } from '../editorial-tracking';

const fixtures = [
  ['Red Pandas', 'bop pop'],
  ['Detroit Dawgs', 'Double Trouble'],
  ['Bimg Bamg Boomg', 'Belleview Badgers'],
  ['Elemental Heroes', 'Belltown Raptors'],
  ['Cascade Marauders', 'The Lone Ginger'],
  ['Mt. Lebanon Cake Eaters', 'BeerNeverBrokeMyHeart'],
] as const;
const picks = fixtures.map(([a,b],i)=>a+' / '+b+'    '+(i%2?a:b)+'    '+a).join('\n');
const results = fixtures.map(([a,b],i)=>a+' '+(i%2?'100.10':'120.10')+', '+b+' '+(i%2?'120.10':'100.10')).join('\n');

describe('published editorial tracking', () => {
  it('reads all six validated pick-sheet rows for the NEXT week', () => {
    const entry=extractEditorial('The Week Ten pick sheet\nMATCHUP     MASON     WESTY\n'+picks,2026,9);
    expect(entry.picks).toHaveLength(6);
    expect(entry.picks.every(p=>p.week===10)).toBe(true);
    expect(entry.picks[0]).toMatchObject({mason:'bop pop',westy:'Red Pandas'});
  });

  it('does not treat malformed or off-matchup picks as valid', () => {
    const raw='Red Pandas / bop pop   Bimg Bamg Boomg   Red Pandas';
    expect(extractEditorial(raw,2026,9).picks).toHaveLength(0);
  });

  it('grades only fully matched, actually completed weeks', () => {
    const week9=extractEditorial('WEEK NINE RESULTS\n'+results,2026,9);
    const week8=extractEditorial('The Week Nine pick sheet\n'+picks,2026,8);
    const score=buildScoreboard([week9,week8]);
    expect(score.verified).toBe(true);
    expect(score.lastWeek?.week).toBe(9);
    expect(score.mason.w+score.mason.l).toBe(6);
    expect(score.westy.w+score.westy.l).toBe(6);
    expect(score.disagreements.w+score.disagreements.l).toBe(3);
  });

  it('flags incomplete picks rather than reporting an authoritative score', () => {
    const week9=extractEditorial(results,2026,9);
    const week8=extractEditorial(picks.split('\n').slice(0,5).join('\n'),2026,8);
    const score=buildScoreboard([week9,week8]);
    expect(score.verified).toBe(false);
    expect(score.missingWeeks).toContain(9);
  });

  it('extracts attributed Stock Watch observations without judging their outcome', () => {
    const entry=extractEditorial([
      'STOCK WATCH',
      'Young receivers worth watching',
      'WESTY',
      'I want to see whether this new role can last more than a week.',
      'MASON REED',
      'I think there is real potential here, but the manager needs to use him.',
      "CLANCY'S RECEIPT DESK",
    ].join('\n'),2026,9);
    expect(entry.stockWatch).toHaveLength(1);
    expect(entry.stockWatch[0].subject).toBe('Young receivers worth watching');
    expect(entry.stockWatch[0].westyText).toContain('more than a week');
    expect(entry.stockWatch[0].masonText).toContain('real potential');
  });
});

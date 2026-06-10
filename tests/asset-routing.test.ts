import { describe, it, expect } from 'vitest';
import { assetsGivenBy, senderOfAsset } from '@/lib/trades/asset-routing';
import type { Trade, TradeAsset } from '@/lib/utils/trades';

// Regression: 3-team trade on May 3, 2026 between Belleview Badgers,
// Mt. Lebanon Cake Eaters, and The Lone Ginger (Sleeper tx 1356486499620630528).
// The 2026 1st Round Pick (bop pop's slot) and Brian Thomas moved from
// The Lone Ginger — the tree previously attributed them to the Cake Eaters
// (or dropped givers entirely when `gives` was missing on the stored trade).

const pick2026First: TradeAsset = {
  type: 'pick',
  name: "2026 1st Round Pick (bop pop's slot)",
  year: '2026',
  round: 1,
  originalOwner: 'bop pop',
};

const pick2027Third: TradeAsset = {
  type: 'pick',
  name: "2027 3rd Round Pick (Belleview Badgers's slot)",
  year: '2027',
  round: 3,
  originalOwner: 'Belleview Badgers',
};

const doubs: TradeAsset = { type: 'player', name: 'Romeo Doubs', position: 'WR', playerId: '8121' };
const thomas: TradeAsset = { type: 'player', name: 'Brian Thomas', position: 'WR', playerId: '11631' };
const playerA: TradeAsset = { type: 'player', name: 'Player A', position: 'RB', playerId: '7543' };
const playerB: TradeAsset = { type: 'player', name: 'Player B', position: 'TE', playerId: '5892' };
const playerC: TradeAsset = { type: 'player', name: 'Player C', position: 'WR', playerId: '12545' };

/**
 * Trade as stored WITHOUT `gives` (manual trade / manual override shape):
 * - Badgers received: Player A, 2026 1st (bop pop's slot, sent by Lone Ginger)
 * - Cake Eaters received: Doubs, Thomas (Thomas sent by Lone Ginger)
 * - Lone Ginger received: Player B, Player C, 2027 3rd (Badgers' slot)
 */
function threeTeamTradeWithoutGives(): Trade {
  return {
    id: '1356486499620630528',
    date: '2026-05-03',
    status: 'completed',
    season: '2026',
    week: null,
    created: null,
    teams: [
      { name: 'Belleview Badgers', assets: [playerA, pick2026First] },
      { name: 'Mt. Lebanon Cake Eaters', assets: [doubs, thomas] },
      { name: 'The Lone Ginger', assets: [playerB, playerC, pick2027Third] },
    ],
  };
}

/** Same trade WITH explicit `gives` (Sleeper-computed shape). */
function threeTeamTradeWithGives(): Trade {
  const t = threeTeamTradeWithoutGives();
  t.teams[0].gives = [playerB, doubs, playerC, pick2027Third]; // Badgers sent
  t.teams[1].gives = [playerA]; // Cake Eaters sent
  t.teams[2].gives = [thomas, pick2026First]; // Lone Ginger sent
  return t;
}

describe('assetsGivenBy — 3-team trades', () => {
  it('uses explicit gives when present', () => {
    const trade = threeTeamTradeWithGives();
    expect(assetsGivenBy(trade, 'The Lone Ginger')).toEqual([thomas, pick2026First]);
    expect(assetsGivenBy(trade, 'Mt. Lebanon Cake Eaters')).toEqual([playerA]);
  });

  it('attributes the 2026 1st to the giver, never the Cake Eaters', () => {
    const trade = threeTeamTradeWithGives();
    const cakeEatersGave = assetsGivenBy(trade, 'Mt. Lebanon Cake Eaters');
    expect(cakeEatersGave).not.toContainEqual(pick2026First);
    expect(cakeEatersGave).not.toContainEqual(thomas);
  });

  it('infers gives via pick original-owner tiebreak when gives is missing', () => {
    const trade = threeTeamTradeWithoutGives();
    // 2027 3rd is Badgers' own slot and the Badgers did not receive it →
    // elimination + original-owner tiebreak attribute it to the Badgers.
    const badgersGave = assetsGivenBy(trade, 'Belleview Badgers');
    expect(badgersGave).toContainEqual(pick2027Third);
    // Cake Eaters must not be credited with picks they never owned.
    const cakeEatersGave = assetsGivenBy(trade, 'Mt. Lebanon Cake Eaters');
    expect(cakeEatersGave).not.toContainEqual(pick2026First);
    expect(cakeEatersGave).not.toContainEqual(pick2027Third);
  });

  it('never guesses when the sender is genuinely ambiguous', () => {
    const trade = threeTeamTradeWithoutGives();
    // Player ownership can't be derived from received assets alone in a
    // gives-less 3-team trade — ambiguous players must not be attributed.
    const cakeEatersGave = assetsGivenBy(trade, 'Mt. Lebanon Cake Eaters');
    for (const a of cakeEatersGave) expect(a.type).not.toBe('player');
  });

  it('resolves partial gives by elimination', () => {
    const trade = threeTeamTradeWithoutGives();
    // Only the Cake Eaters carry explicit gives (Player A). The 2026 1st
    // received by the Badgers is then attributable only to The Lone Ginger.
    trade.teams[1].gives = [playerA];
    expect(senderOfAsset(trade, 'Belleview Badgers', pick2026First)).toBe('The Lone Ginger');
    expect(assetsGivenBy(trade, 'The Lone Ginger')).toContainEqual(pick2026First);
  });
});

describe('senderOfAsset — 3-team trades', () => {
  it('identifies The Lone Ginger as sender of the 2026 1st and Thomas', () => {
    const trade = threeTeamTradeWithGives();
    expect(senderOfAsset(trade, 'Belleview Badgers', pick2026First)).toBe('The Lone Ginger');
    expect(senderOfAsset(trade, 'Mt. Lebanon Cake Eaters', thomas)).toBe('The Lone Ginger');
    expect(senderOfAsset(trade, 'Mt. Lebanon Cake Eaters', doubs)).toBe('Belleview Badgers');
  });

  it('returns null instead of a wrong sender when data is insufficient', () => {
    const trade = threeTeamTradeWithoutGives();
    // Two candidate senders (Cake Eaters, Lone Ginger) and no tiebreak →
    // must be null, never a coin-flip attribution.
    expect(senderOfAsset(trade, 'Belleview Badgers', playerA)).toBeNull();
  });
});

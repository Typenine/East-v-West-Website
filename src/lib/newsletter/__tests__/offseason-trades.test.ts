/**
 * Regression tests for buildOffseasonTradeFacts.
 *
 * Pure functions only — no I/O, no LLM calls, no DB.
 * Run with: npx vitest run src/lib/newsletter/__tests__/offseason-trades.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildOffseasonTradeFacts,
  buildOffseasonTradesContextBlock,
  type OffseasonTradeInput,
} from '../offseason-trades';

// Mirrors the real May 2026 3-team trade as it comes out of fetchTradesAllTime:
// Sleeper's raw transaction status is 'complete', NOT 'completed'.
const threeTeamSleeperTrade: OffseasonTradeInput = {
  id: '1356486499620630528',
  date: '2026-05-02',
  season: '2026',
  status: 'complete',
  teams: [
    {
      name: 'Belleview Badgers',
      assets: [],
      gets: [{ name: 'Travis Etienne (from Mt. Lebanon Cake Eaters)' }, { name: '2026 1st Round Pick (from The Lone Ginger)' }],
      gives: [{ name: 'Romeo Doubs → Mt. Lebanon Cake Eaters' }, { name: 'David Montgomery → The Lone Ginger' }],
    },
    {
      name: 'Mt. Lebanon Cake Eaters',
      assets: [],
      gets: [{ name: 'Romeo Doubs (from Belleview Badgers)' }, { name: 'Brian Thomas (from The Lone Ginger)' }],
      gives: [{ name: 'Travis Etienne → Belleview Badgers' }],
    },
    {
      name: 'The Lone Ginger',
      assets: [],
      gets: [{ name: 'David Montgomery (from Belleview Badgers)' }],
      gives: [{ name: 'Brian Thomas → Mt. Lebanon Cake Eaters' }, { name: '2026 1st Round Pick → Belleview Badgers' }],
    },
  ],
};

describe('buildOffseasonTradeFacts — status normalization', () => {
  it("keeps Sleeper trades whose raw status is 'complete'", () => {
    // Regression: the pre-draft facts block claimed "No trades have been made"
    // because Sleeper's 'complete' failed a strict === 'completed' check, so the
    // bots wrote NO_TRADES despite a real 3-team trade existing.
    const facts = buildOffseasonTradeFacts([threeTeamSleeperTrade], 2026);
    expect(facts).toHaveLength(1);
    expect(facts[0].teams.map(t => t.name)).toContain('The Lone Ginger');
  });

  it("keeps manual trades whose status is 'completed'", () => {
    const facts = buildOffseasonTradeFacts([{ ...threeTeamSleeperTrade, status: 'completed' }], 2026);
    expect(facts).toHaveLength(1);
  });

  it('keeps trades with no status at all', () => {
    const facts = buildOffseasonTradeFacts([{ ...threeTeamSleeperTrade, status: undefined }], 2026);
    expect(facts).toHaveLength(1);
  });

  it('drops pending and vetoed trades', () => {
    expect(buildOffseasonTradeFacts([{ ...threeTeamSleeperTrade, status: 'pending' }], 2026)).toHaveLength(0);
    expect(buildOffseasonTradeFacts([{ ...threeTeamSleeperTrade, status: 'vetoed' }], 2026)).toHaveLength(0);
  });
});

describe('buildOffseasonTradeFacts — offseason window', () => {
  it('keeps a current-season trade regardless of date', () => {
    const facts = buildOffseasonTradeFacts([{ ...threeTeamSleeperTrade, date: '2026-01-05' }], 2026);
    expect(facts).toHaveLength(1);
  });

  it('keeps a prior-season trade dated after Dec 20', () => {
    const facts = buildOffseasonTradeFacts(
      [{ ...threeTeamSleeperTrade, season: '2025', date: '2025-12-28' }],
      2026,
    );
    expect(facts).toHaveLength(1);
  });

  it('drops a prior-season trade from mid-season', () => {
    const facts = buildOffseasonTradeFacts(
      [{ ...threeTeamSleeperTrade, season: '2025', date: '2025-10-15' }],
      2026,
    );
    expect(facts).toHaveLength(0);
  });
});

describe('buildOffseasonTradesContextBlock — 3-team trade rendering', () => {
  it('lists the trade with all three parties and the multi-team warning', () => {
    const facts = buildOffseasonTradeFacts([threeTeamSleeperTrade], 2026);
    const block = buildOffseasonTradesContextBlock(facts, 2026);
    expect(block).toContain('3-TEAM TRADE');
    expect(block).toContain('Belleview Badgers');
    expect(block).toContain('Mt. Lebanon Cake Eaters');
    expect(block).toContain('The Lone Ginger');
    expect(block).not.toContain('No trades have been made');
  });

  it('says no trades only when the facts list is actually empty', () => {
    const block = buildOffseasonTradesContextBlock([], 2026);
    expect(block).toContain('No trades have been made in the 2026 offseason yet');
  });
});

/**
 * Regression tests for trade-facts helpers.
 *
 * Pure functions only — no I/O, no LLM calls, no DB.
 * Run with: npx vitest run src/lib/newsletter/__tests__/trade-facts.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildTradeFacts,
  buildTradeRoutingLedger,
  buildTradePartyScopeBlock,
  stripTradeGradeLeadIn,
  stripTradeIntroBoilerplate,
  type ByTeam,
} from '../trade-facts';

// ── buildTradeFacts ───────────────────────────────────────────────────────────

describe('buildTradeFacts — 3-team trade', () => {
  const parties = ['Team Alpha', 'Team Beta', 'Team Gamma'];
  const byTeam: ByTeam = {
    'Team Alpha': { gives: ['Justin Jefferson'], gets: ['2026 Rd 1 Pick', 'Bijan Robinson'] },
    'Team Beta':  { gives: ['2026 Rd 1 Pick'],   gets: ['Justin Jefferson'] },
    'Team Gamma': { gives: ['Bijan Robinson'],    gets: [] },
  };

  const block = buildTradeFacts(parties, byTeam);

  it('contains SOURCE OF TRUTH header', () => {
    expect(block).toContain('TRADE FACTS — SOURCE OF TRUTH');
  });

  it('identifies the trade as 3-team', () => {
    expect(block).toMatch(/3-team trade/);
  });

  it('lists all three team names in the header area', () => {
    expect(block).toContain('Team Alpha');
    expect(block).toContain('Team Beta');
    expect(block).toContain('Team Gamma');
  });

  it('correctly attributes Justin Jefferson to Team Alpha gave', () => {
    const alphaSection = block.split('\n\n').find(s => s.startsWith('Team Alpha'));
    expect(alphaSection).toBeDefined();
    expect(alphaSection).toContain('Gave:     Justin Jefferson');
  });

  it('correctly attributes 2026 Rd 1 Pick to Team Alpha received', () => {
    const alphaSection = block.split('\n\n').find(s => s.startsWith('Team Alpha'));
    expect(alphaSection).toContain('Received: 2026 Rd 1 Pick');
  });

  it('correctly attributes draft pick to Team Beta gave', () => {
    const betaSection = block.split('\n\n').find(s => s.startsWith('Team Beta'));
    expect(betaSection).toBeDefined();
    expect(betaSection).toContain('Gave:     2026 Rd 1 Pick');
  });

  it('does NOT list Justin Jefferson under Team Beta gave', () => {
    const betaSection = block.split('\n\n').find(s => s.startsWith('Team Beta'));
    expect(betaSection).toBeDefined();
    expect(betaSection).not.toMatch(/Gave:.*Justin Jefferson/);
  });

  it('shows (no assets listed) for Team Gamma received', () => {
    const gammaSection = block.split('\n\n').find(s => s.startsWith('Team Gamma'));
    expect(gammaSection).toBeDefined();
    expect(gammaSection).toContain('Received: (no assets listed)');
  });

  it('includes multi-team grading note in footer', () => {
    expect(block).toContain('Per-team Gave/Received is authoritative');
  });
});

describe('buildTradePartyScopeBlock — Etienne 3-team trade', () => {
  const parties = ['Belleview Badgers', 'Mt. Lebanon Cake Eaters ', 'The Lone Ginger'];
  const byTeam: ByTeam = {
    'Belleview Badgers': {
      gives: ['Romeo Doubs → Mt. Lebanon Cake Eaters ', 'David Montgomery → The Lone Ginger'],
      gets: ['Travis Etienne (from Mt. Lebanon Cake Eaters )', '2026 Rd 1 Pick (bop pop\'s slot) (from The Lone Ginger)'],
    },
    'Mt. Lebanon Cake Eaters ': {
      gives: ['Travis Etienne → Belleview Badgers'],
      gets: ['Romeo Doubs (from Belleview Badgers)', 'Brian Thomas (from The Lone Ginger)'],
    },
    'The Lone Ginger': {
      gives: ['Brian Thomas → Mt. Lebanon Cake Eaters ', '2026 Rd 1 Pick (bop pop\'s slot) → Belleview Badgers'],
      gets: ['David Montgomery (from Belleview Badgers)'],
    },
  };

  it('lists Badgers gave only Doubs (not Thomas) in scope block', () => {
    const scope = buildTradePartyScopeBlock('Belleview Badgers', parties, byTeam);
    const gaveLine = scope.match(/Assets Belleview Badgers gave up IN THIS TRADE \(\d+\):[^\n]+/)?.[0] ?? '';
    expect(gaveLine).toContain('Romeo Doubs');
    expect(gaveLine).not.toContain('Brian Thomas');
    expect(scope).toContain('The Lone Ginger SENT:');
    expect(scope).toMatch(/Brian Thomas → Mt\. Lebanon/);
  });

  it('states Lone Ginger sent the 1st, not Mt. Lebanon', () => {
    const scope = buildTradePartyScopeBlock('Belleview Badgers', parties, byTeam);
    expect(scope).toContain('(from The Lone Ginger)');
    const mtLine = scope.match(/Mt\. Lebanon Cake Eaters  SENT:[^\n]+/)?.[0] ?? '';
    expect(mtLine).not.toContain('2026 Rd 1');
    expect(scope).toMatch(/The Lone Ginger SENT:[^\n]*2026 Rd 1 Pick/);
  });
});

describe('buildTradeRoutingLedger — annotated 3-team flows', () => {
  const parties = ['Team Alpha', 'Team Beta', 'Team Gamma'];
  const byTeam: ByTeam = {
    'Team Alpha': {
      gives: ['Justin Jefferson → Team Beta'],
      gets: ['2026 Rd 1 Pick (from Team Beta)', 'Bijan Robinson (from Team Gamma)'],
    },
    'Team Beta': {
      gives: ['2026 Rd 1 Pick → Team Alpha'],
      gets: ['Justin Jefferson (from Team Alpha)'],
    },
    'Team Gamma': {
      gives: ['Bijan Robinson → Team Alpha'],
      gets: [],
    },
  };

  it('lists each direct transfer', () => {
    const ledger = buildTradeRoutingLedger(parties, byTeam);
    expect(ledger).toContain('Team Alpha → Team Beta: Justin Jefferson');
    expect(ledger).toContain('Team Beta → Team Alpha: 2026 Rd 1 Pick');
    expect(ledger).toContain('Team Gamma → Team Alpha: Bijan Robinson');
    expect(ledger).toContain('Team Alpha → Team Beta: Justin Jefferson');
    expect(ledger).not.toContain('Team Beta → Team Beta');
  });

  it('embeds routing ledger inside buildTradeFacts for 3-team trades', () => {
    const block = buildTradeFacts(parties, byTeam);
    expect(block).toContain('PAIRWISE ROUTING');
    expect(block).toContain('Team Gamma → Team Alpha: Bijan Robinson');
  });
});

describe('buildTradeFacts — 2-team trade', () => {
  const parties = ['Seller', 'Buyer'];
  const byTeam: ByTeam = {
    Seller: { gives: ['Cooper Kupp'], gets: ['2025 Rd 2 Pick'] },
    Buyer:  { gives: ['2025 Rd 2 Pick'], gets: ['Cooper Kupp'] },
  };

  const block = buildTradeFacts(parties, byTeam);

  it('does not say 3-team', () => {
    expect(block).not.toMatch(/3-team/);
  });

  it('correctly attributes Cooper Kupp to Seller gave', () => {
    const sellerSection = block.split('\n\n').find(s => s.startsWith('Seller'));
    expect(sellerSection).toContain('Gave:     Cooper Kupp');
  });
});

describe('buildTradeFacts — empty gives/gets', () => {
  const parties = ['A', 'B'];
  const byTeam: ByTeam = {
    A: { gives: [],  gets: ['Someone'] },
    B: { gives: ['Someone'], gets: [] },
  };

  const block = buildTradeFacts(parties, byTeam);

  it('renders (no assets listed) for empty gives', () => {
    const aSection = block.split('\n\n').find(s => s.startsWith('A\n'));
    expect(aSection).toContain('Gave:     (no assets listed)');
  });

  it('renders (no assets listed) for empty gets', () => {
    const bSection = block.split('\n\n').find(s => s.startsWith('B\n'));
    expect(bSection).toContain('Received: (no assets listed)');
  });
});

describe('buildTradeFacts — data warnings', () => {
  it('warns when fewer than 2 teams in byTeam', () => {
    const block = buildTradeFacts(['Solo'], { Solo: { gives: ['X'], gets: [] } });
    expect(block).toContain('WARNING');
  });

  it('warns when parties list has fewer than 2 entries', () => {
    const block = buildTradeFacts([], {});
    expect(block).toContain('WARNING');
  });
});

// ── stripTradeIntroBoilerplate ────────────────────────────────────────────────

describe('stripTradeGradeLeadIn', () => {
  it('removes a leading trade-recap sentence', () => {
    const input =
      "Look, I'll be honest — when I first saw this three-team trade, I felt sick. " +
      'For Belleview Badgers this is a clear B+ win.';
    const result = stripTradeGradeLeadIn(input);
    expect(result).not.toMatch(/when i first saw/i);
    expect(result).toContain('Belleview Badgers');
  });
});

describe('stripTradeIntroBoilerplate', () => {
  it('strips "Let\'s break down this trade"', () => {
    const input = "Let's break down this trade. Cooper Kupp is a big get.";
    const result = stripTradeIntroBoilerplate(input);
    expect(result).not.toMatch(/let['']s break down/i);
    expect(result).toContain('Cooper Kupp');
  });

  it('strips "Welcome to the trade section"', () => {
    const input = 'Welcome to the trade section, folks. This one is spicy.';
    const result = stripTradeIntroBoilerplate(input);
    expect(result).not.toMatch(/welcome to the trade section/i);
    expect(result).toContain('spicy');
  });

  it('strips "This week\'s trade"', () => {
    const input = "This week's trade has my attention. Team A did well.";
    const result = stripTradeIntroBoilerplate(input);
    expect(result).not.toMatch(/this week['']s trade/i);
  });

  it('preserves normal analysis text untouched', () => {
    const input = 'Cooper Kupp is a significant value pickup at this stage of his career.';
    const result = stripTradeIntroBoilerplate(input);
    expect(result).toBe(input);
  });

  it('capitalises first letter after stripping', () => {
    const input = "Let's break down this trade. nice pickup here.";
    const result = stripTradeIntroBoilerplate(input);
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });

  it('calls the onStripped callback when a pattern matches', () => {
    let called = false;
    stripTradeIntroBoilerplate("Let's break down this trade. Analysis.", () => { called = true; });
    expect(called).toBe(true);
  });

  it('does not call the onStripped callback when no pattern matches', () => {
    let called = false;
    stripTradeIntroBoilerplate('Straight analysis. No intro.', () => { called = true; });
    expect(called).toBe(false);
  });
});

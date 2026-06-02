/**
 * Regression tests for trade-facts helpers.
 *
 * Pure functions only — no I/O, no LLM calls, no DB.
 * Run with: npx vitest run src/lib/newsletter/__tests__/trade-facts.test.ts
 */

import { describe, it, expect } from 'vitest';
import { buildTradeFacts, stripTradeIntroBoilerplate, type ByTeam } from '../trade-facts';

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
    expect(betaSection).not.toContain('Justin Jefferson');
  });

  it('shows (no assets listed) for Team Gamma received', () => {
    const gammaSection = block.split('\n\n').find(s => s.startsWith('Team Gamma'));
    expect(gammaSection).toBeDefined();
    expect(gammaSection).toContain('Received: (no assets listed)');
  });

  it('includes pick attribution note for 3-team trades', () => {
    expect(block).toContain('Pick sender attribution is verified');
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

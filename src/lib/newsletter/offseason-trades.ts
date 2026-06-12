/**
 * Structured offseason-trade facts for pre-draft newsletters.
 *
 * The pre-draft "Trades" section used to rely on a loose prose list that only
 * said what each team RECEIVED — for 3-team trades the bots had to guess who
 * sent each asset, which is exactly where attribution kept flipping ("the
 * Badgers sent Brian Thomas" when The Lone Ginger did). This module builds a
 * deterministic facts block with per-team Received/Sent lines and a pairwise
 * routing ledger for multi-team deals, plus the structured data the
 * attribution lint needs.
 */

import { buildTradeRoutingLedger, type ByTeam } from './trade-facts';

/** Minimal structural view of a Trade from fetchTradesAllTime / manual trades. */
export interface OffseasonTradeInput {
  id: string;
  date: string;
  season?: string;
  status?: string;
  teams: Array<{
    name: string;
    assets: Array<{ name: string }>;
    gets?: Array<{ name: string }>;
    gives?: Array<{ name: string }>;
  }>;
}

export interface OffseasonTradeFact {
  id: string;
  date: string;
  /** Received/sent strings keep their "(from X)" / "→ Y" routing suffixes. */
  teams: Array<{ name: string; received: string[]; sent: string[] }>;
}

/** Filter to the current offseason window and normalize to received/sent lists. */
export function buildOffseasonTradeFacts(
  trades: OffseasonTradeInput[],
  currentSeason: number,
): OffseasonTradeFact[] {
  const offseasonStart = new Date(`${currentSeason - 1}-12-20`);
  return trades
    .filter(t => t.status === undefined || t.status === 'completed')
    .filter(t => {
      if (t.season === String(currentSeason)) return true;
      if (t.date && new Date(t.date) >= offseasonStart) return true;
      return false;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(t => ({
      id: t.id,
      date: t.date,
      teams: (t.teams ?? []).map(tm => ({
        name: tm.name,
        received: (tm.gets ?? tm.assets ?? []).map(a => a.name).filter(Boolean),
        sent: (tm.gives ?? []).map(a => a.name).filter(Boolean),
      })),
    }));
}

export function byTeamForOffseasonTrade(t: OffseasonTradeFact): ByTeam {
  const byTeam: ByTeam = {};
  for (const team of t.teams) {
    byTeam[team.name] = { gets: team.received, gives: team.sent };
  }
  return byTeam;
}

/**
 * Deterministic facts block for prompts. Every line is system-generated from
 * Sleeper/manual-trade data — the first trade content the LLM sees.
 */
export function buildOffseasonTradesContextBlock(
  facts: OffseasonTradeFact[],
  currentSeason: number,
): string {
  const lines: string[] = [
    `=== ${currentSeason} OFFSEASON TRADE FACTS — SOURCE OF TRUTH (system-generated, do not contradict) ===`,
  ];
  if (facts.length === 0) {
    lines.push(`No trades have been made in the ${currentSeason} offseason yet. Every team still holds their original draft capital.`);
    lines.push('===');
    return lines.join('\n');
  }

  facts.forEach((t, i) => {
    const parties = t.teams.map(x => x.name);
    const dateStr = t.date
      ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown date';
    lines.push('');
    lines.push(`TRADE ${i + 1} — ${dateStr} — ${parties.join(' ↔ ')}${parties.length > 2 ? ` ⚠️ ${parties.length}-TEAM TRADE` : ''}`);
    for (const team of t.teams) {
      lines.push(`  ${team.name} received: ${team.received.join(', ') || '(nothing listed)'}`);
      if (team.sent.length > 0) {
        lines.push(`  ${team.name} sent: ${team.sent.join(', ')}`);
      }
    }
    if (parties.length > 2) {
      const ledger = buildTradeRoutingLedger(parties, byTeamForOffseasonTrade(t));
      if (ledger) lines.push(...ledger.split('\n').map(l => `  ${l}`));
    }
  });

  lines.push('');
  lines.push('RULES:');
  lines.push('• Each asset moves exactly as listed — "(from X)" names the sender of THAT asset only; "→ Y" names its receiver.');
  lines.push('• In a multi-team trade, never assume one team sent everything another team received — check the PAIRWISE ROUTING lines.');
  lines.push('• Never claim a team gave up an asset that appears under another team\'s "sent" line.');
  lines.push('• Do NOT invent trades or assets not listed above.');
  lines.push('===');
  return lines.join('\n');
}

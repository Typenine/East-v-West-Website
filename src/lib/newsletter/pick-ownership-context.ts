/**
 * Draft pick slot enrichment for newsletter trade events.
 * Shared by staged job start and per-step trade re-derive.
 */

import { getActiveOrLatestDraftId, getDraftSlotsDetailed, getDraftPickTradeHistory } from '@/server/db/queries';
import type { ScoredEvent } from './types';

export type PickLookupEntry = {
  label: string;
  overall: number;
  originalTeam: string;
  chain: string[];
};

export async function buildPickOwnershipContext(seasonNum: number): Promise<{
  contextBlock: string;
  pickLookup: Map<string, PickLookupEntry>;
} | null> {
  try {
    const draftId = await getActiveOrLatestDraftId();
    if (!draftId) return null;

    const [slots, tradeHistory] = await Promise.all([
      getDraftSlotsDetailed(draftId).catch(() => [] as Awaited<ReturnType<typeof getDraftSlotsDetailed>>),
      getDraftPickTradeHistory(draftId).catch(() => [] as Awaited<ReturnType<typeof getDraftPickTradeHistory>>),
    ]);
    if (slots.length === 0) return null;

    if (tradeHistory.length > 0) {
      const hasCurrentYear = tradeHistory.some(t => t.pickYear === seasonNum || t.pickYear === seasonNum + 1);
      if (!hasCurrentYear) {
        console.log(`[PickContext] Draft appears stale (no ${seasonNum} picks in trade history) — skipping`);
        return null;
      }
    }

    const chainMap = new Map<string, string[]>();
    for (const t of tradeHistory) {
      if (!t.pickYear || !t.pickRound) continue;
      const key = t.pickOverall != null
        ? `overall-${t.pickOverall}`
        : `${t.pickYear}-${t.pickRound}-${t.pickOriginalTeam ?? 'unknown'}`;
      if (!chainMap.has(key)) chainMap.set(key, [t.pickOriginalTeam ?? t.fromTeam]);
      const chain = chainMap.get(key)!;
      if (chain[chain.length - 1] !== t.fromTeam) chain.push(t.fromTeam);
      if (chain[chain.length - 1] !== t.toTeam) chain.push(t.toTeam);
    }

    const pickLookup = new Map<string, PickLookupEntry>();
    const linesByRound = new Map<number, string[]>();

    for (const slot of slots) {
      const chain = chainMap.get(`overall-${slot.overall}`)
        ?? chainMap.get(`${seasonNum}-${slot.round}-${slot.originalTeam}`)
        ?? [slot.originalTeam];
      if (chain[chain.length - 1] !== slot.team) chain.push(slot.team);

      const wasTraded = slot.originalTeam !== slot.team;
      const ownershipNote = wasTraded
        ? `currently ${slot.team} (originally ${slot.originalTeam}, chain: ${chain.join(' → ')})`
        : `${slot.team} (original owner)`;

      const slotStr = `${slot.round}.${String(slot.pickInRound).padStart(2, '0')}`;
      const fullLine = `  ${slotStr} (overall #${slot.overall}): ${ownershipNote}`;

      if (!linesByRound.has(slot.round)) linesByRound.set(slot.round, []);
      linesByRound.get(slot.round)!.push(fullLine);

      const lookupKey = `${seasonNum}-${slot.round}-${slot.team}`;
      pickLookup.set(lookupKey, {
        label: `${seasonNum} Rd ${slot.round} Pick ${slotStr} (overall #${slot.overall}, originally ${slot.originalTeam})`,
        overall: slot.overall,
        originalTeam: slot.originalTeam,
        chain,
      });
    }

    const rounds = [...linesByRound.keys()].sort((a, b) => a - b);
    const contextBlock = [
      `=== ${seasonNum} DRAFT PICK OWNERSHIP (from league trade tracker) ===`,
      `Slot (R.P), overall pick #, current owner, and full trade chain for every pick.`,
      `Use this to correctly attribute picks in trades — do NOT rely on Sleeper attribution.`,
      ...rounds.map(r => [`Round ${r}:`, ...(linesByRound.get(r) ?? [])].join('\n')),
      `===`,
    ].join('\n');

    return { contextBlock, pickLookup };
  } catch (e) {
    console.warn('[PickContext] buildPickOwnershipContext failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

function enrichPickLabel(
  asset: string,
  teamName: string,
  pickLookup: Map<string, PickLookupEntry>,
  useReceiverKey: boolean,
): string {
  const m = asset.match(/^(\d{4})\s+Rd\s+(\d+)\s+Pick(?:\s*\([^)]*\))?(?:\s*\(from\s+[^)]*\))?(?:\s*→\s*.+)?$/i);
  if (!m) return asset;
  const [, yr, rd] = m;
  const receiverTeam = useReceiverKey
    ? teamName
    : (asset.match(/→\s*(.+)$/)?.[1]?.trim() || '');
  const entry = receiverTeam ? pickLookup.get(`${yr}-${rd}-${receiverTeam}`) : undefined;
  if (!entry) return asset;
  if (useReceiverKey) {
    const fromMatch = asset.match(/\(from\s+([^)]*)\)/i);
    return fromMatch ? `${entry.label} (from ${fromMatch[1]})` : entry.label;
  }
  const arrowMatch = asset.match(/→\s*(.+)$/);
  return arrowMatch ? `${entry.label} → ${arrowMatch[1]}` : entry.label;
}

type RosterPlayer = { first_name?: string; last_name?: string; position?: string };

/** Per-team roster block for trade grading (positional needs). */
export function buildLeagueRosterContext(
  users: Array<{ user_id: string; display_name?: string; username?: string; metadata?: { team_name?: string } }>,
  rosters: Array<{ roster_id: number; owner_id: string; players?: string[]; taxi?: string[] }>,
  allPlayers: Record<string, RosterPlayer>,
): string {
  const userNameMap = new Map<string, string>();
  const sleeperMap = new Map<string, string>();
  for (const u of users) {
    userNameMap.set(u.user_id, u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`);
    sleeperMap.set(u.user_id, u.username || u.display_name || u.user_id);
  }
  const lines: string[] = [];
  for (const roster of rosters) {
    const teamName = userNameMap.get(roster.owner_id) ?? `Roster ${roster.roster_id}`;
    const sleeperName = sleeperMap.get(roster.owner_id) ?? '';
    const activeIds = roster.players ?? [];
    const taxiIds = roster.taxi ?? [];
    const byPos = new Map<string, Array<{ name: string; taxi: boolean }>>();
    const addPlayer = (pid: string, isTaxi: boolean) => {
      const p = allPlayers[pid];
      if (!p) return;
      const pos = p.position ?? 'UNK';
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
      if (!name) return;
      if (!byPos.has(pos)) byPos.set(pos, []);
      byPos.get(pos)!.push({ name, taxi: isTaxi });
    };
    for (const pid of activeIds) addPlayer(pid, false);
    for (const pid of taxiIds) addPlayer(pid, true);
    const posOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const posLines: string[] = [];
    for (const pos of posOrder) {
      const players = byPos.get(pos);
      if (players?.length) {
        posLines.push(`  ${pos}: ${players.map(pl => (pl.taxi ? `${pl.name}*` : pl.name)).join(', ')}`);
      }
    }
    for (const [pos, players] of byPos) {
      if (!posOrder.includes(pos) && players.length > 0) {
        posLines.push(`  ${pos}: ${players.map(pl => pl.name).join(', ')}`);
      }
    }
    const taxiNote = taxiIds.length > 0 ? ' (*=taxi squad)' : '';
    lines.push(`${teamName} [SL:${sleeperName}]${taxiNote}:\n${posLines.join('\n') || '  (no data)'}`);
  }
  return lines.join('\n\n');
}

/** Enrich pick strings in trade events (gets + gives) using draft slot DB. */
export function enrichDerivedTradePickLabels(
  events: ScoredEvent[],
  pickLookup: Map<string, PickLookupEntry>,
): void {
  for (const ev of events) {
    if (ev.type !== 'trade' || !ev.details?.by_team) continue;
    for (const [teamName, side] of Object.entries(ev.details.by_team)) {
      side.gets = (side.gets ?? []).map(asset => enrichPickLabel(asset, teamName, pickLookup, true));
      side.gives = (side.gives ?? []).map(asset => enrichPickLabel(asset, teamName, pickLookup, false));
    }
  }
}

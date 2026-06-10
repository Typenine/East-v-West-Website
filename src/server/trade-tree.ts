import type { Trade, TradeAsset } from '@/lib/utils/trades';
import { getMergedTradesAllTime } from '@/server/trade-feed';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import { readableAccentOnDark } from '@/lib/trades/trade-card-model';
import type {
  TradeTreeEdgeModel,
  TradeTreeModel,
  TradeTreeNodeModel,
  TreeTeamRef,
} from '@/lib/trades/trade-tree-model';

/**
 * Server-side trade tree (asset lineage) builder.
 *
 * Given a root asset (player or pick), finds every trade the asset moved in
 * and recursively follows the return package: for each asset the trading
 * team received, the next trade in which that team sent it onward, including
 * picks that were drafted into players and flipped again later.
 */

export type TreeRootSelector =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; season: string; round: number; slot: number };

const MAX_TRADE_DEPTH = 8;

// ---------------------------------------------------------------------------
// Asset identity
// ---------------------------------------------------------------------------

function norm(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Stable matching keys for an asset. Picks get multiple keys (draft slot and
 * original owner) because different trades carry different metadata for the
 * same pick; a pick that became a player also matches that player's key so
 * lineage continues through the draft.
 */
function keysForAsset(a: TradeAsset): string[] {
  if (a.type === 'player') {
    return a.playerId ? [`p:${a.playerId}`] : [`pn:${norm(a.name)}`];
  }
  if (a.type === 'pick') {
    const season = String(a.year ?? a.pick?.season ?? '');
    const round = Number(a.round ?? a.pick?.round);
    if (!season || !Number.isFinite(round)) return [];
    const keys: string[] = [];
    const slot = a.draftSlot ?? a.pickInRound;
    if (typeof slot === 'number') keys.push(`k:${season}-${round}-s${slot}`);
    const owner = a.originalOwner ?? a.pick?.originalOwner;
    if (owner) keys.push(`k:${season}-${round}-o${norm(owner)}`);
    if (a.becamePlayerId) keys.push(`p:${a.becamePlayerId}`);
    return keys;
  }
  return []; // FAAB is not followed onward
}

function keysIntersect(a: string[], b: string[]): boolean {
  return a.some((k) => b.includes(k));
}

// ---------------------------------------------------------------------------
// Trade event index: every (trade, giver, asset) movement, chronological
// ---------------------------------------------------------------------------

type TradeEvent = {
  index: number;
  tradeId: string;
  date: string;
  giver: string;
  receiver: string;
  /** Keys of the asset that moved giver -> receiver */
  assetKeys: string[];
  /** What the giver received in return (the child branches) */
  giverReceived: TradeAsset[];
  /** Labels of other assets the receiver got in the same trade */
  packageMates: string[];
};

function sortTradesAscending(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const c = (a.created ?? 0) - (b.created ?? 0);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}

/** Assets a team sent away in a trade (uses computed `gives` when present). */
function assetsGivenBy(trade: Trade, teamName: string): TradeAsset[] {
  const team = trade.teams.find((t) => t.name === teamName);
  if (team?.gives && team.gives.length) return team.gives;
  // Manual trades have no `gives`; for two-team trades the other side's
  // received assets are what this team gave.
  if (trade.teams.length === 2 && team) {
    const other = trade.teams.find((t) => t.name !== teamName);
    return other?.assets ?? [];
  }
  return [];
}

/** The team whose received assets include the given asset. */
function receiverOf(trade: Trade, giverName: string, assetKeys: string[]): string | null {
  for (const team of trade.teams) {
    if (team.name === giverName) continue;
    if (team.assets.some((a) => keysIntersect(keysForAsset(a), assetKeys))) return team.name;
  }
  if (trade.teams.length === 2) {
    const other = trade.teams.find((t) => t.name !== giverName);
    return other?.name ?? null;
  }
  return null;
}

function buildEventIndex(trades: Trade[]): { events: TradeEvent[]; byKey: Map<string, TradeEvent[]> } {
  const ascending = sortTradesAscending(trades);
  const events: TradeEvent[] = [];
  const byKey = new Map<string, TradeEvent[]>();

  ascending.forEach((trade, index) => {
    for (const team of trade.teams) {
      const given = assetsGivenBy(trade, team.name);
      for (const asset of given) {
        const assetKeys = keysForAsset(asset);
        if (!assetKeys.length) continue;
        const receiver = receiverOf(trade, team.name, assetKeys);
        if (!receiver) continue;
        const receiverTeam = trade.teams.find((t) => t.name === receiver);
        const packageMates = (receiverTeam?.assets ?? [])
          .filter((a) => !keysIntersect(keysForAsset(a), assetKeys))
          .map((a) => assetDisplayLabel(a));
        const event: TradeEvent = {
          index,
          tradeId: trade.id,
          date: trade.date,
          giver: team.name,
          receiver,
          assetKeys,
          giverReceived: trade.teams.find((t) => t.name === team.name)?.assets ?? [],
          packageMates,
        };
        events.push(event);
        for (const key of assetKeys) {
          const list = byKey.get(key) ?? [];
          list.push(event);
          byKey.set(key, list);
        }
      }
    }
  });

  return { events, byKey };
}

function findNextEvent(
  byKey: Map<string, TradeEvent[]>,
  assetKeys: string[],
  giver: string,
  afterIndex: number
): TradeEvent | null {
  let best: TradeEvent | null = null;
  for (const key of assetKeys) {
    for (const ev of byKey.get(key) ?? []) {
      if (ev.index <= afterIndex) continue;
      if (ev.giver !== giver) continue;
      if (!best || ev.index < best.index) best = ev;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// View-model construction
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  if (!m) return isoDate || '';
  const [, y, mo, d] = m;
  return `${MONTHS[Number(mo) - 1] ?? mo} ${Number(d)}, ${y}`;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function assetDisplayLabel(a: TradeAsset): string {
  if (a.type === 'player') return a.name;
  if (a.type === 'pick') {
    return a.year && a.round ? `${a.year} ${getOrdinal(a.round)} Round Pick` : a.name;
  }
  return typeof a.faabAmount === 'number' ? `$${a.faabAmount} FAAB` : a.name;
}

const teamRefCache = new Map<string, TreeTeamRef>();
function teamRef(name: string): TreeTeamRef {
  let ref = teamRefCache.get(name);
  if (!ref) {
    ref = {
      name,
      logo: getTeamLogoPath(name),
      accent: readableAccentOnDark(getTeamColors(name)),
    };
    teamRefCache.set(name, ref);
  }
  return ref;
}

function nodeIdFor(asset: TradeAsset): string {
  const keys = keysForAsset(asset);
  return keys[0] ?? `asset:${norm(asset.name)}`;
}

function baseNode(asset: TradeAsset): TradeTreeNodeModel {
  if (asset.type === 'player') {
    return {
      id: nodeIdFor(asset),
      kind: 'player',
      badge: asset.position || 'PLR',
      label: asset.name,
      sub: asset.team && asset.team !== 'FA' ? asset.team : undefined,
      rootHref: asset.playerId
        ? `/trades/tracker?rootType=player&playerId=${encodeURIComponent(asset.playerId)}`
        : undefined,
    };
  }
  if (asset.type === 'pick') {
    const slot = asset.draftSlot ?? asset.pickInRound;
    const subParts: string[] = [];
    if (typeof asset.pickInRound === 'number' && asset.round) {
      subParts.push(`Pick ${asset.round}.${String(asset.pickInRound).padStart(2, '0')}`);
    }
    if (asset.originalOwner) subParts.push(`via ${asset.originalOwner}`);
    return {
      id: nodeIdFor(asset),
      kind: 'pick',
      badge: asset.round ? `R${asset.round}` : 'PICK',
      label: assetDisplayLabel(asset),
      sub: subParts.length ? subParts.join(' · ') : undefined,
      became: asset.became
        ? { badge: asset.becamePosition || 'PLR', label: asset.became }
        : undefined,
      rootHref:
        asset.year && asset.round && typeof slot === 'number'
          ? `/trades/tracker?rootType=pick&season=${asset.year}&round=${asset.round}&slot=${slot}`
          : undefined,
    };
  }
  return {
    id: nodeIdFor(asset),
    kind: 'faab',
    badge: 'FAAB',
    label: assetDisplayLabel(asset),
  };
}

type BuildCtx = {
  byKey: Map<string, TradeEvent[]>;
  visited: Set<string>;
  truncated: { value: boolean };
};

function buildEdge(event: TradeEvent, depthRemaining: number, ctx: BuildCtx): TradeTreeEdgeModel {
  return {
    tradeId: event.tradeId,
    date: event.date,
    dateLabel: formatDateLabel(event.date),
    byTeam: teamRef(event.giver),
    toTeam: teamRef(event.receiver),
    packageMates: event.packageMates.length ? event.packageMates : undefined,
    received: event.giverReceived.map((a) => buildNode(a, event.giver, event.index, depthRemaining, ctx)),
  };
}

function buildNode(
  asset: TradeAsset,
  holder: string,
  afterIndex: number,
  depthRemaining: number,
  ctx: BuildCtx
): TradeTreeNodeModel {
  const node = baseNode(asset);
  const keys = keysForAsset(asset);
  if (!keys.length) return node;

  const next = findNextEvent(ctx.byKey, keys, holder, afterIndex);
  if (!next) return node;

  if (depthRemaining <= 0) {
    ctx.truncated.value = true;
    return node;
  }
  // An asset can carry different identity keys in different trades (slot vs
  // original-owner), so an edge counts as visited if ANY key matches — this
  // keeps a trade from rendering both as a root branch and nested inside one.
  const allKeys = Array.from(new Set([...keys, ...next.assetKeys]));
  if (allKeys.some((k) => ctx.visited.has(`${next.tradeId}:${k}`))) return node;
  for (const k of allKeys) ctx.visited.add(`${next.tradeId}:${k}`);

  node.trade = buildEdge(next, depthRemaining - 1, ctx);
  return node;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function buildAssetTradeTree(
  root: TreeRootSelector,
  options?: { depth?: number; fresh?: boolean }
): Promise<TradeTreeModel> {
  const depth = Math.max(1, Math.min(MAX_TRADE_DEPTH, options?.depth ?? 4));
  const trades = await getMergedTradesAllTime({ fresh: options?.fresh });
  const { byKey } = buildEventIndex(trades);

  const rootKeys =
    root.type === 'player'
      ? [`p:${root.playerId}`]
      : [`k:${root.season}-${root.round}-s${root.slot}`];

  // Find the richest occurrence of the root asset across all trades to build
  // its display node and pick up alternate identity keys.
  let rootAsset: TradeAsset | null = null;
  for (const trade of sortTradesAscending(trades)) {
    for (const team of trade.teams) {
      for (const asset of team.assets) {
        if (keysIntersect(keysForAsset(asset), rootKeys)) {
          if (!rootAsset || (asset.type === 'pick' && asset.became && !(rootAsset.type === 'pick' && rootAsset.became))) {
            rootAsset = asset;
          }
        }
      }
    }
  }

  const allRootKeys = rootAsset
    ? Array.from(new Set([...rootKeys, ...keysForAsset(rootAsset)]))
    : rootKeys;

  const rootNode: TradeTreeNodeModel = rootAsset
    ? baseNode(rootAsset)
    : root.type === 'player'
      ? { id: `p:${root.playerId}`, kind: 'player', badge: 'PLR', label: `Player ${root.playerId}` }
      : {
          id: rootKeys[0],
          kind: 'pick',
          badge: `R${root.round}`,
          label: `${root.season} ${getOrdinal(root.round)} Round Pick`,
          sub: `Slot ${root.slot}`,
        };

  const ctx: BuildCtx = { byKey, visited: new Set(), truncated: { value: false } };

  // Every trade in which the root asset itself moved, chronologically.
  const seenTradeIds = new Set<string>();
  const moveEvents: TradeEvent[] = [];
  for (const key of allRootKeys) {
    for (const ev of byKey.get(key) ?? []) {
      if (seenTradeIds.has(ev.tradeId)) continue;
      seenTradeIds.add(ev.tradeId);
      moveEvents.push(ev);
    }
  }
  moveEvents.sort((a, b) => a.index - b.index);

  // Pre-mark every root move before recursing so the root asset's later
  // moves don't also get expanded inside an earlier branch when the asset
  // circles back through a return package.
  for (const ev of moveEvents) {
    for (const k of new Set([...allRootKeys, ...ev.assetKeys])) {
      ctx.visited.add(`${ev.tradeId}:${k}`);
    }
  }
  const moves = moveEvents.map((ev) => buildEdge(ev, depth - 1, ctx));

  return { root: rootNode, moves, truncated: ctx.truncated.value };
}

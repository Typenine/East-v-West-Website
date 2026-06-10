import type { Trade, TradeAsset } from '@/lib/utils/trades';
import { getMergedTradesAllTime } from '@/server/trade-feed';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import { readableAccentOnDark } from '@/lib/trades/trade-card-model';
import { keysForAsset, keysIntersect, assetsGivenBy, senderOfAsset, normalizeKeyPart } from '@/lib/trades/asset-routing';
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
  /** What the giver received in return from this receiver (the child branches) */
  giverReceived: TradeAsset[];
  /** Labels of other assets the receiver got from the same giver in the trade */
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

/**
 * The team whose received assets include the given asset, confirmed against
 * sender attribution. In 3+ team trades, scanning received assets alone can
 * produce false positives (an asset received by a team but sent by a third
 * participant), so the candidate is kept only when `senderOfAsset` resolves
 * to this giver (or cannot resolve at all — e.g. legacy data with no `gives`).
 */
function receiverOf(trade: Trade, giverName: string, assetKeys: string[]): string | null {
  for (const team of trade.teams) {
    if (team.name === giverName) continue;
    const match = team.assets.find((a) => keysIntersect(keysForAsset(a), assetKeys));
    if (!match) continue;
    if (trade.teams.length > 2) {
      const sender = senderOfAsset(trade, team.name, match);
      if (sender && sender !== giverName) continue;
    }
    return team.name;
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
        const multiTeam = trade.teams.length > 2;
        // In 3+ team trades, only assets actually sent by this giver belong
        // on this edge. E.g. May 3, 2026 (Badgers / Cake Eaters / Lone
        // Ginger): on the Cake Eaters -> Badgers edge, the 2026 1st the
        // Badgers also received must NOT appear as a package mate — it came
        // from The Lone Ginger.
        const packageMates = (receiverTeam?.assets ?? [])
          .filter((a) => !keysIntersect(keysForAsset(a), assetKeys))
          .filter((a) => !multiTeam || senderOfAsset(trade, receiver, a) === team.name)
          .map((a) => assetDisplayLabel(a));
        // Likewise, the return package is only what the giver received from
        // this receiver (Brian Thomas came to the Cake Eaters from The Lone
        // Ginger, so he is not part of the Badgers' return for Etienne).
        // Assets whose sender can't be resolved are kept so legacy data
        // doesn't lose lineage branches.
        const giverReceived = multiTeam
          ? team.assets.filter((a) => {
              const sender = senderOfAsset(trade, team.name, a);
              return sender === null || sender === receiver;
            })
          : team.assets;
        const event: TradeEvent = {
          index,
          tradeId: trade.id,
          date: trade.date,
          giver: team.name,
          receiver,
          assetKeys,
          giverReceived,
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
  return keys[0] ?? `asset:${normalizeKeyPart(asset.name)}`;
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

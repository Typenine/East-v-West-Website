import { fetchTradesAllTime, type Trade, type TradeAsset } from '@/lib/utils/trades';
import { senderOfAsset, keysForAsset, keysIntersect, normalizeKeyPart } from '@/lib/trades/asset-routing';
import { loadActiveManualTrades, type ManualTrade, type ManualTradeAsset } from '@/server/manual-trades-store';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import {
  readableAccentOnDark,
  type TradeCardAsset,
  type TradeCardModel,
  type TradeCardTeam,
  type TradeFeedPayload,
} from '@/lib/trades/trade-card-model';

/**
 * Server-side trade feed builder.
 *
 * Builds the complete all-time trade feed (Sleeper trades across every league
 * season + admin manual trades) into precomputed card view models, behind an
 * in-memory cache with stale-while-revalidate semantics. The expensive part —
 * ~76 weekly transaction fetches, the full player dump, rosters/users/drafts
 * per season — now happens at most once per TTL on the server instead of in
 * every visitor's browser.
 */

const FEED_TTL_MS = 60 * 1000;

let cache: { ts: number; trades: Trade[] } | null = null;
let inflight: Promise<Trade[]> | null = null;

/**
 * All trades (Sleeper across every season + manual), merged and sorted
 * newest-first, behind the shared SWR cache. Reused by the trade feed and
 * the trade tree builder so each consumer doesn't redo the aggregation.
 */
export async function getMergedTradesAllTime(opts?: { fresh?: boolean }): Promise<Trade[]> {
  const now = Date.now();
  if (!opts?.fresh && cache && now - cache.ts < FEED_TTL_MS) {
    return cache.trades;
  }
  if (!inflight) {
    inflight = buildMergedTrades()
      .then((trades) => {
        cache = { ts: Date.now(), trades };
        return trades;
      })
      .catch((err) => {
        // Serve stale data on upstream failure rather than blanking the feed
        if (cache) return cache.trades;
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  // Stale-while-revalidate: serve the stale payload immediately while the
  // rebuild continues in the background (unless freshness was forced).
  if (!opts?.fresh && cache) return cache.trades;
  return inflight;
}

export async function getTradeFeed(opts?: { fresh?: boolean }): Promise<TradeFeedPayload> {
  const trades = await getMergedTradesAllTime(opts);
  return {
    generatedAt: cache?.ts ?? Date.now(),
    trades: trades.map(toCardModel),
  };
}

async function buildMergedTrades(): Promise<Trade[]> {
  const [sleeperTrades, manualTrades] = await Promise.all([
    fetchTradesAllTime(),
    loadActiveManualTrades().catch(() => [] as ManualTrade[]),
  ]);

  // Merge manual trades. fetchTradesAllTime's own manual merge only works in
  // the browser (relative fetch), so the server merges from storage directly.
  const byId = new Map<string, Trade>();
  for (const t of sleeperTrades) byId.set(t.id, t);
  for (const m of manualTrades) {
    const id = m.overrideOf && typeof m.overrideOf === 'string' ? m.overrideOf : m.id;
    // When overriding a Sleeper trade, pass the original so per-team `gives`
    // attribution survives the override (manual trades don't store `gives`,
    // and without it 3+ team sender attribution degrades to inference).
    byId.set(id, manualToTrade(m, id, byId.get(id)));
  }

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function manualToTrade(m: ManualTrade, id: string, base?: Trade): Trade {
  const teams = m.teams.map((team) => ({
    name: team.name,
    assets: team.assets.map(manualAssetToTradeAsset),
  })) as Trade['teams'];
  // Inherit each team's `gives` from the overridden Sleeper trade, keeping
  // only entries that still match an asset another team receives in the
  // override. This is what keeps multi-team sender attribution correct
  // (e.g. the May 3, 2026 Badgers / Cake Eaters / Lone Ginger trade where
  // the 2026 1st came from The Lone Ginger).
  if (base) {
    for (const team of teams) {
      const baseTeam = base.teams.find((t) => normalizeKeyPart(t.name) === normalizeKeyPart(team.name));
      if (!baseTeam?.gives?.length) continue;
      const gives = baseTeam.gives.filter((g) => {
        const keys = keysForAsset(g);
        if (!keys.length) return g.type === 'faab';
        return teams.some(
          (t) => t !== team && t.assets.some((a) => keysIntersect(keysForAsset(a), keys))
        );
      });
      if (gives.length) team.gives = gives;
    }
  }
  return {
    id,
    date: m.date,
    status: m.status,
    notes: m.notes,
    season: (m.date || '').slice(0, 4) || undefined,
    week: null,
    created: null,
    teams,
  };
}

function manualAssetToTradeAsset(a: ManualTradeAsset): TradeAsset {
  if (a.type === 'player') {
    return { type: 'player', name: a.name, position: a.position, team: a.team, playerId: a.playerId };
  }
  if (a.type === 'pick') {
    return {
      type: 'pick',
      name: a.name,
      year: a.year,
      round: a.round,
      draftSlot: a.draftSlot,
      originalOwner: a.originalOwner,
      pickInRound: a.pickInRound,
      became: a.became,
      becamePosition: a.becamePosition,
      becameTeam: a.becameTeam,
      becamePlayerId: a.becamePlayerId,
    };
  }
  // 'cash' — render through the FAAB lane
  return { type: 'faab', name: a.name, faabAmount: a.amount };
}

// ---------------------------------------------------------------------------
// Card view-model mapping
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  if (!m) return isoDate || '';
  const [, y, mo, d] = m;
  const monthIdx = Number(mo) - 1;
  const month = MONTHS[monthIdx] ?? mo;
  return `${month} ${Number(d)}, ${y}`;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function toCardAsset(asset: TradeAsset, receivingTeam: string): TradeCardAsset {
  if (asset.type === 'player') {
    return {
      kind: 'player',
      badge: asset.position || 'PLR',
      label: asset.name,
      sub: asset.team && asset.team !== 'FA' ? asset.team : asset.team === 'FA' ? 'Free Agent' : undefined,
      position: asset.position,
      trackHref: asset.playerId
        ? `/trades/tracker?rootType=player&playerId=${encodeURIComponent(asset.playerId)}`
        : undefined,
    };
  }

  if (asset.type === 'pick') {
    const label = asset.year && asset.round
      ? `${asset.year} ${getOrdinal(asset.round)} Round Pick`
      : asset.name;
    const subParts: string[] = [];
    if (typeof asset.pickInRound === 'number' && asset.round) {
      subParts.push(`Pick ${asset.round}.${String(asset.pickInRound).padStart(2, '0')}`);
    }
    if (asset.became) {
      subParts.push(`Became ${asset.becamePosition ? `${asset.becamePosition} ` : ''}${asset.became}`);
    }
    const slot = asset.draftSlot ?? asset.pickInRound;
    return {
      kind: 'pick',
      badge: asset.round ? `R${asset.round}` : 'PICK',
      label,
      sub: subParts.length ? subParts.join(' · ') : undefined,
      originalOwner:
        asset.originalOwner && asset.originalOwner !== receivingTeam ? asset.originalOwner : undefined,
      round: asset.round,
      becamePosition: asset.becamePosition,
      trackHref:
        asset.year && asset.round && typeof slot === 'number'
          ? `/trades/tracker?rootType=pick&season=${asset.year}&round=${asset.round}&slot=${slot}`
          : undefined,
    };
  }

  return {
    kind: 'faab',
    badge: 'FAAB',
    label: typeof asset.faabAmount === 'number' ? `$${asset.faabAmount} FAAB` : asset.name,
  };
}

function toCardModel(trade: Trade): TradeCardModel {
  // On multi-team trades every asset gets explicit sender attribution so the
  // card reads "who sent what to where" at a glance.
  const isMultiTeam = trade.teams.length > 2;
  const teams: TradeCardTeam[] = trade.teams.map((team) => ({
    name: team.name,
    logo: getTeamLogoPath(team.name),
    accent: readableAccentOnDark(getTeamColors(team.name)),
    assets: team.assets.map((a) => {
      const card = toCardAsset(a, team.name);
      if (isMultiTeam) {
        const sender = senderOfAsset(trade, team.name, a);
        if (sender) card.fromTeam = sender;
      }
      return card;
    }),
  }));

  // Sleeper reports 'complete' at runtime; canonicalize so the UI's
  // completed/pending/vetoed handling works for both sources.
  const rawStatus = String(trade.status).toLowerCase();
  const status: TradeCardModel['status'] =
    rawStatus === 'vetoed' ? 'vetoed' : rawStatus === 'pending' ? 'pending' : 'completed';

  return {
    id: trade.id,
    date: trade.date,
    dateLabel: formatDateLabel(trade.date),
    season: trade.season,
    week: typeof trade.week === 'number' ? trade.week : null,
    status,
    teams,
  };
}

import { fetchTradesAllTime, type Trade, type TradeAsset } from '@/lib/utils/trades';
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

let cache: { ts: number; payload: TradeFeedPayload } | null = null;
let inflight: Promise<TradeFeedPayload> | null = null;

export async function getTradeFeed(opts?: { fresh?: boolean }): Promise<TradeFeedPayload> {
  const now = Date.now();
  if (!opts?.fresh && cache && now - cache.ts < FEED_TTL_MS) {
    return cache.payload;
  }
  if (!inflight) {
    inflight = buildFeed()
      .then((payload) => {
        cache = { ts: Date.now(), payload };
        return payload;
      })
      .catch((err) => {
        // Serve stale data on upstream failure rather than blanking the feed
        if (cache) return cache.payload;
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  // Stale-while-revalidate: serve the stale payload immediately while the
  // rebuild continues in the background (unless freshness was forced).
  if (!opts?.fresh && cache) return cache.payload;
  return inflight;
}

async function buildFeed(): Promise<TradeFeedPayload> {
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
    byId.set(id, manualToTrade(m, id));
  }

  const trades = Array.from(byId.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(toCardModel);

  return { generatedAt: Date.now(), trades };
}

function manualToTrade(m: ManualTrade, id: string): Trade {
  return {
    id,
    date: m.date,
    status: m.status,
    notes: m.notes,
    season: (m.date || '').slice(0, 4) || undefined,
    week: null,
    created: null,
    teams: m.teams.map((team) => ({
      name: team.name,
      assets: team.assets.map(manualAssetToTradeAsset),
    })),
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
  const teams: TradeCardTeam[] = trade.teams.map((team) => ({
    name: team.name,
    logo: getTeamLogoPath(team.name),
    accent: readableAccentOnDark(getTeamColors(team.name)),
    assets: team.assets.map((a) => toCardAsset(a, team.name)),
  }));

  return {
    id: trade.id,
    date: trade.date,
    dateLabel: formatDateLabel(trade.date),
    season: trade.season,
    week: typeof trade.week === 'number' ? trade.week : null,
    status: trade.status,
    teams,
  };
}

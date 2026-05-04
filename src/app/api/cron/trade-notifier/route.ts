/**
 * Trade Notifier Cron Endpoint
 * Polls Sleeper for new trades and posts to Discord when first observed
 *
 * Trigger: Vercel Cron every 5 minutes OR manual GET request
 *
 * Sleeper API note: public docs (docs.sleeper.com) only illustrate trades with `"status": "complete"`.
 * They do not enumerate other transaction statuses. This route logs a per-run `tradeStatusBreakdown`
 * in the JSON response so you can see which `status` values your league actually returns during
 * pending review / processing.
 *
 * Requirements:
 * - SLEEPER_LEAGUE_ID: The league to monitor
 * - DISCORD_TRADES_WEBHOOK_URL: Discord webhook for trade notifications
 * - SITE_URL: Base URL for links in embeds
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { discordNotifications } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { CURRENT_SEASON } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLEEPER_API = 'https://api.sleeper.app/v1';

/** Sleeper leaves non-final trades in the feed with status !== complete (e.g. pending review). */
const SKIP_TRADE_STATUSES = new Set([
  'failed',
  'canceled',
  'cancelled',
  'vetoed',
  'expired',
  'denied',
  'rejected',
]);

type TradeNotifType = 'trade_pending' | 'trade_complete';

interface SleeperTransaction {
  transaction_id: string;
  type: string;
  /** Sleeper usually sends "complete"; normalize at runtime (string vs rare edge cases). */
  status?: string | number | null;
  roster_ids: number[];
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: Array<{
    season: string;
    round: number;
    roster_id: number;
    previous_owner_id: number;
    owner_id: number;
  }>;
  waiver_budget?: Array<{
    sender: number;
    receiver: number;
    amount: number;
  }>;
  created: number;
  leg: number;
}

interface SleeperUser {
  user_id: string;
  display_name?: string;
  username?: string;
  metadata?: { team_name?: string };
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string;
}

interface SleeperPlayer {
  player_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  team?: string;
}

async function fetchSleeperState(): Promise<{ season: string; week: number; leg: number }> {
  const res = await fetch(`${SLEEPER_API}/state/nfl`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sleeper state error: ${res.status}`);
  const data = await res.json();
  return { season: data.season, week: data.week || 1, leg: data.leg || data.week || 1 };
}

async function fetchTransactions(leagueId: string, leg: number): Promise<SleeperTransaction[]> {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/transactions/${leg}`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchAllTransactionLegs(leagueId: string): Promise<SleeperTransaction[]> {
  const legs = Array.from({ length: 19 }, (_, i) => i); // 0..18 (offseason + regular weeks)
  const byLeg = await Promise.all(legs.map((leg) => fetchTransactions(leagueId, leg).catch(() => [])));
  return byLeg.flat();
}

async function fetchUsers(leagueId: string): Promise<SleeperUser[]> {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/users`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchRosters(leagueId: string): Promise<SleeperRoster[]> {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/rosters`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchPlayers(): Promise<Record<string, SleeperPlayer>> {
  const res = await fetch(`${SLEEPER_API}/players/nfl`, { cache: 'no-store' });
  if (!res.ok) return {};
  return res.json();
}

function buildRosterNameMap(users: SleeperUser[], rosters: SleeperRoster[]): Map<number, string> {
  const userNameById = new Map<string, string>();
  for (const u of users) {
    const name = u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`;
    userNameById.set(u.user_id, name);
  }
  const rosterNameMap = new Map<number, string>();
  for (const r of rosters) {
    rosterNameMap.set(r.roster_id, userNameById.get(r.owner_id) || `Roster ${r.roster_id}`);
  }
  return rosterNameMap;
}

function formatPlayerName(playerId: string, players: Record<string, SleeperPlayer>): string {
  const p = players[playerId];
  if (!p) return `Unknown Player`;
  const name = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown';
  const pos = p.position || '';
  const team = p.team || 'FA';
  return `${name} (${pos}, ${team})`;
}

function formatDraftPick(pick: NonNullable<SleeperTransaction['draft_picks']>[0]): string {
  const round = pick.round;
  const suffix = round === 1 ? 'st' : round === 2 ? 'nd' : round === 3 ? 'rd' : 'th';
  return `${pick.season} ${round}${suffix} Round Pick`;
}

function normalizeSleeperTxnStatus(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase();
}

/** Treat as finalized trade (full compensation post). */
function isCompleteTradeStatus(s: string): boolean {
  return s === 'complete' || s === 'completed';
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function formatOxford(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function firstAddPlayerLabel(
  adds: Record<string, number> | undefined,
  players: Record<string, SleeperPlayer>
): string | null {
  if (!adds) return null;
  const pid = Object.keys(adds)[0];
  if (!pid) return null;
  const p = players[pid];
  if (!p) return null;
  return p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || null;
}

function buildPendingRumorEmbed(
  trade: SleeperTransaction,
  players: Record<string, SleeperPlayer>,
  rosterNameMap: Map<number, string>,
  siteUrl: string
): Record<string, unknown> {
  const teamNames = [...trade.roster_ids]
    .sort((a, b) => a - b)
    .map((id) => rosterNameMap.get(id) || `Roster ${id}`);
  const teamsOxford = formatOxford(teamNames);
  const h = hashString(trade.transaction_id);
  const titlePool = [
    'Sources: Active discussions',
    "I'm told talks are real",
    'Monitoring trade chatter',
    'Buzz: framework in the works',
    'League notes: deal picking up steam',
  ];
  const title = titlePool[h % titlePool.length];
  const playerHint = firstAddPlayerLabel(trade.adds, players);

  let description: string;
  if (playerHint && teamNames.length >= 2) {
    const bodies = [
      `**Sources:** **${playerHint}** is a name to watch — **${teamsOxford}** have been in discussions on a potential move. Nothing finalized; still working through it.`,
      `I'm told **${teamsOxford}** have been discussing a framework that includes **${playerHint}** among the pieces. Fluid — not official until it hits the transaction log.`,
      `Hearing there's traction on a deal involving **${playerHint}** with **${teamsOxford}** in the mix. Conversations ongoing per sources — could pick up quickly, could stall.`,
      `**Sources:** **${teamsOxford}** are in advanced talks and **${playerHint}**'s name has come up. No paperwork yet — treat as **developing**.`,
    ];
    description = bodies[h % bodies.length];
  } else {
    const bodies = [
      `**Sources:** **${teamsOxford}** are deep in talks on a multi-party framework. If it clears, compensation will post once it's official on the wire.`,
      `I'm told **${teamsOxford}** are getting close on something. Still **pending** — league hasn't filed it to the transaction log yet.`,
      `Monitoring: **${teamsOxford}** have been engaged in serious discussions. Nothing done until it's processed — but the chatter is loud enough to flag.`,
      `Hearing **${teamsOxford}** are working through the final hurdles. **Developing** — more when (if) it becomes official.`,
    ];
    description = bodies[h % bodies.length];
  }

  const tradeDate = new Date(trade.created);
  return {
    title,
    description,
    color: 0x5865f2,
    timestamp: tradeDate.toISOString(),
    footer: {
      text: `Week ${trade.leg} · Developing · Not on transaction log yet`,
    },
    url: `${siteUrl}/transactions`,
  };
}

function buildTeamAssetDetails(
  trade: SleeperTransaction,
  players: Record<string, SleeperPlayer>,
  rosterNameMap: Map<number, string>
): Record<number, { gets: string[]; gives: string[] }> {
  const teamDetails: Record<number, { gets: string[]; gives: string[] }> = {};
  for (const rosterId of trade.roster_ids) {
    teamDetails[rosterId] = { gets: [], gives: [] };
  }

  if (trade.adds) {
    for (const [playerId, rosterIdVal] of Object.entries(trade.adds)) {
      const rosterId = rosterIdVal as number;
      const playerName = formatPlayerName(playerId, players);
      if (teamDetails[rosterId]) {
        teamDetails[rosterId].gets.push(playerName);
      }
    }
  }
  if (trade.drops) {
    for (const [playerId, rosterIdVal] of Object.entries(trade.drops)) {
      const rosterId = rosterIdVal as number;
      const playerName = formatPlayerName(playerId, players);
      if (teamDetails[rosterId]) {
        teamDetails[rosterId].gives.push(playerName);
      }
    }
  }

  if (trade.draft_picks) {
    for (const pick of trade.draft_picks) {
      const pickStr = formatDraftPick(pick);
      if (teamDetails[pick.owner_id]) {
        teamDetails[pick.owner_id].gets.push(pickStr);
      }
      if (teamDetails[pick.previous_owner_id]) {
        teamDetails[pick.previous_owner_id].gives.push(pickStr);
      }
    }
  }

  if (trade.waiver_budget && trade.waiver_budget.length > 0) {
    for (const row of trade.waiver_budget) {
      const senderName = rosterNameMap.get(row.sender) || `Roster ${row.sender}`;
      const receiverName = rosterNameMap.get(row.receiver) || `Roster ${row.receiver}`;
      const amt = row.amount;
      if (teamDetails[row.sender]) {
        teamDetails[row.sender].gives.push(`$${amt} FAAB → ${receiverName}`);
      }
      if (teamDetails[row.receiver]) {
        teamDetails[row.receiver].gets.push(`$${amt} FAAB from ${senderName}`);
      }
    }
  }

  return teamDetails;
}

function buildCompleteTradeEmbed(
  trade: SleeperTransaction,
  teamDetails: Record<number, { gets: string[]; gives: string[] }>,
  rosterNameMap: Map<number, string>,
  siteUrl: string,
  opts?: { priorRumorJumpUrl?: string | null }
): Record<string, unknown> {
  const sortedRosterIds = Object.keys(teamDetails)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b);
  const teamNames = sortedRosterIds.map((id) => rosterNameMap.get(id) || `Roster ${id}`);
  const h = hashString(trade.transaction_id);
  const jump = opts?.priorRumorJumpUrl?.trim();
  const followLead = jump
    ? `**Update:** Following [the earlier report](${jump}), this is now **official** on the league transaction log.\n\n`
    : '';

  let title: string;
  let description: string;
  if (teamNames.length === 2) {
    title = 'TRADE';
    const intros = [
      `${followLead}**${teamNames[0]}** and **${teamNames[1]}** have agreed to a trade. **Filed** — full compensation below.`,
      `${followLead}Trade is **in**: **${teamNames[0]}** and **${teamNames[1]}**. Here's the compensation as it posted.`,
    ];
    description = intros[h % intros.length];
  } else if (teamNames.length >= 3) {
    const ox = formatOxford(teamNames);
    title = teamNames.length === 3 ? 'THREE-TEAM TRADE' : 'MULTI-TEAM TRADE';
    const intros = [
      `${followLead}**Sources:** **${ox}** are part of a larger swap now **complete** on the wire. Compensation update:`,
      `${followLead}Bigger deal **filed**: **${ox}**. Full trade breakdown below.`,
    ];
    description = intros[h % intros.length];
  } else {
    title = 'TRADE';
    description = `${followLead}Deal is **complete** on the league transaction log. Compensation update below.`;
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  for (const rosterId of sortedRosterIds) {
    const details = teamDetails[rosterId];
    const teamName = rosterNameMap.get(rosterId) || `Roster ${rosterId}`;
    const gets = details.gets.length > 0 ? details.gets.join('\n') : '—';
    const gives = details.gives.length > 0 ? details.gives.join('\n') : '—';
    fields.push({
      name: `${teamName} · acquires`,
      value: gets,
      inline: true,
    });
    fields.push({
      name: `${teamName} · sends`,
      value: gives,
      inline: true,
    });
    fields.push({ name: '\u200B', value: '\u200B', inline: true });
  }

  const tradeDate = new Date(trade.created);
  return {
    title,
    description,
    color: 0x1d9bf0,
    fields,
    timestamp: tradeDate.toISOString(),
    footer: {
      text: `Week ${trade.leg} · Per league transaction log`,
    },
    url: `${siteUrl}/transactions`,
  };
}

function webhookExecuteUrlWithWait(webhookUrl: string): string {
  const trimmed = webhookUrl.trim();
  try {
    const u = new URL(trimmed);
    u.searchParams.set('wait', 'true');
    return u.toString();
  } catch {
    return trimmed.includes('?') ? `${trimmed}&wait=true` : `${trimmed}?wait=true`;
  }
}

type DiscordWebhookPostResult = {
  ok: boolean;
  messageId?: string;
  channelId?: string;
  guildId?: string;
};

function discordSnowflakeString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string' && v.length > 0) return v;
  // Prefer string from Discord API; numeric snowflakes can lose precision in JS.
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  return undefined;
}

function parseDiscordMessageIds(body: unknown): Pick<DiscordWebhookPostResult, 'messageId' | 'channelId' | 'guildId'> {
  if (!body || typeof body !== 'object') return {};
  const o = body as Record<string, unknown>;
  return {
    messageId: discordSnowflakeString(o.id),
    channelId: discordSnowflakeString(o.channel_id),
    guildId: discordSnowflakeString(o.guild_id),
  };
}

function discordJumpUrl(guildId: string | undefined, channelId: string | undefined, messageId: string | undefined): string | null {
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/**
 * Posts to Discord. Completed-trade posts omit `wait` (Discord returns 204 + empty body — same as pre-change behavior).
 * Pending rumors use `wait=true` so we can capture message IDs for the follow-up jump link.
 */
async function postDiscordWebhookPayload(
  webhookUrl: string,
  payload: Record<string, unknown>,
  opts?: { waitForMessageBody?: boolean }
): Promise<DiscordWebhookPostResult> {
  const waitForMessageBody = opts?.waitForMessageBody === true;
  const url = waitForMessageBody ? webhookExecuteUrlWithWait(webhookUrl) : webhookUrl.trim();

  const doFetch = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  try {
    const res = await doFetch();

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = data.retry_after || 5;
      console.log(`[TradeNotifier] Rate limited, waiting ${retryAfter}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      const retry = await doFetch();
      if (!retry.ok) {
        const t = await retry.text().catch(() => '');
        console.error('[TradeNotifier] Discord retry failed:', retry.status, t);
        return { ok: false };
      }
      if (!waitForMessageBody || retry.status === 204) {
        return { ok: true };
      }
      const retryJson = await retry.json().catch(() => null);
      return { ok: true, ...parseDiscordMessageIds(retryJson) };
    }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[TradeNotifier] Discord post failed:', res.status, t);
      return { ok: false };
    }

    // Default webhook execute (no wait): 204 No Content — do not call res.json().
    if (!waitForMessageBody || res.status === 204) {
      return { ok: true };
    }

    const json = await res.json().catch(() => null);
    return { ok: true, ...parseDiscordMessageIds(json) };
  } catch (err) {
    console.error('[TradeNotifier] Discord post failed:', err);
    return { ok: false };
  }
}

async function checkAlreadyPosted(
  db: ReturnType<typeof getDb>,
  transactionId: string,
  type: TradeNotifType
): Promise<boolean> {
  try {
    const existing = await db
      .select()
      .from(discordNotifications)
      .where(and(eq(discordNotifications.notificationType, type), eq(discordNotifications.dedupeKey, transactionId)))
      .limit(1);
    return existing.length > 0;
  } catch {
    return false;
  }
}

async function markAsPosted(
  db: ReturnType<typeof getDb>,
  transactionId: string,
  type: TradeNotifType,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(discordNotifications).values({
      notificationType: type,
      dedupeKey: transactionId,
      meta,
    });
  } catch (err) {
    console.error('[TradeNotifier] Failed to mark as posted:', err);
  }
}

async function getPendingRumorJumpUrl(db: ReturnType<typeof getDb>, transactionId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ meta: discordNotifications.meta })
      .from(discordNotifications)
      .where(
        and(eq(discordNotifications.notificationType, 'trade_pending'), eq(discordNotifications.dedupeKey, transactionId))
      )
      .limit(1);
    const meta = rows[0]?.meta;
    if (!meta || typeof meta !== 'object') return null;
    const j = (meta as Record<string, unknown>).discordRumorJumpUrl;
    return typeof j === 'string' && j.length > 0 ? j : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const seasonScopedLeagueId = process.env[`SLEEPER_LEAGUE_ID_${CURRENT_SEASON}`];
  const leagueId = process.env.SLEEPER_LEAGUE_ID || seasonScopedLeagueId;
  const webhookUrl = process.env.DISCORD_TRADES_WEBHOOK_URL;
  const siteUrl = process.env.SITE_URL || 'https://eastvswest.football';

  if (!leagueId) {
    return NextResponse.json({ error: 'SLEEPER_LEAGUE_ID not configured' }, { status: 500 });
  }

  if (!webhookUrl) {
    return NextResponse.json({ error: 'DISCORD_TRADES_WEBHOOK_URL not configured' }, { status: 500 });
  }

  try {
    const db = getDb();
    const state = await fetchSleeperState();

    const [allTxnsRaw, users, rosters, players] = await Promise.all([
      fetchAllTransactionLegs(leagueId),
      fetchUsers(leagueId),
      fetchRosters(leagueId),
      fetchPlayers(),
    ]);

    // Deduplicate by transaction id in case Sleeper surfaces overlap across legs.
    const txById = new Map<string, SleeperTransaction>();
    for (const tx of allTxnsRaw) {
      if (!tx || !tx.transaction_id) continue;
      txById.set(String(tx.transaction_id), tx);
    }
    const allTxns = Array.from(txById.values());
    const trades = allTxns.filter((t) => t.type === 'trade');

    const tradeStatusBreakdown: Record<string, number> = {};
    for (const t of trades) {
      const key = normalizeSleeperTxnStatus(t.status) || 'unknown';
      tradeStatusBreakdown[key] = (tradeStatusBreakdown[key] ?? 0) + 1;
    }

    if (trades.length === 0) {
      return NextResponse.json({
        message: 'No trades found',
        checked: allTxns.length,
        tradeStatusBreakdown: {},
        sleeperDocsNote:
          'Sleeper public API docs only show trade status "complete" in examples; use tradeStatusBreakdown when trades exist to see live values.',
      });
    }

    const rosterNameMap = buildRosterNameMap(users, rosters);
    const posted: string[] = [];
    const skipped: string[] = [];

    for (const trade of trades) {
      const txnId = String(trade.transaction_id);
      const statusNorm = normalizeSleeperTxnStatus(trade.status);

      if (SKIP_TRADE_STATUSES.has(statusNorm)) {
        skipped.push(txnId);
        continue;
      }

      const isComplete = isCompleteTradeStatus(statusNorm);

      if (isComplete) {
        const alreadyPosted = await checkAlreadyPosted(db, txnId, 'trade_complete');
        if (alreadyPosted) {
          skipped.push(txnId);
          continue;
        }
        const priorJump = await getPendingRumorJumpUrl(db, txnId);
        const teamDetails = buildTeamAssetDetails(trade, players, rosterNameMap);
        const embed = buildCompleteTradeEmbed(trade, teamDetails, rosterNameMap, siteUrl, {
          priorRumorJumpUrl: priorJump,
        });
        const postResult = await postDiscordWebhookPayload(
          webhookUrl,
          {
            embeds: [embed],
            allowed_mentions: { parse: [] },
          },
          { waitForMessageBody: false }
        );
        if (postResult.ok) {
          await markAsPosted(db, txnId, 'trade_complete', {
            roster_ids: trade.roster_ids,
            leg: trade.leg,
            status: trade.status,
            hadPriorRumorJumpUrl: !!priorJump,
          });
          posted.push(txnId);
          console.log(`[TradeNotifier] Posted trade_complete for ${txnId}`);
        } else {
          console.error(`[TradeNotifier] Failed to post trade_complete for ${txnId}`);
        }
        continue;
      }

      // Non-final trade: one-time "rumor" ping (no full compensation sheet).
      const pendingPosted = await checkAlreadyPosted(db, txnId, 'trade_pending');
      if (pendingPosted) {
        skipped.push(txnId);
        continue;
      }

      const embed = buildPendingRumorEmbed(trade, players, rosterNameMap, siteUrl);
      const postResult = await postDiscordWebhookPayload(
        webhookUrl,
        {
          embeds: [embed],
          allowed_mentions: { parse: [] },
        },
        { waitForMessageBody: true }
      );
      if (postResult.ok) {
        const jump = discordJumpUrl(postResult.guildId, postResult.channelId, postResult.messageId);
        await markAsPosted(db, txnId, 'trade_pending', {
          roster_ids: trade.roster_ids,
          leg: trade.leg,
          status: trade.status,
          discordMessageId: postResult.messageId,
          discordChannelId: postResult.channelId,
          discordGuildId: postResult.guildId,
          ...(jump ? { discordRumorJumpUrl: jump } : {}),
        });
        posted.push(`${txnId}:pending`);
        console.log(`[TradeNotifier] Posted trade_pending for ${txnId} (status=${trade.status})`);
      } else {
        console.error(`[TradeNotifier] Failed to post trade_pending for ${txnId}`);
      }
    }

    return NextResponse.json({
      message: 'Trade check complete',
      nflLeg: state.leg,
      trades: trades.length,
      posted: posted.length,
      skipped: skipped.length,
      postedIds: posted,
      tradeStatusBreakdown,
      sleeperDocsNote:
        'Sleeper public API docs only show trade status "complete" in examples; tradeStatusBreakdown reflects what this league returned this run.',
    });
  } catch (err) {
    console.error('[TradeNotifier] Error:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}

/**
 * Trade Notifier Cron Endpoint
 * Polls Sleeper for new trades and posts to Discord when first observed
 * 
 * Trigger: Vercel Cron every 5 minutes OR manual GET request
 * 
 * Requirements:
 * - SLEEPER_LEAGUE_ID: The league to monitor
 * - DISCORD_TRADES_WEBHOOK_URL: Discord webhook for trade notifications
 * - SITE_URL: Base URL for links in embeds
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { discordNotifications } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLEEPER_API = 'https://api.sleeper.app/v1';

interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
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

async function postToDiscord(webhookUrl: string, embed: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
    });
    
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = data.retry_after || 5;
      console.log(`[TradeNotifier] Rate limited, waiting ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      // Retry once
      const retry = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [embed],
          allowed_mentions: { parse: [] },
        }),
      });
      return retry.ok;
    }
    
    return res.ok;
  } catch (err) {
    console.error('[TradeNotifier] Discord post failed:', err);
    return false;
  }
}

async function checkAlreadyPosted(db: ReturnType<typeof getDb>, transactionId: string, type: 'trade_accepted' | 'trade_complete'): Promise<boolean> {
  try {
    const existing = await db
      .select()
      .from(discordNotifications)
      .where(and(
        eq(discordNotifications.notificationType, type),
        eq(discordNotifications.dedupeKey, transactionId)
      ))
      .limit(1);
    return existing.length > 0;
  } catch {
    // Table might not exist yet - treat as not posted
    return false;
  }
}

async function markAsPosted(db: ReturnType<typeof getDb>, transactionId: string, type: 'trade_accepted' | 'trade_complete', meta: Record<string, unknown>): Promise<void> {
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

export async function GET() {
  const leagueId = process.env.SLEEPER_LEAGUE_ID;
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
    
    // Fetch transactions from current leg and previous leg (to catch week transitions)
    const [currentTxns, prevTxns, users, rosters, players] = await Promise.all([
      fetchTransactions(leagueId, state.leg),
      state.leg > 1 ? fetchTransactions(leagueId, state.leg - 1) : Promise.resolve([]),
      fetchUsers(leagueId),
      fetchRosters(leagueId),
      fetchPlayers(),
    ]);
    
    const allTxns = [...currentTxns, ...prevTxns];
    const trades = allTxns.filter(t => t.type === 'trade');
    
    if (trades.length === 0) {
      return NextResponse.json({ message: 'No trades found', checked: allTxns.length });
    }
    
    const rosterNameMap = buildRosterNameMap(users, rosters);
    const posted: string[] = [];
    const skipped: string[] = [];
    
    for (const trade of trades) {
      const txnId = trade.transaction_id;
      const isComplete = trade.status === 'complete';
      const notifType = isComplete ? 'trade_complete' : 'trade_accepted';
      
      // Check if already posted
      const alreadyPosted = await checkAlreadyPosted(db, txnId, notifType);
      if (alreadyPosted) {
        skipped.push(txnId);
        continue;
      }
      
      // Build trade details by team
      const teamDetails: Record<number, { gets: string[]; gives: string[] }> = {};
      for (const rosterId of trade.roster_ids) {
        teamDetails[rosterId] = { gets: [], gives: [] };
      }
      
      // Process player adds/drops
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
      
      // Process draft picks
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
      
      // Build embed fields
      const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
      for (const [rosterIdStr, details] of Object.entries(teamDetails)) {
        const rosterId = parseInt(rosterIdStr, 10);
        const teamName = rosterNameMap.get(rosterId) || `Roster ${rosterId}`;
        const gets = details.gets.length > 0 ? details.gets.join('\n') : 'Nothing';
        const gives = details.gives.length > 0 ? details.gives.join('\n') : 'Nothing';
        fields.push({
          name: `📥 ${teamName} receives`,
          value: gets,
          inline: true,
        });
        fields.push({
          name: `📤 ${teamName} sends`,
          value: gives,
          inline: true,
        });
        // Add spacer for layout
        fields.push({ name: '\u200B', value: '\u200B', inline: true });
      }
      
      const tradeDate = new Date(trade.created);
      const embed = {
        title: isComplete ? '✅ Trade Completed' : '🔔 Trade Accepted',
        description: `A trade has been ${isComplete ? 'completed' : 'accepted'} in the league!`,
        color: isComplete ? 0x00ff00 : 0xffaa00,
        fields,
        timestamp: tradeDate.toISOString(),
        footer: {
          text: `Week ${trade.leg} • View all trades`,
        },
        url: `${siteUrl}/transactions`,
      };
      
      const success = await postToDiscord(webhookUrl, embed);
      if (success) {
        await markAsPosted(db, txnId, notifType, {
          roster_ids: trade.roster_ids,
          leg: trade.leg,
          status: trade.status,
        });
        posted.push(txnId);
        console.log(`[TradeNotifier] Posted ${notifType} for ${txnId}`);
      } else {
        console.error(`[TradeNotifier] Failed to post ${notifType} for ${txnId}`);
      }
    }
    
    return NextResponse.json({
      message: 'Trade check complete',
      trades: trades.length,
      posted: posted.length,
      skipped: skipped.length,
      postedIds: posted,
    });
    
  } catch (err) {
    console.error('[TradeNotifier] Error:', err);
    return NextResponse.json({ error: 'Internal error', details: String(err) }, { status: 500 });
  }
}

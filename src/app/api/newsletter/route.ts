/**
 * Newsletter API Route
 * Handles newsletter generation and retrieval with database persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLeagueIdForSeason, CHAMPIONS } from '@/lib/constants/league';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import { clearSeasonOutputLog } from '@/lib/newsletter/memory';
import { applyBotBrainOverride, type BotBrainOverride } from '@/lib/newsletter/bot-brain';
import { setTeamCardOverride } from '@/lib/newsletter/team-narratives';
import { setRuntimeBannedPhrases } from '@/lib/newsletter/guardrails';
import {
  generateNewsletter,
  buildH2HContext,
  buildTradeContext,
  calculatePlayoffImplications,
  checkForRecords,
  buildEnhancedContextString,
  fetchComprehensiveLeagueData,
  buildComprehensiveContextString,
  fetchCurrentWeekContext,
  buildCurrentStandingsContext,
  buildTransactionsContext,
  getLeagueRulesContext,
  setPlayerNameCache,
  scanForUnresolvedPlayerIds,
  fetchAllExternalData,
  buildExternalDataContext,
  loadDynastyRankings,
  buildDynastyOverviewContext,
  type DynastyRankingsEntry,
  type EnhancedContextData,
  type LeagueRecords,
} from '@/lib/newsletter';
import { getAllPlayersCached, getSleeperInjuriesCached, getTeamsData, getRegularSeasonRecords, getLeagueDrafts, getDraftPicks, getLeagueUsers, getLeagueRosters, getSeasonAwardsUsingLeagueScoring } from '@/lib/utils/sleeper-api';
import {
  loadBotMemory,
  saveBotMemory,
  loadForecastRecords,
  saveForecastRecords,
  loadPendingPicks,
  savePendingPicks,
  loadNewsletter,
  saveNewsletter,
  listNewsletterWeeks,
  deleteNewsletter,
  loadPreviousNewsletter,
  extractPredictionsFromNewsletter,
  updateStagedNewsletter,
  loadRelationshipMemory,
  saveRelationshipMemory,
} from '@/server/db/newsletter-queries';
import { getActiveOrLatestDraftId, countDraftPlayers, getDraftPlayers, getDraftRound1Slots, getDraftRound2Slots, getDraftSlotsDetailed, getDraftPickTradeHistory } from '@/server/db/queries';
import { fetchNewsletterData } from '@/lib/newsletter';
import { buildPickOwnershipContext, enrichDerivedTradePickLabels, buildLeagueRosterContext } from '@/lib/newsletter/pick-ownership-context';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';
import { fetchTradesAllTime } from '@/lib/utils/trades';
import { postToDiscordWebhook, buildNewsletterEmbed } from '@/lib/utils/discord';
import { getDb } from '@/server/db/client';
import type { BotSettingsRow } from '@/server/db/personality-queries';
import { discordNotifications } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel hobby plan max (5 min)

// ============ Sleeper API Helpers ============

const SLEEPER_API = 'https://api.sleeper.app/v1';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}

async function getSleeperState(): Promise<{ season: string; week: number; season_type: string }> {
  return fetchJson(`${SLEEPER_API}/state/nfl`);
}

async function getLeague(leagueId: string): Promise<{ name: string }> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}`);
}

async function getUsers(leagueId: string): Promise<Array<{
  user_id: string;
  display_name?: string;
  username?: string;
  metadata?: { team_name?: string };
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/users`);
}

async function getRosters(leagueId: string): Promise<Array<{
  roster_id: number;
  owner_id: string;
  players?: string[];
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/rosters`);
}

async function getMatchups(leagueId: string, week: number): Promise<Array<{
  roster_id: number;
  matchup_id: number | null;
  points?: number;
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/matchups/${week}`);
}

async function getTransactions(leagueId: string, week: number): Promise<Array<{
  transaction_id?: string;
  type: 'trade' | 'waiver' | 'free_agent';
  leg?: number;
  roster_ids?: number[];
  roster_id?: number;
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: unknown[];
  waiver_bid?: number;
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/transactions/${week}`);
}

// Extended roster type for standings
interface ExtendedRoster {
  roster_id: number;
  owner_id: string;
  players?: string[];
  settings?: {
    wins?: number;
    losses?: number;
    fpts?: number;
    fpts_decimal?: number;
  };
  metadata?: {
    division?: string;
  };
}

async function getExtendedRosters(leagueId: string): Promise<ExtendedRoster[]> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/rosters`);
}

// NFL bye weeks by week number (2025 season - update annually)
const NFL_BYE_WEEKS: Record<number, string[]> = {
  5: ['DET', 'LAC'],
  6: ['KC', 'LAR', 'MIA', 'MIN'],
  7: ['CHI', 'DAL'],
  8: [],
  9: ['CLE', 'GB', 'LV', 'SEA'],
  10: ['ARI', 'CAR', 'NYG', 'TB'],
  11: ['ATL', 'IND', 'NE', 'NO'],
  12: ['BAL', 'CIN', 'JAX', 'NYJ'],
  13: ['BUF', 'PIT', 'SF', 'WAS'],
  14: ['DEN', 'HOU', 'PHI', 'TEN'],
};

function getByeTeamsForWeek(week: number): string[] {
  return NFL_BYE_WEEKS[week] || [];
}

function toBotBrainOverride(settings: BotSettingsRow): BotBrainOverride {
  const override: BotBrainOverride = {};

  if (settings.displayName) {
    override.displayName = settings.displayName;
  }

  if (settings.roleDescription) {
    override.role = settings.roleDescription;
  }

  if (settings.voiceConfig) {
    override.voice = settings.voiceConfig;
  }

  if (settings.signaturePhrases?.openers?.length) {
    override.openers = settings.signaturePhrases.openers;
  }

  if (settings.signaturePhrases?.closers?.length) {
    override.closers = settings.signaturePhrases.closers;
  }

  if (settings.signaturePhrases?.verbalTics?.length) {
    override.verbalTics = settings.signaturePhrases.verbalTics;
  }

  if (settings.safetyBoundaries?.length) {
    override.safetyBoundaries = settings.safetyBoundaries;
  }

  return override;
}

// Build enhanced context for LLM - integrates all 8 improvements
async function buildEnhancedContextFull(
  leagueId: string,
  week: number,
  season: number,
  users: Array<{ user_id: string; display_name?: string; username?: string; metadata?: { team_name?: string } }>,
  matchups: Array<{ roster_id: number; matchup_id: number | null; points?: number }>,
): Promise<{
  standings?: Array<{ name: string; wins: number; losses: number; pointsFor: number }>;
  byeTeams?: string[];
  enhancedContextString?: string;
  // For LLM features
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  injuries?: Array<{ playerId: string; playerName: string; team: string; status: string }>;
}> {
  try {
    const extendedRosters = await getExtendedRosters(leagueId);
    
    // Build user map (roster_id -> team name)
    const userMap = new Map<string, string>();
    const rosterToTeam = new Map<number, string>();
    for (const u of users) {
      const name = u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`;
      userMap.set(u.user_id, name);
    }
    for (const r of extendedRosters) {
      const name = userMap.get(r.owner_id) || `Roster ${r.roster_id}`;
      rosterToTeam.set(r.roster_id, name);
    }

    // Build standings (no divisions in this league)
    const standings = extendedRosters.map(r => {
      const name = userMap.get(r.owner_id) || `Roster ${r.roster_id}`;
      const wins = r.settings?.wins || 0;
      const losses = r.settings?.losses || 0;
      const fpts = (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100;
      return { name, wins, losses, pointsFor: fpts };
    });

    const byeTeams = getByeTeamsForWeek(week);

    // ============ IMPROVEMENT 2: H2H Data Integration ============
    let h2hContext: { notableH2H: string[] } = { notableH2H: [] };
    const h2hDataSimplified: Record<string, Record<string, { wins: number; losses: number }>> = {};
    try {
      const h2hData = await getHeadToHeadAllTime();
      // Build this week's matchups for H2H lookup
      const matchupPairs: Array<{ team1: string; team2: string }> = [];
      const matchupGroups = new Map<number, string[]>();
      for (const m of matchups) {
        if (m.matchup_id === null) continue;
        const team = rosterToTeam.get(m.roster_id) || `Roster ${m.roster_id}`;
        const group = matchupGroups.get(m.matchup_id) || [];
        group.push(team);
        matchupGroups.set(m.matchup_id, group);
      }
      for (const [, teams] of matchupGroups) {
        if (teams.length === 2) {
          matchupPairs.push({ team1: teams[0], team2: teams[1] });
        }
      }
      
      // Convert H2H data format
      const h2hFormatted: Record<string, Record<string, { meetings: number; wins: { total: number; playoffs: number }; losses: { total: number }; lastMeeting?: { year: string; week: number } }>> = {};
      for (const team1 of h2hData.teams) {
        h2hFormatted[team1] = {};
        h2hDataSimplified[team1] = {};
        for (const team2 of h2hData.teams) {
          if (team1 === team2) continue;
          const cell = h2hData.matrix[team1]?.[team2];
          if (cell) {
            h2hFormatted[team1][team2] = {
              meetings: cell.meetings,
              wins: { total: cell.wins.total, playoffs: cell.wins.playoffs },
              losses: { total: cell.losses.total },
              lastMeeting: cell.lastMeeting,
            };
            // Simplified format for LLM features
            h2hDataSimplified[team1][team2] = {
              wins: cell.wins.total,
              losses: cell.losses.total,
            };
          }
        }
      }
      h2hContext = buildH2HContext(h2hFormatted, matchupPairs);
    } catch (e) {
      console.warn('Failed to fetch H2H data:', e);
    }

    // ============ IMPROVEMENT 3: Trade History Context ============
    let tradeContext: ReturnType<typeof buildTradeContext> = {
      recentTrades: [],
      buyerTeams: [],
      sellerTeams: [],
      mostActiveTrader: null,
      biggestTrade: null,
    };
    try {
      const allTrades = await fetchTradesAllTime();
      // Filter to current season and format for buildTradeContext
      const seasonTrades = allTrades
        .filter(t => t.date && new Date(t.date).getFullYear() === season)
        .map(t => ({
          id: t.id,
          date: t.date,
          week: t.week ?? undefined,
          teams: t.teams.map(tm => ({
            name: tm.name,
            assets: {
              gets: (tm.gets ?? tm.assets).map(a => a.name),
              gives: (tm.gives ?? []).map(a => a.name),
            },
          })),
        }));
      tradeContext = buildTradeContext(seasonTrades, week);
    } catch (e) {
      console.warn('Failed to fetch trade data:', e);
    }

    // ============ IMPROVEMENT 4: Weekly High Scores / Records ============
    let recordsContext: LeagueRecords = {
      highestWeeklyScore: null,
      lowestWinningScore: null,
      biggestBlowout: null,
      closestGame: null,
      longestWinStreak: null,
      currentWeekNotable: [],
    };
    try {
      // Build this week's results for record checking
      const thisWeekResults: Array<{ team: string; points: number; opponent: string; opponentPoints: number }> = [];
      const matchupGroups = new Map<number, Array<{ team: string; points: number }>>();
      for (const m of matchups) {
        if (m.matchup_id === null) continue;
        const team = rosterToTeam.get(m.roster_id) || `Roster ${m.roster_id}`;
        const group = matchupGroups.get(m.matchup_id) || [];
        group.push({ team, points: m.points || 0 });
        matchupGroups.set(m.matchup_id, group);
      }
      for (const [, teams] of matchupGroups) {
        if (teams.length === 2) {
          thisWeekResults.push({
            team: teams[0].team,
            points: teams[0].points,
            opponent: teams[1].team,
            opponentPoints: teams[1].points,
          });
        }
      }
      const { updatedRecords } = checkForRecords(thisWeekResults, recordsContext, week, season);
      recordsContext = updatedRecords;
    } catch (e) {
      console.warn('Failed to check records:', e);
    }

    // ============ IMPROVEMENT 5: Playoff Implications ============
    let playoffImplications: ReturnType<typeof calculatePlayoffImplications> = null;
    try {
      // Convert standings format for playoff implications (name -> team)
      const standingsForPlayoffs = standings.map(s => ({ team: s.name, wins: s.wins, losses: s.losses, pointsFor: s.pointsFor }));
      playoffImplications = calculatePlayoffImplications(standingsForPlayoffs, week, 7, 14);
    } catch (e) {
      console.warn('Failed to calculate playoff implications:', e);
    }

    // ============ Build the enhanced context string ============
    const enhancedData: EnhancedContextData = {
      week,
      season,
      entertainerMemory: null, // Will be loaded separately
      analystMemory: null,
      h2hForThisWeek: [],
      notableH2H: h2hContext.notableH2H,
      tradeContext,
      leagueRecords: recordsContext,
      playoffImplications,
      activeDisagreements: [],
      recentResolutions: [],
      predictionRecords: {
        entertainer: { correct: 0, wrong: 0, rate: 0 },
        analyst: { correct: 0, wrong: 0, rate: 0 },
      },
      breakoutPerformances: [], // Would need player stats
      injuryImpacts: [],
      predictionsToGrade: [],
      hotTakesToRevisit: [],
    };

    const enhancedContextString = buildEnhancedContextString(enhancedData);

    return { standings, byeTeams, enhancedContextString, h2hData: h2hDataSimplified };
  } catch (error) {
    console.error('Failed to build enhanced context:', error);
    return {};
  }
}

// ============ Build Historical Context for Preseason ============

async function buildPreseasonHistoricalContext(
  currentSeason: number,
  users: Array<{ user_id: string; display_name?: string; username?: string; metadata?: { team_name?: string } }>
): Promise<string> {
  try {
    // Build user map for team names
    const userMap = new Map<string, string>();
    for (const u of users) {
      const name = u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`;
      userMap.set(u.user_id, name);
    }

    // Fetch all-time H2H data (includes all previous seasons)
    const h2hData = await getHeadToHeadAllTime();
    
    // Fetch all-time trade history
    const allTrades = await fetchTradesAllTime();
    
    // Build historical standings summary
    let historicalContext = `
=== HISTORICAL LEAGUE DATA (FOR PRESEASON ${currentSeason} PREVIEW) ===

IMPORTANT: This is a PRESEASON preview. The ${currentSeason} season has NOT started yet.
Base all analysis on PREVIOUS seasons' performance, NOT current season data.

`;

    // Add all-time records from H2H data
    if (h2hData.teams.length > 0) {
      historicalContext += `\n--- ALL-TIME TEAM PERFORMANCE ---\n`;
      
      // Calculate all-time records for each team
      const teamRecords: Array<{ team: string; wins: number; losses: number; playoffWins: number }> = [];
      
      for (const team of h2hData.teams) {
        let totalWins = 0;
        let totalLosses = 0;
        let playoffWins = 0;
        
        for (const opponent of h2hData.teams) {
          if (team === opponent) continue;
          const cell = h2hData.matrix[team]?.[opponent];
          if (cell) {
            totalWins += cell.wins.total;
            totalLosses += cell.losses.total;
            playoffWins += cell.wins.playoffs;
          }
        }
        
        teamRecords.push({ team, wins: totalWins, losses: totalLosses, playoffWins });
      }
      
      // Sort by wins
      teamRecords.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
      
      historicalContext += `All-Time Records (sorted by wins):\n`;
      for (const r of teamRecords) {
        const winPct = r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses) * 100).toFixed(1) : '0.0';
        historicalContext += `- ${r.team}: ${r.wins}-${r.losses} (${winPct}%)${r.playoffWins > 0 ? ` [${r.playoffWins} playoff wins]` : ''}\n`;
      }
    }

    // Add championship history from CHAMPIONS constant (stays current automatically)
    historicalContext += `\n--- CHAMPIONSHIP HISTORY ---\n`;
    const champEntries = Object.entries(CHAMPIONS)
      .filter(([, c]) => c.champion !== 'TBD')
      .sort((a, b) => Number(b[0]) - Number(a[0]));
    for (const [yr, c] of champEntries) {
      const runnerUp = c.runnerUp !== 'TBD' ? `, runner-up: ${c.runnerUp}` : '';
      const third = c.thirdPlace !== 'TBD' ? `, 3rd: ${c.thirdPlace}` : '';
      historicalContext += `- ${yr}: ${c.champion} (Champion)${runnerUp}${third}\n`;
    }

    // Add current-year offseason trades (critical for pre_draft to avoid hallucination)
    // Include trades from the current season's league OR trades since ~Dec 20 of the prior year
    // (covers post-championship trades recorded in the outgoing season's league)
    const offseasonStart = new Date(`${currentSeason - 1}-12-20`);
    const currentYearTrades = allTrades.filter(t => {
      if (t.season === String(currentSeason)) return true;
      if (t.date && new Date(t.date) >= offseasonStart) return true;
      return false;
    });
    historicalContext += `\n--- ${currentSeason} OFFSEASON TRADES ---\n`;
    if (currentYearTrades.length > 0) {
      for (const trade of currentYearTrades) {
        const date = trade.date ? new Date(trade.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';
        const teams = (trade.teams || []).map(tm => `${tm.name} (received: ${(tm.assets || []).map(a => a.name).join(', ') || 'unknown assets'})`).join(' ↔ ');
        historicalContext += `- ${date}: ${teams}\n`;
      }
    } else {
      historicalContext += `No trades have been made in the ${currentSeason} offseason yet. Every team still holds their original draft capital.\n`;
    }

    // Add all-time trade activity summary
    if (allTrades.length > 0) {
      historicalContext += `\n--- ALL-TIME TRADE ACTIVITY ---\n`;
      historicalContext += `Total trades in league history: ${allTrades.length}\n`;

      // Group trades by team to show who's been active
      const tradesByTeam = new Map<string, number>();
      for (const trade of allTrades) {
        for (const tradeTeam of trade.teams || []) {
          tradesByTeam.set(tradeTeam.name, (tradesByTeam.get(tradeTeam.name) || 0) + 1);
        }
      }

      const sortedTraders = [...tradesByTeam.entries()].sort((a, b) => b[1] - a[1]);
      historicalContext += `Most active traders all-time:\n`;
      for (const [team, count] of sortedTraders.slice(0, 5)) {
        historicalContext += `- ${team}: ${count} trades\n`;
      }
    }

    // ---- Previous season awards (MVP / ROY) ----
    // Gives the LLMs context on who the standout performers were, relevant for dynasty valuations
    try {
      const prevLeagueId = getLeagueIdForSeason(String(currentSeason - 1));
      if (prevLeagueId) {
        const awards = await getSeasonAwardsUsingLeagueScoring(currentSeason - 1, prevLeagueId, 14).catch(() => null);
        if (awards && (awards.mvp.length > 0 || awards.roy.length > 0)) {
          historicalContext += `\n--- ${currentSeason - 1} SEASON AWARDS ---\n`;
          if (awards.mvp.length > 0) {
            const mvpStr = awards.mvp.map(w => `${w.name} (${w.points.toFixed(1)} pts${w.teamName ? `, owned by ${w.teamName}` : ''})`).join(', ');
            historicalContext += `MVP: ${mvpStr}\n`;
          }
          if (awards.roy.length > 0) {
            const royStr = awards.roy.map(w => `${w.name} (${w.points.toFixed(1)} pts${w.teamName ? `, owned by ${w.teamName}` : ''})`).join(', ');
            historicalContext += `Rookie of the Year: ${royStr}\n`;
          }
          console.log(`[pre_draft] Loaded ${currentSeason - 1} season awards`);
        }
      }
    } catch (e) {
      console.warn('[pre_draft] Failed to load previous season awards:', e);
    }

    // ---- Previous season dynasty draft history ----
    // Shows which teams selected which rookies in last year's draft — useful for draft capital analysis
    try {
      const prevLeagueId = getLeagueIdForSeason(String(currentSeason - 1));
      if (prevLeagueId) {
        const prevDrafts = await getLeagueDrafts(prevLeagueId).catch(() => null);
        if (prevDrafts && prevDrafts.length > 0) {
          const prevDraft = prevDrafts[prevDrafts.length - 1];
          if (prevDraft.status === 'complete') {
            const [picks, prevUsers, prevRosters, allPlayerMap] = await Promise.all([
              getDraftPicks(prevDraft.draft_id).catch(() => []),
              getLeagueUsers(prevLeagueId).catch(() => []),
              getLeagueRosters(prevLeagueId).catch(() => []),
              getAllPlayersCached().catch(() => ({} as Record<string, import('@/lib/utils/sleeper-api').SleeperPlayer>)),
            ]);
            if (picks.length > 0) {
              // Build roster_id -> team_name map for the previous season
              const prevUserMap = new Map<string, string>();
              for (const u of prevUsers) {
                const meta = (u as unknown as { metadata?: { team_name?: string } }).metadata;
                prevUserMap.set(u.user_id, meta?.team_name || u.display_name || u.username || `User ${u.user_id}`);
              }
              const prevRosterMap = new Map<number, string>();
              for (const r of prevRosters) {
                prevRosterMap.set(r.roster_id, prevUserMap.get(r.owner_id) || `Roster ${r.roster_id}`);
              }

              // Format the top 36 picks (3 rounds of 12)
              const topPicks = picks
                .filter(p => p.round <= 3)
                .sort((a, b) => a.round !== b.round ? a.round - b.round : (a.pick_no ?? 0) - (b.pick_no ?? 0));

              historicalContext += `\n--- ${currentSeason - 1} DYNASTY DRAFT (LAST YEAR'S ROOKIE PICKS) ---\n`;
              historicalContext += `Note: These are now second-year players entering the ${currentSeason} season.\n`;
              for (const pick of topPicks) {
                const player = allPlayerMap[pick.player_id];
                const playerName = player ? `${player.first_name} ${player.last_name}`.trim() : `Player ${pick.player_id}`;
                const pos = player?.position ?? 'UNK';
                const nflTeam = player?.team ?? '';
                const fantasyTeam = prevRosterMap.get(pick.roster_id) || `Roster ${pick.roster_id}`;
                historicalContext += `${pick.round}.${String(pick.pick_no ?? 0).padStart(2, '0')}: ${fantasyTeam} — ${playerName} (${pos}${nflTeam ? ', ' + nflTeam : ''})\n`;
              }
              console.log(`[pre_draft] Loaded ${topPicks.length} picks from ${currentSeason - 1} dynasty draft`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[pre_draft] Failed to load previous season draft history:', e);
    }

    // Add 2026 NFL draft prospect pool from the site's own player database
    try {
      const draftId = await getActiveOrLatestDraftId();
      if (draftId) {
        const playerCount = await countDraftPlayers(draftId);
        if (playerCount > 0) {
          const players = await getDraftPlayers(draftId);
          players.sort((a, b) => {
            const ra = a.rank == null ? 9999 : a.rank;
            const rb = b.rank == null ? 9999 : b.rank;
            return ra - rb;
          });
          const top48 = players.slice(0, 48);
          historicalContext += `\n--- ${currentSeason} NFL DRAFT PROSPECT RANKINGS ---\n`;
          historicalContext += `IMPORTANT: Use ONLY these players in your mock draft analysis. These are the real ${currentSeason} NFL Draft class with dynasty rookie rankings.\n`;
          historicalContext += `Do NOT reference players from earlier draft classes (e.g. prior-year picks already in the NFL).\n\n`;
          historicalContext += top48.map((p, i) => {
            const college = p.meta && typeof p.meta === 'object' ? (p.meta as Record<string, unknown>).college ?? (p.meta as Record<string, unknown>).school : null;
            const parts = [p.pos, p.nfl || (college ? `${college}` : null)].filter(Boolean).join(' — ');
            return `${i + 1}. ${p.name}${parts ? ` (${parts})` : ''}`;
          }).join('\n') + '\n';
          console.log(`[pre_draft] Loaded ${top48.length} draft prospects from custom player pool`);
        } else {
          console.warn('[pre_draft] No custom player pool found — LLM will use training data for prospects');
        }
      }
    } catch (e) {
      console.warn('[pre_draft] Failed to load draft prospect pool:', e);
    }

    historicalContext += `
--- PRESEASON ANALYSIS GUIDELINES ---
When creating the preseason preview:
1. Reference HISTORICAL performance (all-time records, championships, playoff appearances)
2. Consider offseason moves and trades
3. Evaluate roster strength based on player acquisitions
4. Make predictions for the UPCOMING ${currentSeason} season
5. DO NOT reference any ${currentSeason} season games or matchups (they haven't happened)
6. DO NOT say "Week X" - this is a preseason preview, not a weekly recap
`;

    return historicalContext;
  } catch (error) {
    console.error('Failed to build preseason historical context:', error);
    return `PRESEASON PREVIEW for ${currentSeason} season. Base analysis on historical performance.`;
  }
}

// ============ Standings-Based Draft Slot Order ============

interface DraftSlotOrder {
  round1: Array<{ slot: number; team: string }>;
  round2: Array<{ slot: number; team: string }> | undefined;
}

function hasDuplicateTeams(slots: Array<{ slot: number; team: string }>): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const s of slots) {
    if (seen.has(s.team)) dupes.push(s.team);
    else seen.add(s.team);
  }
  return dupes;
}

async function buildSimpleDraftSlotOrder(season: number): Promise<DraftSlotOrder> {
  // 1. Try DB draft_slots — reflects the actual configured order for this draft
  try {
    const draftId = await getActiveOrLatestDraftId();
    if (draftId) {
      const dbSlots = await getDraftRound1Slots(draftId);
      if (dbSlots.length > 0) {
        // Validate: detect duplicate team names (indicates bad DB state, e.g. from failed set_draft_order)
        const duplicates = hasDuplicateTeams(dbSlots);
        if (duplicates.length > 0) {
          console.warn(
            `[pre_draft] DB draft_slots has duplicate team names (${duplicates.join(', ')}) — ` +
            `falling back to standings. Fix via admin: reset draft order.`
          );
          // Fall through to standings (also skip round-2 DB fetch to keep orders consistent)
        } else {
          console.log(`[pre_draft] Draft order from DB draft_slots (${dbSlots.length} teams)`);
          // Fetch round 2 from DB as well — it reflects traded pick order
          let r2: Array<{ slot: number; team: string }> | undefined;
          try {
            const r2Slots = await getDraftRound2Slots(draftId);
            if (r2Slots.length > 0 && hasDuplicateTeams(r2Slots).length === 0) {
              r2 = r2Slots;
              console.log(`[pre_draft] Round 2 order from DB (${r2.length} teams)`);
            } else if (r2Slots.length > 0) {
              console.warn('[pre_draft] DB round-2 slots also have duplicates — will compute from round 1');
            }
          } catch { /* no round 2 in DB yet — fine, will be computed from round 1 */ }
          return { round1: dbSlots, round2: r2 };
        }
      }
    }
  } catch (e) {
    console.warn('[pre_draft] Could not get draft order from DB:', e);
  }

  // 2. Fall back to previous-season standings (worst → first, champion → last)
  try {
    const sourceLeagueId = getLeagueIdForSeason(String(season - 1));
    if (!sourceLeagueId) {
      console.warn(`[pre_draft] No source league ID for season ${season - 1}`);
      return { round1: [], round2: undefined };
    }

    const [rawTeams, regularRecords] = await Promise.all([
      getTeamsData(sourceLeagueId),
      getRegularSeasonRecords(sourceLeagueId).catch(() => null),
    ]);

    const teams = regularRecords
      ? rawTeams.map(t => { const r = regularRecords.get(t.rosterId); return r ? { ...t, wins: r.wins, losses: r.losses } : t; })
      : rawTeams;

    // Sort: worst record first (slot 1), champion last (slot 12)
    teams.sort((a, b) => {
      if (a.wins !== b.wins) return a.wins - b.wins;
      if (a.losses !== b.losses) return b.losses - a.losses;
      if (a.fpts !== b.fpts) return a.fpts - b.fpts;
      return a.teamName.localeCompare(b.teamName);
    });

    console.log(`[pre_draft] Draft order from ${season - 1} standings (${teams.length} teams)`);
    const round1 = teams.map((t, i) => ({ slot: i + 1, team: t.teamName }));
    return { round1, round2: undefined }; // round 2 computed from round 1 (snake) in buildMockDraft
  } catch (e) {
    console.warn('[pre_draft] Failed to build standings-based draft order:', e);
    return { round1: [], round2: undefined };
  }
}

// ============ Auth Helper ============

async function isAdmin(req?: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  const secret = getConfiguredAdminSecret();
  if (!secret) return false;
  // Allow header or query param for cron invocations
  const headerSecret = req?.headers.get('x-admin-secret');
  const urlSecret = req ? new URL(req.url).searchParams.get('secret') : null;
  return (
    isAdminCookieValue(adminCookie?.value) ||
    headerSecret === secret ||
    urlSecret === secret
  );
}

// ============ GET: Retrieve newsletter ============

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');
  const seasonParam = searchParams.get('season');
  const listParam = searchParams.get('list');
  const progressParam = searchParams.get('progress');

  try {
    // Get current NFL state
    const state = await getSleeperState();
    const season = seasonParam || state.season;
    const seasonNum = parseInt(season, 10);

    // If progress=true, return staged generation status
    if (progressParam === 'true') {
      const week = weekParam ? parseInt(weekParam, 10) : state.week;
      const { getStagedNewsletter } = await import('@/server/db/newsletter-queries');
      const staged = await getStagedNewsletter(seasonNum, week).catch(() => null);
      return NextResponse.json({
        success: true,
        status: staged?.status ?? 'idle',
        currentSection: staged?.currentSection ?? null,
        sectionsCompleted: staged?.sectionsCompleted ?? [],
        startedAt: staged?.startedAt ?? null,
      });
    }

    // If list=true, just return available weeks
    if (listParam === 'true') {
      const weeks = await listNewsletterWeeks(seasonNum);
      return NextResponse.json({
        success: true,
        season: seasonNum,
        weeks,
      });
    }

    const week = weekParam ? parseInt(weekParam, 10) : state.week;

    // Load from database
    const stored = await loadNewsletter(seasonNum, week);

    if (stored) {
      return NextResponse.json({
        success: true,
        newsletter: stored.newsletter,
        html: stored.html,
        generatedAt: stored.generatedAt,
        fromCache: true,
      });
    }

    // Get available weeks for this season
    const availableWeeks = await listNewsletterWeeks(seasonNum);

    return NextResponse.json({
      success: false,
      error: 'Newsletter not found',
      message: `No newsletter generated for Season ${season} Week ${week}. Use POST to generate.`,
      availableWeeks,
    }, { status: 404 });

  } catch (error) {
    console.error('Newsletter GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve newsletter',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ============ Staged job starter ============

async function startStagedJob(opts: {
  seasonNum: number;
  week: number;
  leagueId: string;
  episodeType: string;
  isFirstEpisodeEver: boolean;
  forceRegenerate: boolean;
  /** Bypass the pre-generation data validation gate (admin override). */
  force?: boolean;
}): Promise<Response> {
  const { seasonNum, week, leagueId, episodeType, isFirstEpisodeEver, force } = opts;

  try {
    console.log(`[Staged] Starting job for S${seasonNum}W${week} (${episodeType})`);

    // ── Fetch Sleeper data ──
    const ingestData = await fetchNewsletterData(leagueId, week);
    const { leagueName, users, rosters, matchups, nextMatchups, transactions, allTransactions, playerMap: allPlayers, draftData } = ingestData;

    setPlayerNameCache(allPlayers);
    const { buildDerived } = await import('@/lib/newsletter');
    const derived = buildDerived({
      users, rosters, matchups,
      nextMatchups: nextMatchups ?? [],
      transactions: transactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
      allTransactions: allTransactions?.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
    });

    // ── Pre-generation data validation gate ──
    // Fail early with a clear message if Sleeper data looks incomplete or stale,
    // instead of generating a confident but flawed newsletter. force=true bypasses.
    try {
      const { validateGenerationInputs } = await import('@/lib/newsletter/validation-gate');
      const gate = validateGenerationInputs({
        season: seasonNum,
        week,
        episodeType,
        users,
        rosters: rosters as Array<{ players?: string[] | null }>,
        matchups: matchups as Array<{ matchup_id?: number | null; points?: number | null }>,
        matchupPairs: derived.matchup_pairs ?? [],
      });
      if (gate.warnings.length > 0) {
        console.warn(`[Staged] Validation gate warnings: ${gate.warnings.join(' | ')}`);
      }
      if (!gate.ok && !force) {
        console.error(`[Staged] Validation gate BLOCKED job: ${gate.errors.join(' | ')}`);
        return NextResponse.json({
          success: false,
          status: 'validation_failed',
          errors: gate.errors,
          warnings: gate.warnings,
          message: `League data looks incomplete — generation blocked. Fix the data issue or pass force:true to override. Problems: ${gate.errors.join('; ')}`,
        }, { status: 422 });
      }
      if (!gate.ok && force) {
        console.warn(`[Staged] Validation gate FAILED but force=true — proceeding anyway: ${gate.errors.join(' | ')}`);
      }
    } catch (gateErr) {
      // Gate itself failing must not block generation
      console.warn('[Staged] Validation gate errored (non-fatal):', gateErr instanceof Error ? gateErr.message : String(gateErr));
    }

    // Enrich pick labels in derived events with slot numbers + original ownership from the draft tracker.
    // The Sleeper transaction only gives us "2026 Rd 1 Pick"; the DB tells us it's "1.08 originally bop pop's".
    // We enrich both gets and gives so every prompt path uses the same labeled pick identity.
    // We build pickOwnership once here and reuse it below for the context string.
    const pickOwnership = await buildPickOwnershipContext(seasonNum).catch(() => null);
    try {
      if (pickOwnership?.pickLookup) {
        enrichDerivedTradePickLabels(derived.events_scored, pickOwnership.pickLookup);
        console.log(`[Staged] Pick labels enriched in derived events (gets + gives)`);
      }
    } catch (enrichErr) {
      console.warn('[Staged] Pick label enrichment failed (non-fatal):', enrichErr instanceof Error ? enrichErr.message : String(enrichErr));
    }

    // Build roster player ID + name sets for ESPN injury filtering
    const rosterPlayerIds = new Set<string>(rosters.flatMap(r => (r as { players?: string[] }).players ?? []));
    const rosterNames = { full: new Set<string>(), last: new Set<string>() };
    for (const pid of rosterPlayerIds) {
      const p = allPlayers[pid] as { full_name?: string; first_name?: string; last_name?: string } | undefined;
      if (!p) continue;
      const full = (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`).toLowerCase().trim();
      if (full) {
        rosterNames.full.add(full);
        const last = full.split(' ').pop() ?? '';
        if (last.length >= 4) rosterNames.last.add(last);
      }
    }

    const currentQbStatusStr = (() => {
      const qbLines = Array.from(rosterPlayerIds)
        .map(pid => {
          const p = allPlayers[pid] as {
            full_name?: string;
            first_name?: string;
            last_name?: string;
            position?: string;
            team?: string;
            starting_status?: string | null;
            depth_chart_order?: number | null;
            depth_chart_position?: string | null;
          } | undefined;
          if (!p || p.position !== 'QB') return null;
          const name = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
          if (!name) return null;
          const starterTag = p.starting_status?.trim() ? `status=${p.starting_status}` : null;
          const depthTag = typeof p.depth_chart_order === 'number'
            ? `depth=${p.depth_chart_position || 'QB'}${p.depth_chart_order}`
            : null;
          return {
            name,
            team: p.team || 'FA',
            starter: (p.starting_status || '').toLowerCase() === 'starter' || p.depth_chart_order === 1,
            note: [starterTag, depthTag].filter(Boolean).join(', '),
          };
        })
        .filter((x): x is { name: string; team: string; starter: boolean; note: string } => Boolean(x))
        .sort((a, b) => Number(b.starter) - Number(a.starter) || a.name.localeCompare(b.name));
      if (qbLines.length === 0) return '';
      return [
        '=== CURRENT ROSTERED QB STATUS (live Sleeper metadata) ===',
        'Use this as more current than offseason narratives or old headlines. If a QB is listed as a starter here, do not describe him as still competing to win the job unless the context explicitly says that changed.',
        ...qbLines.slice(0, 24).map(q => `- ${q.name} (${q.team}): ${q.starter ? 'starter' : 'not confirmed starter'}${q.note ? ` [${q.note}]` : ''}`),
      ].join('\n');
    })();

    // Build roster_id → team name map (used for stale picks grading below)
    const stagedUserMap = new Map<string, string>();
    for (const u of users) {
      const meta = (u as { metadata?: { team_name?: string } }).metadata;
      stagedUserMap.set(u.user_id, meta?.team_name || u.display_name || u.username || `User ${u.user_id}`);
    }
    const rosterToTeam = new Map<number, string>();
    for (const r of rosters) rosterToTeam.set(r.roster_id, stagedUserMap.get(r.owner_id) || `Roster ${r.roster_id}`);

    // ── Build enhanced context — same quality as the sync route ──
    console.log(`[Staged] Building enhanced context for ${episodeType}...`);

    const isPreseasonEp = ['preseason', 'pre_draft', 'post_draft', 'offseason'].includes(episodeType);
    let enhancedContextString = '';
    let stagedDynastyRankings: DynastyRankingsEntry[] = [];

    const comprehensiveData = await fetchComprehensiveLeagueData();
    const comprehensiveStr = buildComprehensiveContextString(comprehensiveData);
    const rulesStr = getLeagueRulesContext();

    if (isPreseasonEp) {
      const histCtx = await buildPreseasonHistoricalContext(seasonNum, users);
      // Team name stability block — critical for pre_draft so bots know who owns which pick
      const preTeamNameBlock = (() => {
        const lines = ['=== CURRENT TEAM NAMES (may differ from historical records) ===',
          'Use [SL:username] to correlate teams across seasons if names have changed.',
        ];
        for (const u of users) {
          const meta = (u as { metadata?: { team_name?: string } }).metadata;
          const teamName = meta?.team_name || u.display_name || u.username || `User ${u.user_id}`;
          const slName = u.username || u.display_name || u.user_id;
          lines.push(`- ${teamName} [SL:${slName}]`);
        }
        return lines.join('\n');
      })();
      // pickOwnership was already loaded above (before context building) — reuse it
      const pickOwnershipStr = pickOwnership?.contextBlock ?? '';

      enhancedContextString = [preTeamNameBlock, currentQbStatusStr, rulesStr, comprehensiveStr, `${histCtx}${pickOwnershipStr ? '\n\n' + pickOwnershipStr : ''}`]
        .filter(Boolean)
        .join('\n\n');
      console.log(`[Staged] Preseason historical context built (${Math.round(enhancedContextString.length / 1000)}K chars)`);
    } else {
      const [currentWeekCtx, externalData, dynastyRankingsResult] = await Promise.all([
        fetchCurrentWeekContext(leagueId, seasonNum, week),
        fetchAllExternalData(),
        loadDynastyRankings().catch(() => [] as DynastyRankingsEntry[]),
      ]);
      stagedDynastyRankings = dynastyRankingsResult;
      const standingsStr = buildCurrentStandingsContext(currentWeekCtx);
      const txStr = buildTransactionsContext(currentWeekCtx);
      // ESPN injuries filtered to roster players; Sleeper roster injuries as separate block
      const externalStr = buildExternalDataContext(externalData, rosterNames);
      const rosterInjuries = ingestData.injuries.filter(inj => inj.status && inj.status !== 'Active' && inj.status !== 'Healthy');
      const rosterInjuryStr = rosterInjuries.length > 0
        ? `=== ROSTER INJURIES (players on league rosters) ===\n${rosterInjuries.slice(0, 20).map(inj => `- ${inj.playerName} (${inj.nflTeam}): ${inj.injuryStatus || inj.status}`).join('\n')}\n`
        : '';
      // Compact top-50 overview for general bot awareness; full list stored separately for per-player lookup
      const dynastyOverviewStr = buildDynastyOverviewContext(stagedDynastyRankings);

      // pickOwnership already loaded above — reuse the same result
      const pickOwnershipStr = pickOwnership?.contextBlock ?? '';

      // Build team-name stability block — lets bots correlate across name changes via Sleeper username
      const teamNameBlock = (() => {
        const lines = ['=== CURRENT TEAM NAMES (may differ from historical records) ===',
          'Team names can change between seasons. Use [SL:username] to correlate with older trade/H2H records.',
          'IMPORTANT: If you see a team name you do not recognize, look it up by [SL:username] in the roster list below.',
        ];
        for (const u of users) {
          const meta = (u as { metadata?: { team_name?: string } }).metadata;
          const teamName = meta?.team_name || u.display_name || u.username || `User ${u.user_id}`;
          const slName = u.username || u.display_name || u.user_id;
          lines.push(`- ${teamName} [SL:${slName}]`);
        }
        return lines.join('\n');
      })();

      // Current data first — section generators slice context at 2-4K chars, so standings/transactions
      // must come before static historical content or they get cut off
      enhancedContextString = [teamNameBlock, standingsStr, txStr, pickOwnershipStr, currentQbStatusStr, rosterInjuryStr, dynastyOverviewStr, externalStr, rulesStr, comprehensiveStr].filter(Boolean).join('\n\n');
      console.log(`[Staged] Regular context built (${Math.round(enhancedContextString.length / 1000)}K chars, dynasty=${stagedDynastyRankings.length} players)`);
    }

    // ── Load and evolve bot memories (same as sync generator.ts) ──
    const { createEnhancedMemory, ensureEnhancedTeams, updateEnhancedMemoryAfterWeek, upgradeToEnhancedMemory } = await import('@/lib/newsletter/memory');
    const { isEnhancedMemory: isEnhanced } = await import('@/lib/newsletter/types');

    const [rawMemEnt, rawMemAna] = await Promise.all([
      loadBotMemory('entertainer', seasonNum).catch(() => null),
      loadBotMemory('analyst', seasonNum).catch(() => null),
    ]);

    const memEnt = rawMemEnt
      ? (isEnhanced(rawMemEnt) ? rawMemEnt : upgradeToEnhancedMemory(rawMemEnt, seasonNum))
      : createEnhancedMemory('entertainer', seasonNum);
    const memAna = rawMemAna
      ? (isEnhanced(rawMemAna) ? rawMemAna : upgradeToEnhancedMemory(rawMemAna, seasonNum))
      : createEnhancedMemory('analyst', seasonNum);

    // Ensure all teams are represented in memory
    const teamNames = derived.matchup_pairs.flatMap(p => [p.winner.name, p.loser.name]);
    const uniqueTeams = [...new Set(teamNames)];
    if (uniqueTeams.length === 0) {
      // Offseason/preseason — seed from user list
      users.forEach(u => {
        const name = (u as { metadata?: { team_name?: string } }).metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`;
        uniqueTeams.push(name);
      });
    }
    ensureEnhancedTeams(memEnt, uniqueTeams);
    ensureEnhancedTeams(memAna, uniqueTeams);

    // Evolve memory based on this week's matchup results
    updateEnhancedMemoryAfterWeek(memEnt, derived, week);
    updateEnhancedMemoryAfterWeek(memAna, derived, week);
    console.log(`[Staged] Bot memories evolved — Entertainer: ${memEnt.summaryMood}, Analyst: ${memAna.summaryMood}`);

    // Append editorial corrections block to the context string so it reaches every generation step.
    // Both bots share the same context string, so we include corrections from both memories here.
    const correctionLines: string[] = [];
    for (const mem of [memEnt, memAna]) {
      if (!mem?.editorialCorrections?.length) continue;
      const recent = mem.editorialCorrections.slice(-5);
      for (const entry of recent) {
        for (const c of entry.corrections) {
          const key = `${entry.season}w${entry.week}:${c.section}`;
          if (!correctionLines.some(l => l.includes(key))) {
            if (correctionLines.length === 0) correctionLines.push('--- EDITORIAL CORRECTIONS (past published edits) ---');
            correctionLines.push(`S${entry.season}W${entry.week} [${c.section}]: ${c.note}`);
          }
        }
      }
    }
    if (correctionLines.length > 0) {
      enhancedContextString = enhancedContextString + '\n\n' + correctionLines.join('\n');
      console.log(`[Staged] Appended ${correctionLines.length - 1} editorial correction(s) to context`);
    }

    // ── For pre_draft: fetch draft slot order and prospect pool ──
    let preDraftSlots: Array<{ slot: number; team: string }> | undefined;
    let preDraftRound2Slots: Array<{ slot: number; team: string }> | undefined;
    let prospectPool: Array<{ name: string; pos: string; rank: number | null }> | null = null;
    if (episodeType === 'pre_draft') {
      // Use the same draft order algorithm as the website's draft order page (next-order route),
      // which correctly accounts for traded picks and playoff finishing order.
      const { getNewsletterDraftOrder } = await import('@/lib/newsletter/draft-order-helper');
      const draftOrder = await getNewsletterDraftOrder(seasonNum) ?? await buildSimpleDraftSlotOrder(seasonNum);
      preDraftSlots = draftOrder.round1.length > 0 ? draftOrder.round1 : undefined;
      preDraftRound2Slots = draftOrder.round2;
      console.log(`[Staged] pre_draft slot order: ${preDraftSlots?.map(s => `${s.slot}.${s.team}`).join(', ') ?? 'none (will fallback to Team 1..12)'}`);

      // Load eligible prospect pool — mock draft steps require this to prevent hallucinated players
      try {
        const draftId = await getActiveOrLatestDraftId();
        if (draftId) {
          const players = await getDraftPlayers(draftId);

          // Always re-derive prospect ranks fresh from FantasyCalc dynasty values.
          // NEVER trust DB-stored ranks — they can be stale, wrong, or set from a different
          // source. Instead: fetch FC values for all pool players, sort by value within the
          // pool, and assign sequential ranks 1..N (1 = most valuable rookie in this class).
          // This gives correct prospect-class rankings regardless of what's in the DB.
          type FcEntry = { player?: { name?: string; position?: string; nflTeamAbbreviation?: string }; value?: number };
          let fcValueByName: Map<string, number> | null = null;

          try {
            const fcRes = await fetch(
              'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=0.5',
              { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } },
            );
            if (fcRes.ok) {
              const fcData = await fcRes.json() as FcEntry[];
              if (Array.isArray(fcData) && fcData.length > 0) {
                fcValueByName = new Map<string, number>();
                for (const entry of fcData) {
                  const name = (entry.player?.name ?? '').toLowerCase().trim();
                  if (name && entry.value != null) fcValueByName.set(name, Number(entry.value));
                }
                console.log(`[Staged] pre_draft: loaded ${fcValueByName.size} FC dynasty values for rank derivation`);
              }
            }
          } catch (fcErr) {
            console.log('[Staged] pre_draft: FantasyCalc unavailable, will use DB ranks as fallback:', fcErr instanceof Error ? fcErr.message : String(fcErr));
          }

          if (fcValueByName && fcValueByName.size > 0) {
            // Build a normalized name map for fuzzy matching (strips punctuation/hyphens).
            // This handles common formatting differences between admin pool names and FC names
            // (e.g. "T.J. Sanders" vs "TJ Sanders", "De'Von Achane" vs "Devon Achane").
            // Last-name-only fallback is NOT used — it causes Barion Brown to inherit A.J. Brown's value.
            const normalizeFcName = (name: string): string =>
              name.toLowerCase().replace(/[.'‘’“”`\-]/g, '').replace(/\s+/g, ' ').trim();
            const fcNormMap = new Map<string, number>();
            for (const [fcName, val] of fcValueByName) {
              const norm = normalizeFcName(fcName);
              if (norm && !fcNormMap.has(norm)) fcNormMap.set(norm, val);
            }

            const lookupValue = (name: string): number => {
              // 1. Exact lowercase match
              const lower = name.toLowerCase().trim();
              const exact = fcValueByName!.get(lower);
              if (exact != null) return exact;
              // 2. Normalized match (strip punctuation/hyphens)
              return fcNormMap.get(normalizeFcName(name)) ?? 0;
            };

            // Players with a positive FC value are ranked 1..N in descending value order.
            // Players with no FC match (val = 0) receive rank = null and sort to the bottom.
            // Previously ALL players got a sequential rank, so val=0 players ended up ranked
            // 1, 2, 3... ahead of legitimately high-value prospects — this is the root cause
            // of players like Barion Brown appearing as #1 overall despite minimal dynasty value.
            const withValues = players.map(p => ({ p, val: lookupValue(p.name) }));
            const matched_list = withValues.filter(e => e.val > 0);
            const unmatched_list = withValues.filter(e => e.val === 0);
            matched_list.sort((a, b) => b.val - a.val);
            let rankIdx = 1;
            for (const { p } of matched_list) {
              p.rank = rankIdx++;
            }
            for (const { p } of unmatched_list) {
              p.rank = null; // no FC match — will sort last via (rank ?? 9999) below
            }
            console.log(`[Staged] pre_draft: assigned prospect ranks for ${matched_list.length}/${players.length} players via FC values (${unmatched_list.length} unranked)`);
          }
          // If FC unavailable, fall back to DB ranks (sort nulls last)
          players.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
          prospectPool = players.map(p => ({ name: p.name, pos: p.pos, rank: p.rank ?? null }));

          const unrankedAfter = prospectPool.filter(p => p.rank === null).length;
          console.log(`[Staged] pre_draft prospect pool loaded: ${prospectPool.length} players (${unrankedAfter} unranked)`);
          console.log(`[Staged] pre_draft first 10 prospects by rank: ${prospectPool.slice(0, 10).map(p => `${p.name}${p.rank ? ` #${p.rank}` : ''}`).join(', ')}`);
        }
      } catch (e) {
        console.warn('[Staged] pre_draft: Failed to load prospect pool from DB:', e);
      }
      if (!prospectPool || prospectPool.length === 0) {
        console.warn('[Staged] pre_draft: NO prospect pool found — MockDraft steps will fail with a hard error. Load the prospect pool via the draft admin tool first.');
      }
    }

    // ── For post_draft: use ALL league teams as the grade list (not just teams with picks) ──
    // This ensures teams that traded away all picks still get a "no picks" grade section.
    let draftTeams: string[] | undefined;
    if (episodeType === 'post_draft') {
      // Build the full canonical team list from league users/rosters
      const userNameMap = new Map<string, string>();
      for (const u of users) {
        const meta = (u as { metadata?: { team_name?: string } }).metadata;
        userNameMap.set(u.user_id, meta?.team_name || u.display_name || u.username || `User ${u.user_id}`);
      }
      const allLeagueTeams: string[] = [];
      const seenTeams = new Set<string>();
      for (const r of rosters) {
        const name = userNameMap.get(r.owner_id) || `Roster ${r.roster_id}`;
        if (!seenTeams.has(name)) { seenTeams.add(name); allLeagueTeams.push(name); }
      }
      draftTeams = allLeagueTeams.length > 0 ? allLeagueTeams : undefined;
      if (draftTeams) {
        console.log(`[Staged] post_draft team list created (${draftTeams.length}): ${draftTeams.join(', ')}`);
        // Detect and log teams with no recorded picks
        if (draftData?.picks && draftData.picks.length > 0) {
          const teamsWithPicksSet = new Set(
            (draftData.picks as Array<{ teamName?: string; roster_id?: number }>)
              .map(p => p.teamName || `Roster ${p.roster_id}`)
          );
          const noPickTeams = draftTeams.filter(t => !teamsWithPicksSet.has(t));
          if (noPickTeams.length > 0) {
            console.log(`[Staged] post_draft no-pick teams detected (${noPickTeams.length}): ${noPickTeams.join(', ')}`);
          } else {
            console.log(`[Staged] post_draft all ${draftTeams.length} teams have recorded picks`);
          }
        } else {
          console.log(`[Staged] post_draft no picks data available — all teams will receive N/A grade`);
        }
      }
    }

    // ── Build roster context — full per-team roster for mock draft and trade analysis ──
    let rosterContext = '';
    try {
      const rcUserNameMap = new Map<string, string>();
      const rcSleeperUsernameMap = new Map<string, string>(); // user_id → stable Sleeper username
      for (const u of users) {
        const meta = (u as { metadata?: { team_name?: string } }).metadata;
        rcUserNameMap.set(u.user_id, meta?.team_name || u.display_name || u.username || `User ${u.user_id}`);
        rcSleeperUsernameMap.set(u.user_id, u.username || u.display_name || `User ${u.user_id}`);
      }
      const rosterLines: string[] = [];
      for (const roster of rosters) {
        const teamName = rcUserNameMap.get(roster.owner_id) ?? `Roster ${roster.roster_id}`;
        const sleeperName = rcSleeperUsernameMap.get(roster.owner_id) ?? '';
        // Full roster: active + taxi + reserve (no slice limit — dynasty rosters are 25-35 players)
        type ExtRoster = { players?: string[]; taxi?: string[]; reserve?: string[] };
        const ext = roster as ExtRoster;
        const activeIds = ext.players ?? [];
        const taxiIds = ext.taxi ?? [];

        const byPos = new Map<string, Array<{ name: string; taxi: boolean }>>();
        const addPlayer = (pid: string, isTaxi: boolean) => {
          const p = allPlayers[pid] as { first_name?: string; last_name?: string; position?: string } | undefined;
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
          if (players && players.length > 0) {
            const names = players.map(pl => pl.taxi ? `${pl.name}*` : pl.name).join(', ');
            posLines.push(`  ${pos}: ${names}`);
          }
        }
        // Any other positions not in posOrder
        for (const [pos, players] of byPos) {
          if (!posOrder.includes(pos) && players.length > 0) {
            posLines.push(`  ${pos}: ${players.map(pl => pl.name).join(', ')}`);
          }
        }

        const taxiNote = taxiIds.length > 0 ? ' (*=taxi squad)' : '';
        rosterLines.push(`${teamName} [SL:${sleeperName}]${taxiNote}:\n${posLines.join('\n') || '  (no data)'}`);
      }
      rosterContext = rosterLines.join('\n\n');
      console.log(`[Staged] Roster context built: ${rosterLines.length} teams (full rosters)`);
    } catch (e) {
      console.warn('[Staged] Failed to build roster context:', e);
    }

    const matchupCount = derived.matchup_pairs.length;
    const tradeCount = derived.events_scored.filter(e => e.type === 'trade').length;

    // ── Grade previous picks + load forecast records for episodes that use Forecast ──
    // This runs at job start so forecast records are available to the Forecast step.
    const FORECAST_EPISODE_TYPES = ['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round', 'preseason'];
    let stagedForecastRecords: { entertainer: { w: number; l: number }; analyst: { w: number; l: number } } = {
      entertainer: { w: 0, l: 0 },
      analyst: { w: 0, l: 0 },
    };
    if (FORECAST_EPISODE_TYPES.includes(episodeType)) {
      try {
        const { gradePendingPicks } = await import('@/lib/newsletter/forecast');

        // Load current-week picks + up to 3 lookback weeks in parallel to catch any skipped newsletters
        const LOOKBACK = 3;
        const lookbackWeeks = Array.from({ length: LOOKBACK }, (_, i) => week - 1 - i).filter(w => w >= 1);
        const [existingRecords, currentWeekPicks, ...stalePicks] = await Promise.all([
          loadForecastRecords(seasonNum).catch(() => null),
          loadPendingPicks(seasonNum, week).catch(() => null),
          ...lookbackWeeks.map(w => loadPendingPicks(seasonNum, w).catch(() => null)),
        ]);

        let runningRecords = { ...(existingRecords ?? { entertainer: { w: 0, l: 0 }, analyst: { w: 0, l: 0 } }) };
        runningRecords = { entertainer: { ...runningRecords.entertainer }, analyst: { ...runningRecords.analyst } };

        // Grade current week's picks against this week's results
        if (currentWeekPicks && derived.matchup_pairs.length > 0) {
          runningRecords = gradePendingPicks(currentWeekPicks, derived.matchup_pairs, runningRecords);
          console.log(`[Staged] Current-week picks graded (Week ${week})`);
        }

        // Grade any stale picks from skipped weeks using historical matchup data
        for (let i = 0; i < lookbackWeeks.length; i++) {
          const stale = stalePicks[i];
          if (!stale || stale.picks.length === 0) continue;
          const histWeek = lookbackWeeks[i];
          try {
            const histMatchups = await getMatchups(leagueId, histWeek).catch(() => []);
            const groups = new Map<number, Array<{ name: string; points: number }>>();
            for (const m of histMatchups) {
              if (m.matchup_id == null) continue;
              const name = rosterToTeam.get(m.roster_id) || `Roster ${m.roster_id}`;
              const pts = Number(m.points ?? 0);
              const grp = groups.get(m.matchup_id) ?? [];
              grp.push({ name, points: pts });
              groups.set(m.matchup_id, grp);
            }
            const histPairs = [...groups.entries()]
              .filter(([, g]) => g.length >= 2)
              .map(([mid, g]) => {
                const sorted = [...g].sort((a, b) => b.points - a.points);
                return {
                  matchup_id: mid,
                  teams: sorted.map(s => ({ name: s.name, points: s.points })),
                  winner: { name: sorted[0].name, points: sorted[0].points },
                  loser:  { name: sorted[1].name, points: sorted[1].points },
                  margin: sorted[0].points - sorted[1].points,
                };
              });
            if (histPairs.length > 0) {
              runningRecords = gradePendingPicks(
                stale,
                histPairs as import('@/lib/newsletter/types').MatchupPair[],
                runningRecords,
              );
              console.log(`[Staged] Graded ${stale.picks.length} stale picks from Week ${histWeek}`);
            }
          } catch (e) {
            console.warn(`[Staged] Failed to grade stale picks for Week ${histWeek}:`, e);
          }
        }

        stagedForecastRecords = runningRecords;
        console.log(`[Staged] Forecast records — Entertainer: ${stagedForecastRecords.entertainer.w}W-${stagedForecastRecords.entertainer.l}L, Analyst: ${stagedForecastRecords.analyst.w}W-${stagedForecastRecords.analyst.l}L`);
      } catch (e) {
        console.warn('[Staged] Failed to load/grade forecast records:', e);
      }
    }

    // ── Store everything in the staged record ──
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log(`[Staged] runId=${runId} S${seasonNum}W${week} (${episodeType})`);

    // ── Persist the generation run + frozen context packet (fire-and-forget) ──
    // The packet is what the models will see: if a section states a wrong fact,
    // this record answers "was the data wrong, missing, or did the model hallucinate?"
    try {
      const { recordRunStart } = await import('@/server/db/observability-queries');
      const stepsForCount = (await import('@/lib/newsletter/compose-step')).getGenerationSteps(episodeType, matchupCount, tradeCount, draftTeams);
      void recordRunStart({
        runId,
        season: seasonNum,
        week,
        episodeType,
        runType: 'staged',
        totalSteps: stepsForCount.length,
        contextPacket: {
          fetchedAt: new Date().toISOString(),
          enhancedContext: enhancedContextString,
          teamCount: users.length,
          rosterCount: rosters.length,
          matchupPairCount: derived.matchup_pairs?.length ?? 0,
          tradeCount,
          eventsScored: derived.events_scored?.map(e => ({ type: e.type, id: e.event_id, parties: e.parties })) ?? [],
          memoryMoods: { entertainer: memEnt?.summaryMood, analyst: memAna?.summaryMood },
          hasDraftData: !!draftData,
          prospectPoolSize: prospectPool?.length ?? 0,
        },
      });
    } catch (obsErr) {
      console.warn('[Staged] recordRunStart failed (non-fatal):', obsErr instanceof Error ? obsErr.message : String(obsErr));
    }

    const jobMeta = {
      runId,
      episodeType,
      leagueName: leagueName || 'East v. West',
      leagueId,
      preDraftSlots,
      preDraftRound2Slots,
      isFirstEpisodeEver,
      matchupCount,
      tradeCount,
      draftTeams,
    };
    // prospectPool is stored separately (not in jobMeta) to keep jobMeta size manageable

    const { createStagedNewsletter, mergeStagedDerivedData: mergeData } = await import('@/server/db/newsletter-queries');
    await createStagedNewsletter(seasonNum, week, { leagueName: leagueName || 'East v. West', derived, users, rosters });
    await mergeData(seasonNum, week, {
      __jobMeta: jobMeta,
      __context: enhancedContextString,
      __derived: derived as unknown as Record<string, unknown>,
      __draftData: draftData as unknown as Record<string, unknown> | null,
      // Store evolved memories so steps use personality-aware state
      __memoryEntertainer: JSON.parse(JSON.stringify(memEnt)) as Record<string, unknown>,
      __memoryAnalyst:     JSON.parse(JSON.stringify(memAna)) as Record<string, unknown>,
      // Store graded forecast records so the Forecast step can embed the running W/L record
      __forecastRecords: FORECAST_EPISODE_TYPES.includes(episodeType) ? stagedForecastRecords : null,
      // Store prospect pool so MockDraft steps can enforce hard player constraints
      __prospectPool: prospectPool,
      // Store roster context so mock draft and waiver steps know each team's positional depth
      __rosterContext: rosterContext,
      // Store full dynasty rankings for per-player lookup in waiver/trade steps
      __dynastyRankings: stagedDynastyRankings.length > 0 ? stagedDynastyRankings : null,
      sections: {},
    });
    await updateStagedNewsletter(seasonNum, week, { status: 'pending', sectionsCompleted: [], currentSection: null });

    const { getGenerationSteps } = await import('@/lib/newsletter/compose-step');
    const allSteps = getGenerationSteps(episodeType, matchupCount, tradeCount, draftTeams);

    console.log(`[Staged] Job created — ${allSteps.length} steps: ${allSteps.join(', ')}`);

    return NextResponse.json({
      success: true,
      status: 'started',
      runId,
      season: seasonNum,
      week,
      episodeType,
      totalSteps: allSteps.length,
      steps: allSteps,
      message: `Staged job created. Call POST /api/newsletter/generate-step { season: ${seasonNum}, week: ${week} } to advance one section at a time.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Staged] Failed to start job:', msg);
    return NextResponse.json({ success: false, error: 'Failed to start staged job', details: msg }, { status: 500 });
  }
}

// ============ POST: Generate newsletter ============

export async function POST(request: NextRequest) {
  // Check admin auth
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { week: weekOverride, season: seasonOverride, episodeType, forceRegenerate, preview, isFirstEpisodeEver, mode, force } = body as {
      week?: number;
      season?: string;
      episodeType?: string;
      /** Bypass the pre-generation data validation gate (staged mode only). */
      force?: boolean;
      forceRegenerate?: boolean;
      preview?: boolean;
      /** Pass true only for the very first pre_draft newsletter — makes Mason/Westy introduce themselves */
      isFirstEpisodeEver?: boolean;
      /**
       * Generation mode:
       *   'sync'   — run the full newsletter synchronously (legacy; may time out on Vercel for large episodes)
       *   'start'  — create a staged job and return immediately; client calls /generate-step to advance
       * Default: 'sync' so existing callers (GitHub Actions, local dev) are unchanged.
       */
      mode?: 'sync' | 'start';
    };

    // Get current NFL state
    const state = await getSleeperState();
    const season = seasonOverride || state.season;
    const seasonNum = parseInt(season, 10);
    const week = weekOverride || state.week;

    const leagueId = getLeagueIdForSeason(String(season));
    if (!leagueId) {
      return NextResponse.json({
        success: false,
        error: `No league ID found for season ${season}`,
      }, { status: 400 });
    }

    // ── STAGED MODE: always bypass the newsletter cache check ──
    // mode:start means the admin is explicitly requesting a new generation run.
    // The cache guard below must NOT run first — it would return the old newsletter
    // and startStagedJob would never be called, causing the UI to silently display
    // the previous run's output even though new sections were never generated.
    if (mode === 'start') {
      return await startStagedJob({
        seasonNum, week, leagueId, episodeType: episodeType || 'regular',
        isFirstEpisodeEver: isFirstEpisodeEver ?? false,
        forceRegenerate: forceRegenerate ?? false,
        force: force ?? false,
      });
    }

    // ── SYNC MODE (default): check cache unless force regenerate ──
    if (!forceRegenerate) {
      const existing = await loadNewsletter(seasonNum, week);
      if (existing) {
        return NextResponse.json({
          success: true,
          newsletter: existing.newsletter,
          html: existing.html,
          generatedAt: existing.generatedAt,
          fromCache: true,
          message: 'Newsletter already exists. Use forceRegenerate: true to regenerate.',
        });
      }
    }

    // ── SYNC MODE (default): run full generation in this request ──
    // Mark generation as in-progress and clear stale section data from any prior run
    void updateStagedNewsletter(seasonNum, week, { status: 'in_progress', sectionsCompleted: [], currentSection: null }).catch(() => {});

    // Fetch all required data from Sleeper via single-call ingest layer
    console.log(`Generating newsletter for Season ${season} Week ${week}...`);

    const [ingestData, existingMemoryEntertainer, existingMemoryAnalyst, existingRecords, existingPendingPicks, previousNewsletter, relationshipMem] = await Promise.all([
      fetchNewsletterData(leagueId, week), // fetches league/users/rosters/matchups/transactions/players/injuries + seeds player cache
      loadBotMemory('entertainer', seasonNum),
      loadBotMemory('analyst', seasonNum),
      loadForecastRecords(seasonNum),
      loadPendingPicks(seasonNum, week),
      loadPreviousNewsletter(seasonNum, week),
      loadRelationshipMemory(seasonNum),
    ]);

    const { leagueName: leagueNameFromIngest, users, rosters, matchups, nextMatchups, transactions, allTransactions, playerMap: allPlayers, injuries: rawInjuries, draftData } = ingestData;

    console.log(`Loaded bot memory - Entertainer: ${existingMemoryEntertainer ? 'found' : 'new'}, Analyst: ${existingMemoryAnalyst ? 'found' : 'new'}`);

    // Carry-forward: clear stale output log on season boundary (defensive; DB query is season-indexed)
    if (existingMemoryEntertainer?.season && existingMemoryEntertainer.season !== seasonNum) {
      clearSeasonOutputLog(existingMemoryEntertainer);
    }
    if (existingMemoryAnalyst?.season && existingMemoryAnalyst.season !== seasonNum) {
      clearSeasonOutputLog(existingMemoryAnalyst);
    }

    // Phase 3: load admin personality overrides and apply to runtime module state.
    // Failures are non-fatal — hardcoded defaults remain in effect.
    try {
      const { loadBotSettings, loadAllTeamNarrativeOverrides, loadPhrasePool } =
        await import('@/server/db/personality-queries').catch(() => ({ loadBotSettings: null, loadAllTeamNarrativeOverrides: null, loadPhrasePool: null }));

      if (loadBotSettings && loadAllTeamNarrativeOverrides && loadPhrasePool) {
        const [entSettings, anaSettings, teamCardRows, bannedPool] = await Promise.allSettled([
          loadBotSettings('entertainer'),
          loadBotSettings('analyst'),
          loadAllTeamNarrativeOverrides(),
          loadPhrasePool('banned_global'),
        ]);

        if (entSettings.status === 'fulfilled' && entSettings.value) {
          applyBotBrainOverride('entertainer', toBotBrainOverride(entSettings.value));
        }
        if (anaSettings.status === 'fulfilled' && anaSettings.value) {
          applyBotBrainOverride('analyst', toBotBrainOverride(anaSettings.value));
        }
        if (teamCardRows.status === 'fulfilled') {
          for (const card of teamCardRows.value) {
            setTeamCardOverride(card.teamName, card.cardData);
          }
        }
        if (bannedPool.status === 'fulfilled' && bannedPool.value) {
          setRuntimeBannedPhrases(bannedPool.value);
        }
      }
    } catch {
      // Non-fatal — hardcoded defaults remain active
      console.warn('[Newsletter] personality overrides load failed; using hardcoded defaults');
    }
    console.log(`[Newsletter] Player cache loaded: ${Object.keys(allPlayers).length} players, ${rawInjuries.length} injuries`);

    // Build roster player name sets for ESPN injury filtering
    const syncRosterPlayerIds = new Set<string>(rosters.flatMap(r => (r as { players?: string[] }).players ?? []));
    const syncRosterNames = { full: new Set<string>(), last: new Set<string>() };
    for (const pid of syncRosterPlayerIds) {
      const p = allPlayers[pid] as { full_name?: string; first_name?: string; last_name?: string } | undefined;
      if (!p) continue;
      const full = (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`).toLowerCase().trim();
      if (full) {
        syncRosterNames.full.add(full);
        const last = full.split(' ').pop() ?? '';
        if (last.length >= 4) syncRosterNames.last.add(last);
      }
    }

    // Extract predictions from previous newsletter for grading/callbacks
    const previousPredictions = previousNewsletter ? extractPredictionsFromNewsletter(previousNewsletter) : [];
    if (previousPredictions.length > 0) {
      console.log(`[Newsletter] Found ${previousPredictions.length} predictions from previous newsletter to reference`);
    }

    // Build CallbacksSection from previous newsletter's Forecast picks so compose can render it
    const lastCallbacks = previousNewsletter && previousPredictions.length > 0
      ? {
          saved_at: previousNewsletter.generatedAt,
          spotlight_team: '',
          forecast_picks: previousPredictions.map(p => ({
            matchup_id: p.matchupId,
            team1: p.team1,
            team2: p.team2,
            entertainer_pick: p.entertainerPick,
            analyst_pick: p.analystPick,
          })),
          trade_grades: [],
        }
      : null;

    // Build playerId -> fantasy team map for injury context
    const userNameById = new Map<string, string>();
    for (const u of users) {
      const meta = (u as unknown as { metadata?: { team_name?: string } }).metadata;
      const display = meta?.team_name || u.display_name || u.username || `User ${u.user_id}`;
      userNameById.set(u.user_id, display);
    }
    const rosterNameById = new Map<number, string>();
    for (const r of rosters) {
      const name = userNameById.get(r.owner_id) || `Roster ${r.roster_id}`;
      rosterNameById.set(r.roster_id, name);
    }
    const playerToFantasyTeam = new Map<string, string>();
    for (const r of rosters) {
      for (const pid of r.players || []) {
        if (!playerToFantasyTeam.has(pid)) playerToFantasyTeam.set(pid, rosterNameById.get(r.roster_id) || `Roster ${r.roster_id}`);
      }
    }

    // Convert ingest injuries to the format expected by downstream context builders
    const formattedInjuries = rawInjuries
      .filter(inj => inj.status && inj.status !== 'Healthy' && inj.status !== 'Active')
      .slice(0, 30)
      .map(inj => ({
        playerId: inj.playerId,
        playerName: inj.playerName,
        team: inj.nflTeam,
        status: inj.status,
        fantasyTeam: playerToFantasyTeam.get(inj.playerId) || 'FA',
      }));

    // Fetch comprehensive league data from all sources (records, H2H, trades, etc.)
    console.log('[Newsletter] Fetching comprehensive league data...');
    const comprehensiveData = await fetchComprehensiveLeagueData();
    const comprehensiveContextString = buildComprehensiveContextString(comprehensiveData);
    console.log(`[Newsletter] Comprehensive data: ${Object.keys(comprehensiveData.teams).length} teams, ${comprehensiveData.allTrades.length} trades, ${comprehensiveData.topScoringWeeks.length} top weeks`);

    // Fetch CURRENT SEASON context (standings, streaks, transactions, playoff implications)
    console.log('[Newsletter] Fetching current week context...');
    const currentWeekContext = await fetchCurrentWeekContext(leagueId, seasonNum, week);
    const currentStandingsString = buildCurrentStandingsContext(currentWeekContext);
    const transactionsString = buildTransactionsContext(currentWeekContext);
    const rulesString = getLeagueRulesContext();
    console.log(`[Newsletter] Current week: ${currentWeekContext.standings.length} teams, ${currentWeekContext.recentTransactions.length} transactions`);

    // Build enhanced context for richer LLM generation
    // For preseason episodes, use historical data instead of current season data
    const isPreseasonEpisode = episodeType === 'preseason' || episodeType === 'pre_draft' || episodeType === 'post_draft' || episodeType === 'offseason';
    
    let enhancedContext: Awaited<ReturnType<typeof buildEnhancedContextFull>>;
    let syncDynastyRankings: DynastyRankingsEntry[] = [];
    const syncTradeRosterContext = buildLeagueRosterContext(users, rosters, allPlayers);

    if (isPreseasonEpisode) {
      syncDynastyRankings = await loadDynastyRankings().catch(() => [] as DynastyRankingsEntry[]);
      console.log(`[${episodeType}] Building historical context for special episode...`);
      const historicalContext = await buildPreseasonHistoricalContext(seasonNum, users);
      // Combine historical context with comprehensive league data and rules
      enhancedContext = {
        standings: [], // No current standings for preseason
        byeTeams: [],
        enhancedContextString: `${rulesString}\n\n${comprehensiveContextString}\n\n${historicalContext}`,
      };
      console.log(`Historical context built for ${episodeType} episode`);
    } else {
      enhancedContext = await buildEnhancedContextFull(leagueId, week, seasonNum, users, matchups);
      
      // Fetch external data + dynasty rankings in parallel
      console.log('[Newsletter] Fetching external data sources (ESPN, Sleeper trending, FantasyCalc)...');
      const [externalData, dynRankings] = await Promise.all([
        fetchAllExternalData(),
        loadDynastyRankings().catch(() => [] as DynastyRankingsEntry[]),
      ]);
      syncDynastyRankings = dynRankings;
      const dynastyRankingsStr = buildDynastyOverviewContext(syncDynastyRankings);
      // Filter ESPN injuries to players on this league's rosters
      const externalDataString = buildExternalDataContext(externalData, syncRosterNames);
      console.log(`[Newsletter] External data: ${externalData.news.length} news, ${externalData.injuries.length} injuries, ${externalData.trending.length} trending, dynasty=${syncDynastyRankings.length} players`);
      
      // Build relationship memory context (cross-bot debate history and tendencies)
      const relMemContext = (() => {
        const pred = relationshipMem.prediction_records;
        const dynamic = relationshipMem.dynamic;
        const themes = relationshipMem.themes;
        const lines = [
          `=== BOT RELATIONSHIP MEMORY ===`,
          `Season prediction records — Entertainer: ${pred.entertainer.w}W-${pred.entertainer.l}L, Analyst: ${pred.analyst.w}W-${pred.analyst.l}L`,
          dynamic.total_pushbacks > 0 ? `Total disagreements this season: ${dynamic.total_pushbacks}${dynamic.last_pushback_week ? ` (last: Week ${dynamic.last_pushback_week})` : ''}` : '',
          dynamic.agreements_this_season > 0 ? `Agreements this season: ${dynamic.agreements_this_season}` : '',
          themes.entertainer_tendencies.length > 0 ? `Entertainer tendencies: ${themes.entertainer_tendencies.join('; ')}` : '',
          themes.analyst_tendencies.length > 0 ? `Analyst tendencies: ${themes.analyst_tendencies.join('; ')}` : '',
          themes.persistent_disagreements.length > 0 ? `Recurring disagreements: ${themes.persistent_disagreements.join('; ')}` : '',
        ].filter(Boolean);
        return lines.length > 1 ? lines.join('\n') : '';
      })();

      // Build roster-filtered injury string from Sleeper data (players actually on this league's rosters)
      const rosterInjuryLines = formattedInjuries.map(inj =>
        `- ${inj.playerName} (${inj.team})${inj.fantasyTeam !== 'FA' ? ` [${inj.fantasyTeam}]` : ''}: ${inj.status}`
      );
      const rosterInjuryString = rosterInjuryLines.length > 0
        ? `=== ROSTER INJURIES (players on league rosters) ===\n${rosterInjuryLines.join('\n')}\n`
        : '';

      // Team name stability block for the sync route
      const syncTeamNameBlock = (() => {
        const lines = ['=== CURRENT TEAM NAMES (may differ from historical records) ===',
          'Use [SL:username] to correlate teams across seasons if names have changed.',
          'IMPORTANT: If you see an unfamiliar team name, look for its [SL:username] match.',
        ];
        for (const u of users) {
          const meta = (u as unknown as { metadata?: { team_name?: string } }).metadata;
          const teamName = meta?.team_name || u.display_name || u.username || `User ${u.user_id}`;
          const slName = u.username || u.display_name || u.user_id;
          lines.push(`- ${teamName} [SL:${slName}]`);
        }
        return lines.join('\n');
      })();

      // Current data first — section generators slice to 2-4K chars, so standings/transactions
      // must come before static historical content or they get cut off
      enhancedContext.enhancedContextString = [
        syncTeamNameBlock,
        currentStandingsString,
        transactionsString,
        rosterInjuryString,
        dynastyRankingsStr,
        externalDataString,
        relMemContext,
        enhancedContext.enhancedContextString || '',
        rulesString,
        comprehensiveContextString,
      ].filter(Boolean).join('\n\n');
      enhancedContext.injuries = formattedInjuries;
      console.log(`Enhanced context: standings=${enhancedContext.standings?.length || 0} teams, byes=${enhancedContext.byeTeams?.length || 0} NFL teams`);
      console.log(`Enhanced context includes: league rules, comprehensive data, current standings, transactions, external APIs (ESPN/Sleeper), H2H, trades, records, playoff implications`);
    }

    // For pre_draft, fetch standings-based draft order (Sleeper draft may not be configured yet)
    let preDraftSlots: Array<{ slot: number; team: string }> | undefined;
    let preDraftRound2Slots: Array<{ slot: number; team: string }> | undefined;
    if (episodeType === 'pre_draft') {
      console.log('[pre_draft] Fetching draft slot order from next-order route...');
      const { getNewsletterDraftOrder } = await import('@/lib/newsletter/draft-order-helper');
      const draftSlotOrder = await getNewsletterDraftOrder(seasonNum) ?? await buildSimpleDraftSlotOrder(seasonNum);
      preDraftSlots = draftSlotOrder.round1;
      preDraftRound2Slots = draftSlotOrder.round2;
      if (preDraftSlots.length > 0) {
        console.log(`[pre_draft] Draft order: ${preDraftSlots.map(s => `${s.slot}.${s.team}`).join(', ')}`);
        if (preDraftRound2Slots && preDraftRound2Slots.length > 0) {
          console.log(`[pre_draft] Round 2 order from DB (${preDraftRound2Slots.length} teams): ${preDraftRound2Slots.map(s => `${s.slot}.${s.team}`).join(', ')}`);
        } else {
          console.log('[pre_draft] No round 2 slots in DB — will compute from round 1 snake/linear');
        }
      } else {
        console.warn('[pre_draft] Could not build standings-based draft order — mock draft will use fallback');
      }
    }

    // Generate the newsletter
    // Memory is ALWAYS persisted even if compose partially fails (composeFailed flag)
    const result = await generateNewsletter({
      leagueName: leagueNameFromIngest || 'East v. West',
      leagueId,
      season: seasonNum,
      week,
      episodeType: episodeType || 'regular', // Pass episode type for special newsletters
      users,
      rosters,
      matchups,
      nextMatchups,
      transactions: transactions.map(t => ({
        ...t,
        adds: t.adds ?? undefined,
        drops: t.drops ?? undefined,
      })),
      allTransactions: allTransactions?.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
      existingMemoryEntertainer,
      existingMemoryAnalyst,
      existingRecords,
      pendingPicks: existingPendingPicks,
      enhancedContext,
      lastCallbacks, // Previous week's forecast picks for the Callbacks section
      previousNewsletter: previousNewsletter as { newsletter: { sections: Array<{ type: string; data: unknown }> } } | null,
      previousPredictions, // Pass previous predictions for narrative callbacks
      existingRelationshipMemory: relationshipMem,
      draftData: draftData ?? null,
      preDraftSlots,
      preDraftRound2Slots,
      isFirstEpisodeEver: isFirstEpisodeEver ?? false,
      tradeDynastyRankings: syncDynastyRankings.length > 0 ? syncDynastyRankings : undefined,
      tradeRosterContext: syncTradeRosterContext || undefined,
      onSectionComplete: (sectionName) => {
        void updateStagedNewsletter(seasonNum, week, {
          currentSection: sectionName,
          sectionsCompleted: undefined, // append handled below
        }).catch(() => {});
        // Append to sectionsCompleted via fire-and-forget
        void (async () => {
          try {
            const { getStagedNewsletter } = await import('@/server/db/newsletter-queries');
            const current = await getStagedNewsletter(seasonNum, week).catch(() => null);
            const existing = current?.sectionsCompleted ?? [];
            if (!existing.includes(sectionName)) {
              await updateStagedNewsletter(seasonNum, week, {
                sectionsCompleted: [...existing, sectionName],
              });
            }
          } catch { /* best-effort */ }
        })();
      },
    });

    const generatedAt = new Date().toISOString();

    // ALWAYS persist bot memories first - this is critical for personality continuity
    // Even if newsletter save fails or composeFailed is true, memory must be preserved
    try {
      // In preview mode, allow gating persistence via env (free-tier safety)
      const allowPreviewPersist = process.env.NEWSLETTER_PERSIST_IN_PREVIEW === 'true';
      if (!preview || allowPreviewPersist) {
        await Promise.all([
          saveBotMemory('entertainer', seasonNum, result.memoryEntertainer),
          saveBotMemory('analyst', seasonNum, result.memoryAnalyst),
          saveForecastRecords(seasonNum, result.records),
          savePendingPicks(seasonNum, result.pendingPicks),
          saveRelationshipMemory(seasonNum, relationshipMem),
        ]);
        console.log(`[Newsletter] Bot memory persisted - Entertainer: ${result.memoryEntertainer.summaryMood}, Analyst: ${result.memoryAnalyst.summaryMood}`);
      } else {
        console.log('[PREVIEW] Skipping DB persistence for bot memory/records (NEWSLETTER_PERSIST_IN_PREVIEW != true)');
      }
    } catch (memoryError) {
      console.error('[Newsletter] CRITICAL: Failed to persist bot memory:', memoryError);
      // Continue - we still want to return the result even if persistence failed
    }

    // Log if compose had issues but still produced a result
    if (result.composeFailed) {
      console.warn(`[Newsletter] Compose had errors but memory was preserved. Newsletter may have fallback content.`);
    }

    // In preview mode, don't save newsletter to database - just return the result for testing
    if (preview) {
      console.log(`[PREVIEW] Newsletter generated for Season ${season} Week ${week} (not saved)`);
      
      // Type-safe section access
      type NewsletterSection = { type: string; data: unknown };
      const sections = result.newsletter.sections as NewsletterSection[];

      return NextResponse.json({
        success: true,
        preview: true,
        newsletter: result.newsletter,
        html: result.html,
        generatedAt,
        fromCache: false,
        stats: {
          matchups: (sections.find(s => s.type === 'MatchupRecaps')?.data as unknown[] | undefined)?.length || 0,
          trades: (sections.find(s => s.type === 'Trades')?.data as unknown[] | undefined)?.length || 0,
          waivers: (sections.find(s => s.type === 'WaiversAndFA')?.data as unknown[] | undefined)?.length || 0,
        },
        memory: {
          entertainer: { 
            mood: result.memoryEntertainer.summaryMood, 
            teamsTracked: Object.keys(result.memoryEntertainer.teams).length,
            teams: result.memoryEntertainer.teams, // Include full team data in preview
          },
          analyst: { 
            mood: result.memoryAnalyst.summaryMood, 
            teamsTracked: Object.keys(result.memoryAnalyst.teams).length,
            teams: result.memoryAnalyst.teams,
          },
        },
        message: 'PREVIEW MODE: Newsletter generated but NOT saved. Users cannot see this.',
      });
    }

    // Quality gate: scan for unresolved Sleeper player IDs before publishing
    const playerIdWarnings = scanForUnresolvedPlayerIds(result.html);
    if (playerIdWarnings.length > 0) {
      console.warn(`[Newsletter] Quality gate: ${playerIdWarnings.length} unresolved player ID(s) found in HTML:`, playerIdWarnings);
    }

    // Save newsletter to database (memory was already persisted above)
    await saveNewsletter(seasonNum, week, leagueNameFromIngest || 'East v. West', result.newsletter as { meta: { leagueName: string; week: number; date: string; season: number }; sections: Array<{ type: string; data: unknown }> }, result.html);

    // Mark staged generation as completed (best-effort)
    void updateStagedNewsletter(seasonNum, week, { status: 'completed' }).catch(() => {});

    console.log(`Newsletter generated and saved for Season ${season} Week ${week}${result.composeFailed ? ' (with fallback content)' : ''}`);

    // Post to Discord if webhook is configured and not already posted
    const discordWebhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
    const siteUrl = process.env.SITE_URL || 'https://eastvswest.football';
    if (discordWebhookUrl) {
      try {
        const db = getDb();
        const dedupeKey = `${seasonNum}-${week}`;
        
        // Check if already posted
        const existing = await db
          .select()
          .from(discordNotifications)
          .where(and(
            eq(discordNotifications.notificationType, 'newsletter_published'),
            eq(discordNotifications.dedupeKey, dedupeKey)
          ))
          .limit(1)
          .catch(() => []);
        
        if (existing.length === 0) {
          const embed = buildNewsletterEmbed({
            season: seasonNum,
            week,
            siteUrl,
          });
          
          const discordResult = await postToDiscordWebhook(discordWebhookUrl, { embeds: [embed] });
          if (discordResult.success) {
            await db.insert(discordNotifications).values({
              notificationType: 'newsletter_published',
              dedupeKey,
              meta: { season: seasonNum, week },
            }).catch(() => {});
            console.log(`[Newsletter] Posted to Discord for Season ${seasonNum} Week ${week}`);
          } else {
            console.warn(`[Newsletter] Discord post failed: ${discordResult.error}`);
          }
        } else {
          console.log(`[Newsletter] Already posted to Discord for Season ${seasonNum} Week ${week}`);
        }
      } catch (discordErr) {
        console.warn('[Newsletter] Discord notification error (non-fatal):', discordErr);
      }
    }

    // Type-safe section access
    type NewsletterSection = { type: string; data: unknown };
    const sections = result.newsletter.sections as NewsletterSection[];

    return NextResponse.json({
      success: true,
      newsletter: result.newsletter,
      html: result.html,
      generatedAt,
      fromCache: false,
      stats: {
        matchups: (sections.find(s => s.type === 'MatchupRecaps')?.data as unknown[] | undefined)?.length || 0,
        trades: (sections.find(s => s.type === 'Trades')?.data as unknown[] | undefined)?.length || 0,
        waivers: (sections.find(s => s.type === 'WaiversAndFA')?.data as unknown[] | undefined)?.length || 0,
      },
      memory: {
        entertainer: { mood: result.memoryEntertainer.summaryMood, teamsTracked: Object.keys(result.memoryEntertainer.teams).length },
        analyst: { mood: result.memoryAnalyst.summaryMood, teamsTracked: Object.keys(result.memoryAnalyst.teams).length },
      },
    });

  } catch (error) {
    console.error('Newsletter generation error:', error);
    // Mark staged generation as failed (best-effort — we may not have seasonNum/week in scope yet)
    try {
      const body2 = await request.json().catch(() => ({})) as { week?: number; season?: string };
      const state2 = await getSleeperState().catch(() => ({ season: String(new Date().getFullYear()), week: 1 }));
      const s2 = parseInt(body2.season || state2.season, 10);
      const w2 = body2.week || state2.week;
      void updateStagedNewsletter(s2, w2, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      }).catch(() => {});
    } catch { /* best-effort */ }
    return NextResponse.json({
      success: false,
      error: 'Failed to generate newsletter',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ============ DELETE: Admin can delete newsletters ============

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');
  const seasonParam = searchParams.get('season');

  if (!weekParam || !seasonParam) {
    return NextResponse.json({
      success: false,
      error: 'Both week and season parameters are required',
    }, { status: 400 });
  }

  const week = parseInt(weekParam, 10);
  const season = parseInt(seasonParam, 10);

  try {
    await deleteNewsletter(season, week);
    return NextResponse.json({
      success: true,
      message: `Deleted newsletter for Season ${season} Week ${week}`,
    });
  } catch (error) {
    console.error('Newsletter delete error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete newsletter',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

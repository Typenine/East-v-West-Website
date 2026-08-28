import { TEAM_CARD_TOOL_META } from '@/lib/mcp/widgets/team-card';
import { TRADE_ANALYZER_TOOL_META } from '@/lib/mcp/widgets/trade-analyzer';
import { TEAM_COMPARE_TOOL_META } from '@/lib/mcp/widgets/team-compare';
import { TRADE_BLOCK_TOOL_META } from '@/lib/mcp/widgets/trade-block';
import { DRAFT_BOARD_TOOL_META } from '@/lib/mcp/widgets/draft-board';
import { PICK_BOARD_TOOL_META } from '@/lib/mcp/widgets/pick-board';
import { FRANCHISE_CASE_TOOL_META } from '@/lib/mcp/widgets/franchise-case';
import { ROSTER_STRENGTH_TOOL_META } from '@/lib/mcp/widgets/roster-strength';
import {
  handleGetLeagueInfo, handleGetStandings, handleGetTeam, handleGetRosters, handleGetPlayer,
  handleGetMatchups, handleGetTransactions, handleGetTrades, handleGetDrafts, handleGetFranchise,
  handleGetRules, handleGetWeeklyContext, formatStandingsMarkdown, formatTeamMarkdown,
  formatMatchupsMarkdown, formatFranchiseMarkdown, formatWeeklyContextMarkdown, formatDraftPicksMarkdown,
  formatTradeHistoryMarkdown, formatRuleAnswerMarkdown, formatRosterMarkdown, handleGetCommissionerOps,
  formatCommissionerOpsMarkdown, handleGetLeagueOverview, handleGetPositionRooms, handleCompareTeams,
  handleGetFuturePickBoard, formatLeagueOverviewMarkdown, formatPositionRoomsMarkdown, formatCompareTeamsMarkdown,
  formatFuturePickBoardMarkdown, handleAnalyzeTrade, handleGetPlayerValues, handleGetTradeBlock,
  handleGetPowerRankings, handleAnalyzeRoster, formatAnalyzeTradeMarkdown, formatPlayerValuesMarkdown,
  formatTradeBlockMarkdown, formatPowerRankingsMarkdown, formatAnalyzeRosterMarkdown, McpError,
} from '@/lib/mcp/handlers';
import {
  handleGetLeagueDataModelV2, handleSearchEvwPlayersV2, handleGetFranchiseHistoryV2,
  handleGetWeekGamebookV2,
} from '@/lib/mcp/v2-handlers';
import {
  handleGetEvwPlayerResearch,
  handleGetLeagueAwardsResearch,
  handleGetLeagueRecordsResearch,
  handleQueryStatsResearch,
  handleResolveEntity,
  handleGetPlayerOwnershipTimeline,
  handleGetRosterSnapshot,
  handleGetTradeTreeResearch,
  handleGetTransactionIntelligence,
  handleGetRivalry,
  handleGetSeasonArchiveResearch,
  handleGetResearchBackendStatus,
} from '@/lib/mcp/research-backend';
import { handleGetHallOfFame, handleGetLeagueMilestones } from '@/lib/mcp/history-handlers';

export type ToolInput = Record<string, unknown>;
export type DispatchResult = { structuredContent: unknown; markdown: string | null; _meta?: Record<string, unknown> };

export async function dispatchTool(name: string, input: ToolInput): Promise<DispatchResult> {
  switch (name) {
    case 'get_current_standings': {
      const data = await handleGetStandings();
      const md = formatStandingsMarkdown(
        (data as { currentSeasonStandings: Parameters<typeof formatStandingsMarkdown>[0] }).currentSeasonStandings,
        (data as { meta: { currentSeason?: string } }).meta?.currentSeason ?? String(new Date().getFullYear()),
      );
      return { structuredContent: data, markdown: md };
    }
    case 'get_team_dashboard': {
      const data = await handleGetTeam({ name: input.name as string | undefined });
      return { structuredContent: data, markdown: formatTeamMarkdown(data as Parameters<typeof formatTeamMarkdown>[0]), _meta: TEAM_CARD_TOOL_META };
    }
    case 'show_team_card': {
      const data = await handleGetTeam({ name: input.name as string | undefined });
      return { structuredContent: data, markdown: formatTeamMarkdown(data as Parameters<typeof formatTeamMarkdown>[0]), _meta: TEAM_CARD_TOOL_META };
    }
    case 'get_current_matchups': {
      const data = await handleGetMatchups({ week: input.week as number | undefined });
      const d = data as { week: number; matchups: Parameters<typeof formatMatchupsMarkdown>[0]; meta: { nflSeason?: string } };
      return { structuredContent: data, markdown: formatMatchupsMarkdown(d.matchups, d.week, d.meta?.nflSeason ?? String(new Date().getFullYear())) };
    }
    case 'get_league_info': return { structuredContent: await handleGetLeagueInfo(), markdown: null };
    case 'get_current_roster': {
      const data = await handleGetRosters({ team: input.team as string | undefined });
      const md = formatRosterMarkdown(data as Parameters<typeof formatRosterMarkdown>[0]);
      return { structuredContent: data, markdown: md ?? ((data as { rosters: unknown[] }).rosters.length > 1 ? `*Showing all ${(data as { rosters: unknown[] }).rosters.length} team rosters as JSON. Use \`team\` param to get a formatted card for one team.*\n\n${JSON.stringify(data)}` : JSON.stringify(data)) };
    }
    case 'search_players': return { structuredContent: await handleGetPlayer({ name: input.name as string | undefined, limit: input.limit as number | undefined }), markdown: null };
    case 'get_player_info': return { structuredContent: await handleGetPlayer({ id: input.id as string | undefined }), markdown: null };
    case 'get_recent_transactions': return { structuredContent: await handleGetTransactions({ limit: input.limit as number | undefined, team: input.team as string | undefined, season: input.season as string | undefined }), markdown: null };
    case 'get_trade_history': {
      const teamArg = input.team as string | undefined; const limitArg = input.limit as number | undefined;
      const data = await handleGetTrades({ team: teamArg, season: input.season as string | undefined, limit: limitArg });
      return { structuredContent: data, markdown: formatTradeHistoryMarkdown((data as { trades: Parameters<typeof formatTradeHistoryMarkdown>[0] }).trades, teamArg, Math.min(limitArg ?? 8, 8)) };
    }
    case 'get_draft_history': return { structuredContent: await handleGetDrafts({ season: input.season as string | undefined, team: input.team as string | undefined, type: input.type as string | undefined }), markdown: null, _meta: DRAFT_BOARD_TOOL_META };
    case 'get_draft_picks': {
      const teamArg = input.team as string | undefined; const data = await handleGetDrafts({ team: teamArg, type: 'future' });
      return { structuredContent: data, markdown: formatDraftPicksMarkdown((data as { futurePickOwnership: Parameters<typeof formatDraftPicksMarkdown>[0] }).futurePickOwnership, teamArg) };
    }
    case 'get_franchise_summary': {
      const data = await handleGetFranchise({ team: input.team as string | undefined });
      return { structuredContent: data, markdown: formatFranchiseMarkdown((data as { franchises: Parameters<typeof formatFranchiseMarkdown>[0] }).franchises), _meta: FRANCHISE_CASE_TOOL_META };
    }
    case 'answer_rule_question': {
      const data = await handleGetRules({ search: input.search as string | undefined, section: input.section as string | undefined });
      return { structuredContent: data, markdown: formatRuleAnswerMarkdown(data as Parameters<typeof formatRuleAnswerMarkdown>[0]) };
    }
    case 'get_weekly_content_context': { const data = await handleGetWeeklyContext(); return { structuredContent: data, markdown: formatWeeklyContextMarkdown(data as Parameters<typeof formatWeeklyContextMarkdown>[0]) }; }
    case 'get_commissioner_ops_context': { const data = await handleGetCommissionerOps(); return { structuredContent: data, markdown: formatCommissionerOpsMarkdown(data) }; }
    case 'get_league_overview': { const data = await handleGetLeagueOverview(); return { structuredContent: data, markdown: formatLeagueOverviewMarkdown(data) }; }
    case 'get_position_rooms': { const data = await handleGetPositionRooms({ team: input.team as string | undefined, position: input.position as string | undefined }); return { structuredContent: data, markdown: formatPositionRoomsMarkdown(data) }; }
    case 'compare_teams': { const data = await handleCompareTeams({ team1: input.team1 as string | undefined, team2: input.team2 as string | undefined }); return { structuredContent: data, markdown: formatCompareTeamsMarkdown(data), _meta: TEAM_COMPARE_TOOL_META }; }
    case 'get_future_pick_board': { const data = await handleGetFuturePickBoard(); return { structuredContent: data, markdown: formatFuturePickBoardMarkdown(data), _meta: PICK_BOARD_TOOL_META }; }
    case 'get_trade_block': { const data = await handleGetTradeBlock({ team: input.team as string | undefined }); return { structuredContent: data, markdown: formatTradeBlockMarkdown(data), _meta: TRADE_BLOCK_TOOL_META }; }
    case 'get_power_rankings': { const data = await handleGetPowerRankings(); return { structuredContent: data, markdown: formatPowerRankingsMarkdown(data) }; }
    case 'analyze_roster': { const data = await handleAnalyzeRoster({ name: input.name as string | undefined }); return { structuredContent: data, markdown: formatAnalyzeRosterMarkdown(data), _meta: ROSTER_STRENGTH_TOOL_META }; }
    case 'analyze_trade': { const data = await handleAnalyzeTrade({ side_a: input.side_a as string[], side_b: input.side_b as string[], source: input.source as 'avg' | 'fc' | 'ktc' | undefined }); return { structuredContent: data, markdown: formatAnalyzeTradeMarkdown(data), _meta: TRADE_ANALYZER_TOOL_META }; }
    case 'get_player_values': { const data = await handleGetPlayerValues({ players: input.players as string[] }); return { structuredContent: data, markdown: formatPlayerValuesMarkdown(data) }; }

    case 'get_league_data_model': return { structuredContent: await handleGetLeagueDataModelV2(), markdown: null };
    case 'get_evw_player': return { structuredContent: await handleGetEvwPlayerResearch(input), markdown: null };
    case 'search_evw_players': return { structuredContent: await handleSearchEvwPlayersV2(input), markdown: null };
    case 'get_franchise_history': return { structuredContent: await handleGetFranchiseHistoryV2(input), markdown: null };
    case 'get_league_records': return { structuredContent: await handleGetLeagueRecordsResearch(input), markdown: null };
    case 'get_season_archive': return { structuredContent: await handleGetSeasonArchiveResearch(input), markdown: null };
    case 'get_week_gamebook': return { structuredContent: await handleGetWeekGamebookV2(input), markdown: null };
    case 'get_league_awards': return { structuredContent: await handleGetLeagueAwardsResearch(input), markdown: null };
    case 'get_league_milestones': return { structuredContent: await handleGetLeagueMilestones(input), markdown: null };
    case 'get_hall_of_fame': return { structuredContent: await handleGetHallOfFame(input), markdown: null };
    case 'query_stats': return { structuredContent: await handleQueryStatsResearch(input), markdown: null };
    case 'resolve_entity': return { structuredContent: await handleResolveEntity(input), markdown: null };
    case 'get_player_ownership_timeline': return { structuredContent: await handleGetPlayerOwnershipTimeline(input), markdown: null };
    case 'get_roster_snapshot': return { structuredContent: await handleGetRosterSnapshot(input), markdown: null };
    case 'get_trade_tree': return { structuredContent: await handleGetTradeTreeResearch(input), markdown: null };
    case 'get_transaction_intelligence': return { structuredContent: await handleGetTransactionIntelligence(input), markdown: null };
    case 'get_rivalry': return { structuredContent: await handleGetRivalry(input), markdown: null };
    case 'get_research_backend_status': return { structuredContent: await handleGetResearchBackendStatus(), markdown: null };
    default: throw new McpError('method_not_found', `Unknown tool: ${name}`);
  }
}

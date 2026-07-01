import { TEAM_CARD_OUTPUT_SCHEMA, TEAM_CARD_TOOL_META } from '@/lib/mcp/widgets/team-card';
import { TRADE_ANALYZER_OUTPUT_SCHEMA, TRADE_ANALYZER_TOOL_META } from '@/lib/mcp/widgets/trade-analyzer';
import { TEAM_COMPARE_OUTPUT_SCHEMA, TEAM_COMPARE_TOOL_META } from '@/lib/mcp/widgets/team-compare';
import { TRADE_BLOCK_OUTPUT_SCHEMA, TRADE_BLOCK_TOOL_META } from '@/lib/mcp/widgets/trade-block';
import { DRAFT_BOARD_OUTPUT_SCHEMA, DRAFT_BOARD_TOOL_META } from '@/lib/mcp/widgets/draft-board';
import { PICK_BOARD_OUTPUT_SCHEMA, PICK_BOARD_TOOL_META } from '@/lib/mcp/widgets/pick-board';
import { FRANCHISE_CASE_OUTPUT_SCHEMA, FRANCHISE_CASE_TOOL_META } from '@/lib/mcp/widgets/franchise-case';
import { ROSTER_STRENGTH_OUTPUT_SCHEMA, ROSTER_STRENGTH_TOOL_META } from '@/lib/mcp/widgets/roster-strength';

type Property = Record<string, unknown>;
const objectInput = (properties: Record<string, Property> = {}, required: string[] = []) => ({
  type: 'object', properties, required,
});
const stringProp = (description: string) => ({ type: 'string', description });
const numberProp = (description: string) => ({ type: 'number', description });
const tool = (name: string, description: string, inputSchema = objectInput()) => ({ name, description, inputSchema });

export const MCP_TOOLS = [
  tool('get_league_info', 'Returns East v. West league rules, scoring, roster settings, payouts, dates, and champions.'),
  tool('get_current_standings', 'Returns live current-season standings and all-time franchise standings.'),
  tool('get_team_dashboard', 'Returns one team record, full roster, all-time stats, and championship history.', objectInput({ name: stringProp('Team name or alias.') }, ['name'])),
  {
    ...tool('show_team_card', 'Renders the visual East v. West Team Card for one team. Use when the user asks to show, display, open, or render a team card.', objectInput({ name: stringProp('Team name or alias.') }, ['name'])),
    _meta: TEAM_CARD_TOOL_META,
    outputSchema: TEAM_CARD_OUTPUT_SCHEMA,
  },
  tool('get_current_roster', 'Returns current rosters for all teams or one team.', objectInput({ team: stringProp('Optional team filter.') })),
  tool('search_players', 'Searches Sleeper players by name.', objectInput({ name: stringProp('Player name.'), limit: numberProp('Maximum results, up to 20.') }, ['name'])),
  tool('get_player_info', 'Returns one player profile and fantasy owner.', objectInput({ id: stringProp('Sleeper player ID.') }, ['id'])),
  tool('get_current_matchups', 'Returns current fantasy matchups and scores.', objectInput({ week: numberProp('Optional NFL week.') })),
  tool('get_recent_transactions', 'Returns recent waiver and free-agent moves.', objectInput({ limit: numberProp('Maximum results.'), team: stringProp('Optional team filter.'), season: stringProp('Optional season.') })),
  tool('get_trade_history', 'Returns trade history with players and picks.', objectInput({ team: stringProp('Optional team filter.'), season: stringProp('Optional season.'), limit: numberProp('Maximum trades.') })),
  {
    ...tool('get_draft_history', 'Returns completed draft history and future-pick ownership. Renders a visual round-by-round draft board.', objectInput({ season: stringProp('Optional season.'), team: stringProp('Optional team filter.'), type: { type: 'string', enum: ['history', 'future'] } })),
    _meta: DRAFT_BOARD_TOOL_META,
    outputSchema: DRAFT_BOARD_OUTPUT_SCHEMA,
  },
  tool('get_draft_picks', 'Returns future draft-pick ownership.', objectInput({ team: stringProp('Optional team filter.') })),
  {
    ...tool('get_franchise_summary', 'Returns all-time franchise records and championships. Renders a visual trophy-case ranking.', objectInput({ team: stringProp('Optional team filter.') })),
    _meta: FRANCHISE_CASE_TOOL_META,
    outputSchema: FRANCHISE_CASE_OUTPUT_SCHEMA,
  },
  tool('answer_rule_question', 'Searches or opens East v. West rulebook sections.', objectInput({ search: stringProp('Optional keyword.'), section: stringProp('Optional section ID.') })),
  tool('get_weekly_content_context', 'Returns the weekly league content briefing.'),
  tool('get_commissioner_ops_context', 'Returns the read-only commissioner operations briefing.'),
  tool('get_league_overview', 'Returns a complete all-team league snapshot.'),
  tool('get_position_rooms', 'Returns roster position groups.', objectInput({ team: stringProp('Optional team filter.'), position: stringProp('Optional position filter.') })),
  {
    ...tool('compare_teams', 'Compares exactly two teams. Renders a visual head-to-head comparison card.', objectInput({ team1: stringProp('First team.'), team2: stringProp('Second team.') }, ['team1', 'team2'])),
    _meta: TEAM_COMPARE_TOOL_META,
    outputSchema: TEAM_COMPARE_OUTPUT_SCHEMA,
  },
  {
    ...tool('get_future_pick_board', 'Returns future draft picks organized by team. Renders a visual pick board.'),
    _meta: PICK_BOARD_TOOL_META,
    outputSchema: PICK_BOARD_OUTPUT_SCHEMA,
  },
  {
    ...tool('get_trade_block', 'Returns the current trade block. Renders a visual trade-block board.', objectInput({ team: stringProp('Optional team filter.') })),
    _meta: TRADE_BLOCK_TOOL_META,
    outputSchema: TRADE_BLOCK_OUTPUT_SCHEMA,
  },
  tool('get_power_rankings', 'Returns current power rankings.'),
  {
    ...tool('analyze_roster', 'Returns a roster-strength analysis for one team. Renders a visual position-strength breakdown.', objectInput({ name: stringProp('Team name or alias.') }, ['name'])),
    _meta: ROSTER_STRENGTH_TOOL_META,
    outputSchema: ROSTER_STRENGTH_OUTPUT_SCHEMA,
  },
  {
    ...tool('analyze_trade', 'Analyzes two trade sides using available value sources. Renders a visual side-by-side trade grade.', objectInput({
      side_a: { type: 'array', items: { type: 'string' } },
      side_b: { type: 'array', items: { type: 'string' } },
      source: { type: 'string', enum: ['avg', 'fc', 'ktc'] },
    }, ['side_a', 'side_b'])),
    _meta: TRADE_ANALYZER_TOOL_META,
    outputSchema: TRADE_ANALYZER_OUTPUT_SCHEMA,
  },
  tool('get_player_values', 'Returns dynasty values for named players or picks.', objectInput({ players: { type: 'array', items: { type: 'string' } } }, ['players'])),
] as const;

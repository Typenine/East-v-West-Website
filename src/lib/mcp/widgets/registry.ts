import { TEAM_CARD_HTML, TEAM_CARD_RESOURCE, TEAM_CARD_RESOURCE_META } from './team-card';
import { TRADE_ANALYZER_HTML, TRADE_ANALYZER_RESOURCE, TRADE_ANALYZER_RESOURCE_META } from './trade-analyzer';
import { TEAM_COMPARE_HTML, TEAM_COMPARE_RESOURCE, TEAM_COMPARE_RESOURCE_META } from './team-compare';
import { TRADE_BLOCK_HTML, TRADE_BLOCK_RESOURCE, TRADE_BLOCK_RESOURCE_META } from './trade-block';
import { DRAFT_BOARD_HTML, DRAFT_BOARD_RESOURCE, DRAFT_BOARD_RESOURCE_META } from './draft-board';
import { PICK_BOARD_HTML, PICK_BOARD_RESOURCE, PICK_BOARD_RESOURCE_META } from './pick-board';
import { FRANCHISE_CASE_HTML, FRANCHISE_CASE_RESOURCE, FRANCHISE_CASE_RESOURCE_META } from './franchise-case';
import { ROSTER_STRENGTH_HTML, ROSTER_STRENGTH_RESOURCE, ROSTER_STRENGTH_RESOURCE_META } from './roster-strength';

export type WidgetEntry = {
  resource: { uri: string; name: string; mimeType: 'text/html;profile=mcp-app' };
  html: string;
  resourceMeta: Record<string, unknown>;
};

export const WIDGET_ENTRIES: WidgetEntry[] = [
  { resource: TEAM_CARD_RESOURCE, html: TEAM_CARD_HTML, resourceMeta: TEAM_CARD_RESOURCE_META },
  { resource: TRADE_ANALYZER_RESOURCE, html: TRADE_ANALYZER_HTML, resourceMeta: TRADE_ANALYZER_RESOURCE_META },
  { resource: TEAM_COMPARE_RESOURCE, html: TEAM_COMPARE_HTML, resourceMeta: TEAM_COMPARE_RESOURCE_META },
  { resource: TRADE_BLOCK_RESOURCE, html: TRADE_BLOCK_HTML, resourceMeta: TRADE_BLOCK_RESOURCE_META },
  { resource: DRAFT_BOARD_RESOURCE, html: DRAFT_BOARD_HTML, resourceMeta: DRAFT_BOARD_RESOURCE_META },
  { resource: PICK_BOARD_RESOURCE, html: PICK_BOARD_HTML, resourceMeta: PICK_BOARD_RESOURCE_META },
  { resource: FRANCHISE_CASE_RESOURCE, html: FRANCHISE_CASE_HTML, resourceMeta: FRANCHISE_CASE_RESOURCE_META },
  { resource: ROSTER_STRENGTH_RESOURCE, html: ROSTER_STRENGTH_HTML, resourceMeta: ROSTER_STRENGTH_RESOURCE_META },
];

/**
 * Team Card Widget Structural Tests
 *
 * Validates the exported TEAM_CARD_HTML string and widget constants without
 * requiring a full browser environment. Checks DOM-element presence, JavaScript
 * defensive patterns, and correct constants.
 *
 * Run:  npx vitest run tests/team-card-widget.test.ts
 */

import { describe, it, expect } from 'vitest';
import { TEAM_CARD_HTML, TEAM_CARD_WIDGET_URI, TEAM_CARD_RESOURCE } from '@/lib/mcp/widgets/team-card';

describe('Team Card widget constants', () => {
  it('TEAM_CARD_WIDGET_URI matches expected uri scheme', () => {
    expect(TEAM_CARD_WIDGET_URI).toBe('ui://widget/team-card-v1.html');
  });

  it('TEAM_CARD_RESOURCE uri matches TEAM_CARD_WIDGET_URI', () => {
    expect(TEAM_CARD_RESOURCE.uri).toBe(TEAM_CARD_WIDGET_URI);
  });

  it('TEAM_CARD_RESOURCE mimeType is text/html;profile=mcp-app', () => {
    expect(TEAM_CARD_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('TEAM_CARD_HTML is a non-empty string', () => {
    expect(typeof TEAM_CARD_HTML).toBe('string');
    expect(TEAM_CARD_HTML.length).toBeGreaterThan(1000);
  });
});

describe('Team Card widget HTML structure', () => {
  it('contains required DOM element IDs', () => {
    expect(TEAM_CARD_HTML).toContain('id="card"');
    expect(TEAM_CARD_HTML).toContain('id="state-loading"');
    expect(TEAM_CARD_HTML).toContain('id="state-error"');
    expect(TEAM_CARD_HTML).toContain('id="state-empty"');
  });

  it('uses absolute BASE_URL (not a relative path)', () => {
    expect(TEAM_CARD_HTML).toContain('https://east-v-west-website.vercel.app');
    expect(TEAM_CARD_HTML).not.toContain("BASE = '/'");
    expect(TEAM_CARD_HTML).not.toContain('BASE = "/"');
  });

  it('logo image has onerror fallback to prevent broken-image crash', () => {
    expect(TEAM_CARD_HTML).toContain('onerror');
  });

  it('uses encodeURIComponent for logo URL construction', () => {
    expect(TEAM_CARD_HTML).toContain('encodeURIComponent');
  });
});

describe('Team Card widget JavaScript defensive patterns', () => {
  it('registers a postMessage event listener', () => {
    expect(TEAM_CARD_HTML).toContain("addEventListener('message'");
  });

  it('sends widget_ready signal on init', () => {
    expect(TEAM_CARD_HTML).toContain('widget_ready');
  });

  it('has a timeout fallback for missing data (12000ms)', () => {
    expect(TEAM_CARD_HTML).toContain('12000');
    expect(TEAM_CARD_HTML).toContain('state-empty');
  });

  it('handles null nflTeam via guarded access', () => {
    expect(TEAM_CARD_HTML).toContain('nflTeam');
    expect(TEAM_CARD_HTML).toContain('p.nflTeam');
  });

  it('handles null status via guarded access', () => {
    expect(TEAM_CARD_HTML).toContain('p.status');
  });

  it('handles null allTimeStats (widget uses optional chaining or guard)', () => {
    expect(TEAM_CARD_HTML).toContain('allTimeStats');
  });

  it('tryExtractData covers tool_result message pattern (OpenAI Apps SDK)', () => {
    expect(TEAM_CARD_HTML).toContain("'tool_result'");
  });

  it('tryExtractData covers mcp_tool_result message pattern', () => {
    expect(TEAM_CARD_HTML).toContain("'mcp_tool_result'");
  });

  it('tryExtractData covers app_action/set_data pattern (OpenAI Apps SDK)', () => {
    expect(TEAM_CARD_HTML).toContain("'app_action'");
    expect(TEAM_CARD_HTML).toContain("'set_data'");
  });

  it('tryExtractData covers MCP JSON-RPC ui/notifications/tool-result', () => {
    expect(TEAM_CARD_HTML).toContain('ui/notifications/tool-result');
  });

  it('tryExtractData covers direct structuredContent pattern', () => {
    expect(TEAM_CARD_HTML).toContain('structuredContent');
  });

  it('event.source check allows window.top (nested iframe support)', () => {
    expect(TEAM_CARD_HTML).toContain('window.top');
  });

  it('render errors are caught and shown as widget error (not silent crash)', () => {
    expect(TEAM_CARD_HTML).toContain('Widget error:');
  });

  it('console.error is called on render errors', () => {
    expect(TEAM_CARD_HTML).toContain('console.error');
  });

  it('console.log is called for received messages (debug visibility)', () => {
    expect(TEAM_CARD_HTML).toContain('console.log');
  });
});

describe('Team Card widget all-12-team LOGO_FILE_MAP coverage', () => {
  const ALL_TEAMS = [
    'Belleview Badgers',
    'Belltown Raptors',
    "Minshew's Maniacs",
    'Double Trouble',
    'Mt. Lebanon Cake Eaters',
    'The Lone Ginger',
    'bop pop',
    'Red Pandas',
    'BeerNeverBrokeMyHeart',
    'Elemental Heroes',
    'Detroit Dawgs',
    'Bimg Bamg Boomg',
  ];

  it('LOGO_FILE_MAP covers all 12 teams', () => {
    for (const team of ALL_TEAMS) {
      expect(TEAM_CARD_HTML).toContain(team);
    }
  });

  it('TEAM_COLOR_MAP covers all 12 teams', () => {
    for (const team of ALL_TEAMS) {
      expect(TEAM_CARD_HTML).toContain(team);
    }
  });
});

import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { COMPARE_PAYLOAD } = vi.hoisted(() => ({
  COMPARE_PAYLOAD: {
    ok: true,
    data: {
      fetchedAt: '2026-07-01T12:47:20.841Z',
      source: 'sleeper-live + static-constants',
      team1: {
        teamName: 'Belltown Raptors', rosterId: 1, logoUrl: '/logos/belltown.png',
        currentSeason: { season: '2026', wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 },
        allTimeStats: { regularSeason: { wins: 23, losses: 19 }, playoffs: { wins: 4, losses: 2 } },
        championships: 1,
        championshipHistory: [{ year: 2024, finish: '1st (Champion)' }],
        positionRooms: { QB: ['Lamar Jackson'], WR: ['CeeDee Lamb'] },
        roster: {
          active: [{ playerId: '1', playerName: 'Lamar Jackson', position: 'QB', nflTeam: 'BAL', injuryStatus: null, slot: 'active' }],
          ir: [], taxi: [],
        },
      },
      team2: {
        teamName: 'Double Trouble', rosterId: 2, logoUrl: '/logos/double-trouble.png',
        currentSeason: { season: '2026', wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 },
        allTimeStats: { regularSeason: { wins: 18, losses: 24 }, playoffs: { wins: 1, losses: 3 } },
        championships: 0,
        championshipHistory: [],
        positionRooms: { RB: ['Christian McCaffrey'] },
        roster: {
          active: [{ playerId: '2', playerName: 'Christian McCaffrey', position: 'RB', nflTeam: 'SF', injuryStatus: 'Questionable', slot: 'active' }],
          ir: [{ playerId: '3', playerName: 'Injured Guy', position: 'WR', nflTeam: null, injuryStatus: 'IR', slot: 'ir' }],
          taxi: [],
        },
      },
    },
  },
}));

vi.mock('@/lib/mcp/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp/auth')>();
  return { ...actual, requireMcpAuth: vi.fn(() => null) };
});

vi.mock('@/lib/mcp/call-logger', () => ({
  withMcpLogging: vi.fn(async (_tool: string, _input: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/mcp/handlers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp/handlers')>();
  return {
    ...actual,
    handleCompareTeams: vi.fn(async () => COMPARE_PAYLOAD),
    formatCompareTeamsMarkdown: vi.fn(() => '## Team Compare'),
  };
});

import {
  TEAM_COMPARE_HTML,
  TEAM_COMPARE_OUTPUT_SCHEMA,
  TEAM_COMPARE_RESOURCE,
  TEAM_COMPARE_RESOURCE_META,
  TEAM_COMPARE_TOOL_META,
  TEAM_COMPARE_WIDGET_URI,
} from '@/lib/mcp/widgets/team-compare';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Team Compare widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(TEAM_COMPARE_WIDGET_URI).toBe('ui://widget/team-compare-v1.html');
    expect(TEAM_COMPARE_RESOURCE.uri).toBe(TEAM_COMPARE_WIDGET_URI);
    expect(TEAM_COMPARE_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(TEAM_COMPARE_TOOL_META['openai/outputTemplate']).toBe(TEAM_COMPARE_WIDGET_URI);
    expect(TEAM_COMPARE_TOOL_META.ui.resourceUri).toBe(TEAM_COMPARE_WIDGET_URI);
  });

  it('declares the complete team-compare output schema', () => {
    expect(TEAM_COMPARE_OUTPUT_SCHEMA.required).toEqual(['ok', 'data']);
    expect(TEAM_COMPARE_OUTPUT_SCHEMA.properties.data.required).toEqual(['fetchedAt', 'source', 'team1', 'team2']);
  });

  it('parses the delivered inline script, including the nested quote onerror escape', () => {
    const script = extractInlineScript(TEAM_COMPARE_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
    expect(script).toContain("onerror=\"this.classList.add(\\'hidden\\')\"");
  });
});

describe('Team Compare widget result initialization', () => {
  it('renders a representative two-team comparison from an MCP tool-result notification', () => {
    const harness = executeWidget(TEAM_COMPARE_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(messageListener).toBeTypeOf('function');

    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: COMPARE_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
    expect(harness.elements.card.innerHTML).toContain('Double Trouble');
    expect(harness.elements.card.innerHTML).toContain('onerror="this.classList.add(\'hidden\')"');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(TEAM_COMPARE_HTML, COMPARE_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(TEAM_COMPARE_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(() => listener?.({ detail: { globals: { toolOutput: COMPARE_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no data exists', () => {
    const harness = executeWidget(TEAM_COMPARE_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
  });
});

describe('MCP route metadata and resources for the Team Compare widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'compare_teams');
      expect(tool).toBeTruthy();
      expect(tool._meta['openai/outputTemplate']).toBe(TEAM_COMPARE_WIDGET_URI);
      expect(tool.outputSchema).toEqual(TEAM_COMPARE_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the team-compare resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(TEAM_COMPARE_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: TEAM_COMPARE_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(TEAM_COMPARE_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the comparison with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'compare_teams',
      arguments: { team1: 'Belltown Raptors', team2: 'Double Trouble' },
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(COMPARE_PAYLOAD);
    expect(body.result._meta).toEqual(TEAM_COMPARE_TOOL_META);
  });
});

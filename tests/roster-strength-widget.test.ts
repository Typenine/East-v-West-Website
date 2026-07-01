import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { ROSTER_STRENGTH_PAYLOAD } = vi.hoisted(() => ({
  ROSTER_STRENGTH_PAYLOAD: {
    ok: true,
    data: {
      fetchedAt: '2026-07-01T12:47:20.841Z',
      source: 'sleeper-live + trade-values',
      teamName: 'Belltown Raptors',
      totalDynastyValue: 42000,
      positionSummary: {
        QB: { count: 1, totalValue: 8000, topPlayer: 'Lamar Jackson' },
        RB: { count: 2, totalValue: 9000, topPlayer: 'Bijan Robinson' },
        WR: { count: 3, totalValue: 15000, topPlayer: 'Puka Nacua' },
        TE: { count: 1, totalValue: 3000, topPlayer: 'Trey McBride' },
      },
      positions: {
        QB: [{ name: 'Lamar Jackson', value: 8000, rank: 1, trend: 120, nflTeam: 'BAL' }],
        WR: [{ name: 'Puka Nacua', value: 8000, rank: 2, trend: -50, nflTeam: 'LAR' }],
      },
      strengths: ['WR', 'RB'],
      weaknesses: ['TE', 'QB'],
      valuesAvailable: true,
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
    handleAnalyzeRoster: vi.fn(async () => ROSTER_STRENGTH_PAYLOAD),
    formatAnalyzeRosterMarkdown: vi.fn(() => '## Roster Strength'),
  };
});

import {
  ROSTER_STRENGTH_HTML,
  ROSTER_STRENGTH_OUTPUT_SCHEMA,
  ROSTER_STRENGTH_RESOURCE,
  ROSTER_STRENGTH_RESOURCE_META,
  ROSTER_STRENGTH_TOOL_META,
  ROSTER_STRENGTH_WIDGET_URI,
} from '@/lib/mcp/widgets/roster-strength';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Roster Strength widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(ROSTER_STRENGTH_WIDGET_URI).toBe('ui://widget/roster-strength-v1.html');
    expect(ROSTER_STRENGTH_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(ROSTER_STRENGTH_TOOL_META['openai/outputTemplate']).toBe(ROSTER_STRENGTH_WIDGET_URI);
    expect(ROSTER_STRENGTH_TOOL_META.ui.resourceUri).toBe(ROSTER_STRENGTH_WIDGET_URI);
  });

  it('declares the complete roster-strength output schema', () => {
    expect(ROSTER_STRENGTH_OUTPUT_SCHEMA.required).toEqual(['ok', 'data']);
    expect(ROSTER_STRENGTH_OUTPUT_SCHEMA.properties.data.properties.positionSummary.required).toEqual(['QB', 'RB', 'WR', 'TE']);
  });

  it('parses the delivered inline script', () => {
    const script = extractInlineScript(ROSTER_STRENGTH_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
  });
});

describe('Roster Strength widget result initialization', () => {
  it('renders a representative roster-strength payload from an MCP tool-result notification', () => {
    const harness = executeWidget(ROSTER_STRENGTH_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: ROSTER_STRENGTH_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
    expect(harness.elements.card.innerHTML).toContain('Lamar Jackson');
    expect(harness.elements.card.innerHTML).toContain('WR strength');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(ROSTER_STRENGTH_HTML, ROSTER_STRENGTH_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(ROSTER_STRENGTH_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(() => listener?.({ detail: { globals: { toolOutput: ROSTER_STRENGTH_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no data exists', () => {
    const harness = executeWidget(ROSTER_STRENGTH_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
  });
});

describe('MCP route metadata and resources for the Roster Strength widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'analyze_roster');
      expect(tool._meta['openai/outputTemplate']).toBe(ROSTER_STRENGTH_WIDGET_URI);
      expect(tool.outputSchema).toEqual(ROSTER_STRENGTH_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the roster-strength resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(ROSTER_STRENGTH_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: ROSTER_STRENGTH_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(ROSTER_STRENGTH_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the roster-strength analysis with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'analyze_roster',
      arguments: { name: 'Belltown Raptors' },
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(ROSTER_STRENGTH_PAYLOAD);
    expect(body.result._meta).toEqual(ROSTER_STRENGTH_TOOL_META);
  });
});

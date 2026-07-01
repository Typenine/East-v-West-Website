import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { TRADE_BLOCK_PAYLOAD } = vi.hoisted(() => ({
  TRADE_BLOCK_PAYLOAD: {
    ok: true,
    data: {
      fetchedAt: '2026-07-01T12:47:20.841Z',
      source: 'east-v-west-trade-blocks',
      teamFilter: null,
      teamsWithAssets: 1,
      teams: [
        {
          team: 'Belltown Raptors',
          assets: [
            { type: 'player', playerId: '1', name: 'Lamar Jackson', position: 'QB', nflTeam: 'BAL', injuryStatus: null },
            { type: 'pick', display: '2027 1st (from Double Trouble)', year: 2027, round: 1, originalTeam: 'Double Trouble' },
            { type: 'faab', display: '$25 FAAB' },
          ],
          assetCount: 3,
          wants: 'Young WR depth',
          wantedPositions: ['WR'],
          updatedAt: '2026-06-30T10:00:00.000Z',
        },
      ],
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
    handleGetTradeBlock: vi.fn(async () => TRADE_BLOCK_PAYLOAD),
    formatTradeBlockMarkdown: vi.fn(() => '## Trade Block'),
  };
});

import {
  TRADE_BLOCK_HTML,
  TRADE_BLOCK_OUTPUT_SCHEMA,
  TRADE_BLOCK_RESOURCE,
  TRADE_BLOCK_RESOURCE_META,
  TRADE_BLOCK_TOOL_META,
  TRADE_BLOCK_WIDGET_URI,
} from '@/lib/mcp/widgets/trade-block';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Trade Block widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(TRADE_BLOCK_WIDGET_URI).toBe('ui://widget/trade-block-v1.html');
    expect(TRADE_BLOCK_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(TRADE_BLOCK_TOOL_META['openai/outputTemplate']).toBe(TRADE_BLOCK_WIDGET_URI);
    expect(TRADE_BLOCK_TOOL_META.ui.resourceUri).toBe(TRADE_BLOCK_WIDGET_URI);
  });

  it('declares the complete trade-block output schema', () => {
    expect(TRADE_BLOCK_OUTPUT_SCHEMA.required).toEqual(['ok', 'data']);
    expect(TRADE_BLOCK_OUTPUT_SCHEMA.properties.data.required).toContain('teams');
  });

  it('parses the delivered inline script', () => {
    const script = extractInlineScript(TRADE_BLOCK_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
  });
});

describe('Trade Block widget result initialization', () => {
  it('renders a representative trade-block payload from an MCP tool-result notification', () => {
    const harness = executeWidget(TRADE_BLOCK_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: TRADE_BLOCK_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Lamar Jackson');
    expect(harness.elements.card.innerHTML).toContain('2027 1st');
    expect(harness.elements.card.innerHTML).toContain('FAAB');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(TRADE_BLOCK_HTML, TRADE_BLOCK_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(TRADE_BLOCK_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(() => listener?.({ detail: { globals: { toolOutput: TRADE_BLOCK_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no data exists', () => {
    const harness = executeWidget(TRADE_BLOCK_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
  });
});

describe('MCP route metadata and resources for the Trade Block widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'get_trade_block');
      expect(tool._meta['openai/outputTemplate']).toBe(TRADE_BLOCK_WIDGET_URI);
      expect(tool.outputSchema).toEqual(TRADE_BLOCK_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the trade-block resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(TRADE_BLOCK_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: TRADE_BLOCK_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(TRADE_BLOCK_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the trade block with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'get_trade_block',
      arguments: {},
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(TRADE_BLOCK_PAYLOAD);
    expect(body.result._meta).toEqual(TRADE_BLOCK_TOOL_META);
  });
});

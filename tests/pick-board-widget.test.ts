import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { PICK_BOARD_PAYLOAD } = vi.hoisted(() => ({
  PICK_BOARD_PAYLOAD: {
    ok: true,
    data: {
      fetchedAt: '2026-07-01T12:47:20.841Z',
      source: 'sleeper-live',
      cacheStatus: 'live',
      leagueNote: 'Includes only traded picks tracked by Sleeper.',
      board: [
        {
          teamName: 'Belltown Raptors', rosterId: 1,
          picks: [{ season: '2027', round: 1, originalTeam: 'Double Trouble', currentOwner: 'Belltown Raptors', traded: true, display: '2027 1st from Double Trouble' }],
          totalPicks: 1, firstRoundPicks: 1, tradedPicksOwned: 1,
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
    handleGetFuturePickBoard: vi.fn(async () => PICK_BOARD_PAYLOAD),
    formatFuturePickBoardMarkdown: vi.fn(() => '## Future Pick Board'),
  };
});

import {
  PICK_BOARD_HTML,
  PICK_BOARD_OUTPUT_SCHEMA,
  PICK_BOARD_RESOURCE,
  PICK_BOARD_RESOURCE_META,
  PICK_BOARD_TOOL_META,
  PICK_BOARD_WIDGET_URI,
} from '@/lib/mcp/widgets/pick-board';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Future Pick Board widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(PICK_BOARD_WIDGET_URI).toBe('ui://widget/pick-board-v1.html');
    expect(PICK_BOARD_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(PICK_BOARD_TOOL_META['openai/outputTemplate']).toBe(PICK_BOARD_WIDGET_URI);
    expect(PICK_BOARD_TOOL_META.ui.resourceUri).toBe(PICK_BOARD_WIDGET_URI);
  });

  it('declares the complete pick-board output schema', () => {
    expect(PICK_BOARD_OUTPUT_SCHEMA.required).toEqual(['ok', 'data']);
    expect(PICK_BOARD_OUTPUT_SCHEMA.properties.data.required).toContain('board');
  });

  it('parses the delivered inline script', () => {
    const script = extractInlineScript(PICK_BOARD_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
  });
});

describe('Future Pick Board widget result initialization', () => {
  it('renders a representative pick board from an MCP tool-result notification', () => {
    const harness = executeWidget(PICK_BOARD_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: PICK_BOARD_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
    expect(harness.elements.card.innerHTML).toContain('2027 1st from Double Trouble');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(PICK_BOARD_HTML, PICK_BOARD_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(PICK_BOARD_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(() => listener?.({ detail: { globals: { toolOutput: PICK_BOARD_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no board exists', () => {
    const harness = executeWidget(PICK_BOARD_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
  });
});

describe('MCP route metadata and resources for the Future Pick Board widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'get_future_pick_board');
      expect(tool._meta['openai/outputTemplate']).toBe(PICK_BOARD_WIDGET_URI);
      expect(tool.outputSchema).toEqual(PICK_BOARD_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the pick-board resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(PICK_BOARD_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: PICK_BOARD_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(PICK_BOARD_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the pick board with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'get_future_pick_board',
      arguments: {},
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(PICK_BOARD_PAYLOAD);
    expect(body.result._meta).toEqual(PICK_BOARD_TOOL_META);
  });
});

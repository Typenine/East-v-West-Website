import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { DRAFT_BOARD_PAYLOAD } = vi.hoisted(() => ({
  DRAFT_BOARD_PAYLOAD: {
    meta: {
      tool: 'get_drafts', source: 'east-v-west-api', fetchedAt: '2026-07-01T12:47:20.841Z',
      seasonsQueried: ['2026'], filters: { season: '2026', team: null },
    },
    historicalPicks: {
      '2026': [
        { season: '2026', round: 1, pick: 1, team: 'Belltown Raptors', player: 'Puka Nacua', position: 'WR' },
        { season: '2026', round: 1, pick: 2, team: 'Double Trouble', player: null, position: null },
      ],
    },
    futurePickOwnership: [],
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
    handleGetDrafts: vi.fn(async () => DRAFT_BOARD_PAYLOAD),
  };
});

import {
  DRAFT_BOARD_HTML,
  DRAFT_BOARD_OUTPUT_SCHEMA,
  DRAFT_BOARD_RESOURCE,
  DRAFT_BOARD_RESOURCE_META,
  DRAFT_BOARD_TOOL_META,
  DRAFT_BOARD_WIDGET_URI,
} from '@/lib/mcp/widgets/draft-board';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Draft Board widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(DRAFT_BOARD_WIDGET_URI).toBe('ui://widget/draft-board-v1.html');
    expect(DRAFT_BOARD_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(DRAFT_BOARD_TOOL_META['openai/outputTemplate']).toBe(DRAFT_BOARD_WIDGET_URI);
    expect(DRAFT_BOARD_TOOL_META.ui.resourceUri).toBe(DRAFT_BOARD_WIDGET_URI);
  });

  it('declares the complete draft-board output schema', () => {
    expect(DRAFT_BOARD_OUTPUT_SCHEMA.required).toEqual(['meta', 'historicalPicks', 'futurePickOwnership']);
  });

  it('parses the delivered inline script', () => {
    const script = extractInlineScript(DRAFT_BOARD_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
  });
});

describe('Draft Board widget result initialization', () => {
  it('renders a representative draft board from an MCP tool-result notification', () => {
    const harness = executeWidget(DRAFT_BOARD_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: DRAFT_BOARD_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Puka Nacua');
    expect(harness.elements.card.innerHTML).toContain('Round 1');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(DRAFT_BOARD_HTML, DRAFT_BOARD_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(DRAFT_BOARD_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(() => listener?.({ detail: { globals: { toolOutput: DRAFT_BOARD_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no seasons exist', () => {
    const harness = executeWidget(DRAFT_BOARD_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
  });
});

describe('MCP route metadata and resources for the Draft Board widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'get_draft_history');
      expect(tool._meta['openai/outputTemplate']).toBe(DRAFT_BOARD_WIDGET_URI);
      expect(tool.outputSchema).toEqual(DRAFT_BOARD_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the draft-board resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(DRAFT_BOARD_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: DRAFT_BOARD_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(DRAFT_BOARD_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the draft board with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'get_draft_history',
      arguments: { season: '2026' },
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(DRAFT_BOARD_PAYLOAD);
    expect(body.result._meta).toEqual(DRAFT_BOARD_TOOL_META);
  });
});

import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { FRANCHISE_PAYLOAD } = vi.hoisted(() => ({
  FRANCHISE_PAYLOAD: {
    meta: { tool: 'get_franchise', source: 'east-v-west-api', fetchedAt: '2026-07-01T12:47:20.841Z', teamCount: 1, teamFilter: null },
    franchises: [
      {
        team: 'Belltown Raptors',
        regularSeason: { wins: 23, losses: 19, ties: 0, winPct: 54.8, pf: 5412.2, pa: 5290.4, avgPf: 128.9 },
        playoffs: { wins: 4, losses: 2, winPct: 66.7 },
        championships: 1,
        runnerUps: 1,
      },
    ],
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
    handleGetFranchise: vi.fn(async () => FRANCHISE_PAYLOAD),
    formatFranchiseMarkdown: vi.fn(() => '## Franchise Summary'),
  };
});

import {
  FRANCHISE_CASE_HTML,
  FRANCHISE_CASE_OUTPUT_SCHEMA,
  FRANCHISE_CASE_RESOURCE,
  FRANCHISE_CASE_RESOURCE_META,
  FRANCHISE_CASE_TOOL_META,
  FRANCHISE_CASE_WIDGET_URI,
} from '@/lib/mcp/widgets/franchise-case';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Franchise Trophy Case widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(FRANCHISE_CASE_WIDGET_URI).toBe('ui://widget/franchise-case-v1.html');
    expect(FRANCHISE_CASE_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(FRANCHISE_CASE_TOOL_META['openai/outputTemplate']).toBe(FRANCHISE_CASE_WIDGET_URI);
    expect(FRANCHISE_CASE_TOOL_META.ui.resourceUri).toBe(FRANCHISE_CASE_WIDGET_URI);
  });

  it('declares the complete franchise-case output schema', () => {
    expect(FRANCHISE_CASE_OUTPUT_SCHEMA.required).toEqual(['meta', 'franchises']);
  });

  it('parses the delivered inline script, including the nested quote onerror escape', () => {
    const script = extractInlineScript(FRANCHISE_CASE_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
    expect(script).toContain("onerror=\"this.classList.add(\\'hidden\\')\"");
  });
});

describe('Franchise Trophy Case widget result initialization', () => {
  it('renders a representative franchise ranking from an MCP tool-result notification', () => {
    const harness = executeWidget(FRANCHISE_CASE_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: FRANCHISE_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
    expect(harness.elements.card.innerHTML).toContain('onerror="this.classList.add(\'hidden\')"');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(FRANCHISE_CASE_HTML, FRANCHISE_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(FRANCHISE_CASE_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(() => listener?.({ detail: { globals: { toolOutput: FRANCHISE_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no franchises exist', () => {
    const harness = executeWidget(FRANCHISE_CASE_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
  });
});

describe('MCP route metadata and resources for the Franchise Trophy Case widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'get_franchise_summary');
      expect(tool._meta['openai/outputTemplate']).toBe(FRANCHISE_CASE_WIDGET_URI);
      expect(tool.outputSchema).toEqual(FRANCHISE_CASE_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the franchise-case resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(FRANCHISE_CASE_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: FRANCHISE_CASE_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(FRANCHISE_CASE_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the franchise ranking with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'get_franchise_summary',
      arguments: {},
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(FRANCHISE_PAYLOAD);
    expect(body.result._meta).toEqual(FRANCHISE_CASE_TOOL_META);
  });
});

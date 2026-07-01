import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { extractInlineScript, executeWidget, rpc } from './support/widget-test-utils';

const { TRADE_PAYLOAD } = vi.hoisted(() => ({
  TRADE_PAYLOAD: {
    analysis: {
      ratio: 0.92, verdict: 'Slight Edge', winner: 'A', diff: 450, effA: 5200, effB: 4750, rawA: 5300, rawB: 4800,
      sideAGrade: 'A', sideBGrade: 'B+', notes: ['Side A gets younger (avg 24.1 vs 27.3)'], counterHint: null,
    },
    sideA: {
      assets: [{ name: 'Puka Nacua', position: 'WR', nflTeam: 'LAR', value: 5200, fcValue: 5300, ktcValue: 5100, isPick: false, trend: 120 }],
      posSummary: '1 WR', rawTotal: 5300, effectiveTotal: 5200, grade: 'A',
    },
    sideB: {
      assets: [{ name: 'Christian McCaffrey', position: 'RB', nflTeam: 'SF', value: 4750, fcValue: 4700, ktcValue: 4800, isPick: false, trend: -80 }],
      posSummary: '1 RB', rawTotal: 4800, effectiveTotal: 4750, grade: 'B+',
    },
    unmatched: { sideA: [], sideB: [] },
    source: 'avg',
    meta: { tool: 'analyze_trade', source: 'east-v-west-api', valueSources: 'FantasyCalc + KeepTradeCut (avg)', fetchedAt: '2026-07-01T12:47:20.841Z' },
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
    handleAnalyzeTrade: vi.fn(async () => TRADE_PAYLOAD),
    formatAnalyzeTradeMarkdown: vi.fn(() => '## Trade Analysis'),
  };
});

import {
  TRADE_ANALYZER_HTML,
  TRADE_ANALYZER_OUTPUT_SCHEMA,
  TRADE_ANALYZER_RESOURCE,
  TRADE_ANALYZER_RESOURCE_META,
  TRADE_ANALYZER_TOOL_META,
  TRADE_ANALYZER_WIDGET_URI,
} from '@/lib/mcp/widgets/trade-analyzer';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

describe('Trade Analyzer widget constants and generated JavaScript', () => {
  it('uses a versioned URI and exact MCP Apps MIME type', () => {
    expect(TRADE_ANALYZER_WIDGET_URI).toBe('ui://widget/trade-analyzer-v1.html');
    expect(TRADE_ANALYZER_RESOURCE.uri).toBe(TRADE_ANALYZER_WIDGET_URI);
    expect(TRADE_ANALYZER_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(typeof TRADE_ANALYZER_TOOL_META['openai/outputTemplate']).toBe('string');
    expect(typeof TRADE_ANALYZER_TOOL_META.ui.resourceUri).toBe('string');
    expect(TRADE_ANALYZER_TOOL_META['openai/outputTemplate']).toBe(TRADE_ANALYZER_WIDGET_URI);
    expect(TRADE_ANALYZER_TOOL_META.ui.resourceUri).toBe(TRADE_ANALYZER_WIDGET_URI);
  });

  it('declares the complete trade-analyzer output schema', () => {
    expect(TRADE_ANALYZER_OUTPUT_SCHEMA.required).toEqual(['analysis', 'sideA', 'sideB', 'unmatched', 'source', 'meta']);
    expect(TRADE_ANALYZER_OUTPUT_SCHEMA.properties.sideA.required).toContain('effectiveTotal');
  });

  it('parses the delivered inline script', () => {
    const script = extractInlineScript(TRADE_ANALYZER_HTML);
    expect(() => new vm.Script(script)).not.toThrow();
  });
});

describe('Trade Analyzer widget result initialization', () => {
  it('renders a representative trade payload from an MCP tool-result notification', () => {
    const harness = executeWidget(TRADE_ANALYZER_HTML);
    const messageListener = harness.listeners.get('message')?.[0];
    expect(messageListener).toBeTypeOf('function');

    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: TRADE_PAYLOAD } },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Puka Nacua');
    expect(harness.elements.card.innerHTML).toContain('Christian McCaffrey');
    expect(harness.elements.card.innerHTML).toContain('Slight Edge');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(TRADE_ANALYZER_HTML, TRADE_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Puka Nacua');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget(TRADE_ANALYZER_HTML);
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(listener).toBeTypeOf('function');
    expect(() => listener?.({ detail: { globals: { toolOutput: TRADE_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw and falls back to the empty state when no data exists', () => {
    const harness = executeWidget(TRADE_ANALYZER_HTML);
    expect(harness.elements.card.style.display).toBe('none');
    expect(harness.timeoutCallbacks).toHaveLength(1);
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });
});

describe('MCP route metadata and resources for the Trade Analyzer widget', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'analyze_trade');
      expect(tool).toBeTruthy();
      expect(tool._meta['openai/outputTemplate']).toBe(TRADE_ANALYZER_WIDGET_URI);
      expect(tool._meta.ui.resourceUri).toBe(TRADE_ANALYZER_WIDGET_URI);
      expect(tool.outputSchema).toEqual(TRADE_ANALYZER_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the trade-analyzer resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(TRADE_ANALYZER_RESOURCE);
    });

    it(`${label} resources/read returns the exact MIME type and metadata`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: TRADE_ANALYZER_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.uri).toBe(TRADE_ANALYZER_WIDGET_URI);
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(TRADE_ANALYZER_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(script).toBeTruthy();
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns the trade analysis with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'analyze_trade',
      arguments: { side_a: ['Puka Nacua'], side_b: ['Christian McCaffrey'] },
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(TRADE_PAYLOAD);
    expect(body.result._meta).toEqual(TRADE_ANALYZER_TOOL_META);
  });
});

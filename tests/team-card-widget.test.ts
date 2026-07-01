import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const { BELLTOWN_PAYLOAD } = vi.hoisted(() => ({
  BELLTOWN_PAYLOAD: {
    meta: {
      tool: 'get_team',
      source: 'east-v-west-api',
      fetchedAt: '2026-07-01T12:47:20.841Z',
      team: 'Belltown Raptors',
      dataSource: 'sleeper-live + static',
      cacheStatus: 'live',
    },
    matchResolution: {
      requestedTeam: 'Belltown Raptors',
      matchedTeam: 'Belltown Raptors',
      confidence: 'exact',
    },
    team: {
      name: 'Belltown Raptors',
      logoUrl: '/assets/teams/East%20v%20West%20Logos/Belltown%20Raptors%20logo.png',
      rosterId: 1,
      currentRecord: {
        season: '2026',
        wins: 0,
        losses: 0,
        ties: 0,
        pf: 0,
        pa: 0,
      },
      allTimeStats: {
        regularSeason: { wins: 23, losses: 19, pf: 5412.2, pa: 5290.4 },
        playoffs: { wins: 4, losses: 2 },
      },
      championships: 1,
      championshipHistory: [{ year: 2024, finish: '1st (Champion)' }],
    },
    roster: {
      active: [
        { id: '1', name: 'Lamar Jackson', position: 'QB', nflTeam: 'BAL', status: 'Active', slot: 'active' },
        { id: '2', name: 'CeeDee Lamb', position: 'WR', nflTeam: 'DAL', status: null, slot: 'active' },
      ],
      ir: [
        { id: '3', name: 'Injured Player', position: 'RB', nflTeam: null, status: 'IR', slot: 'ir' },
      ],
      taxi: [
        { id: '4', name: 'Taxi Player', position: null, nflTeam: null, status: null, slot: 'taxi' },
      ],
    },
  },
}));

vi.mock('@/lib/mcp/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp/auth')>();
  return {
    ...actual,
    requireMcpAuth: vi.fn(() => null),
  };
});

vi.mock('@/lib/mcp/call-logger', () => ({
  withMcpLogging: vi.fn(async (_tool: string, _input: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/mcp/handlers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp/handlers')>();
  return {
    ...actual,
    handleGetTeam: vi.fn(async () => BELLTOWN_PAYLOAD),
    formatTeamMarkdown: vi.fn(() => '**Belltown Raptors**\n\n0-0'),
  };
});

import {
  TEAM_CARD_HTML,
  TEAM_CARD_OUTPUT_SCHEMA,
  TEAM_CARD_RESOURCE,
  TEAM_CARD_RESOURCE_META,
  TEAM_CARD_TOOL_META,
  TEAM_CARD_WIDGET_URI,
} from '@/lib/mcp/widgets/team-card';
import { POST as publicPost } from '@/app/api/mcp-public/route';
import { POST as authenticatedPost } from '@/app/api/mcp/route';

type FakeElement = {
  style: { display: string };
  innerHTML: string;
  textContent: string;
  classList: { add: ReturnType<typeof vi.fn> };
};

type Harness = {
  elements: Record<string, FakeElement>;
  listeners: Map<string, Array<(event: any) => void>>;
  timeoutCallbacks: Array<() => void>;
  windowObject: any;
};

function extractInlineScript(): string {
  const match = TEAM_CARD_HTML.match(/<script>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('TEAM_CARD_HTML does not contain an inline script');
  return match[1];
}

function makeElement(display: string): FakeElement {
  return {
    style: { display },
    innerHTML: '',
    textContent: '',
    classList: { add: vi.fn() },
  };
}

function executeWidget(initialToolOutput?: unknown): Harness {
  const elements: Record<string, FakeElement> = {
    'state-loading': makeElement('flex'),
    'state-error': makeElement('none'),
    'state-empty': makeElement('none'),
    card: makeElement('none'),
  };
  const listeners = new Map<string, Array<(event: any) => void>>();
  const timeoutCallbacks: Array<() => void> = [];
  const parent = { postMessage: vi.fn() };
  const windowObject: any = {
    parent,
    top: parent,
    openai: initialToolOutput === undefined ? undefined : { toolOutput: initialToolOutput },
    addEventListener: vi.fn((type: string, listener: (event: any) => void) => {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    }),
  };
  const documentObject = {
    getElementById: vi.fn((id: string) => elements[id]),
  };

  vm.runInNewContext(extractInlineScript(), {
    window: windowObject,
    document: documentObject,
    setTimeout: vi.fn((callback: () => void) => {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    }),
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });

  return { elements, listeners, timeoutCallbacks, windowObject };
}

function rpcRequest(url: string, method: string, params: unknown = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

async function rpc(post: (request: Request) => Promise<Response>, url: string, method: string, params: unknown = {}) {
  const response = await post(rpcRequest(url, method, params));
  return response.json() as Promise<any>;
}

describe('Team Card widget constants and generated JavaScript', () => {
  it('uses the v3 cache-busting URI and exact MCP Apps MIME type', () => {
    expect(TEAM_CARD_WIDGET_URI).toBe('ui://widget/team-card-v3.html');
    expect(TEAM_CARD_RESOURCE.uri).toBe(TEAM_CARD_WIDGET_URI);
    expect(TEAM_CARD_RESOURCE.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('uses string-valued output-template and resource URI metadata', () => {
    expect(typeof TEAM_CARD_TOOL_META['openai/outputTemplate']).toBe('string');
    expect(typeof TEAM_CARD_TOOL_META.ui.resourceUri).toBe('string');
    expect(TEAM_CARD_TOOL_META['openai/outputTemplate']).toBe(TEAM_CARD_WIDGET_URI);
    expect(TEAM_CARD_TOOL_META.ui.resourceUri).toBe(TEAM_CARD_WIDGET_URI);
  });

  it('declares the complete team-card output schema', () => {
    expect(TEAM_CARD_OUTPUT_SCHEMA.required).toEqual(['meta', 'matchResolution', 'team', 'roster']);
    expect(TEAM_CARD_OUTPUT_SCHEMA.properties.team.required).toContain('allTimeStats');
    expect(TEAM_CARD_OUTPUT_SCHEMA.properties.roster.required).toEqual(['active', 'ir', 'taxi']);
    expect(TEAM_CARD_OUTPUT_SCHEMA.properties.roster.properties.active.items.required).toEqual([
      'id', 'name', 'position', 'nflTeam', 'status', 'slot',
    ]);
  });

  it('keeps the exact CSP resource domain and widget description', () => {
    expect(TEAM_CARD_RESOURCE_META).toEqual({
      ui: {
        prefersBorder: true,
        domain: 'https://east-v-west-website.vercel.app',
        csp: {
          resourceDomains: ['https://east-v-west-website.vercel.app'],
        },
      },
      'openai/widgetDescription': 'East v. West Team Card — record, roster, championships, and injury flags.',
    });
  });

  it('parses the delivered inline script and preserves the nested quote escape', () => {
    const script = extractInlineScript();
    expect(() => new vm.Script(script)).not.toThrow();
    expect(script).toContain("onerror=\"this.classList.add(\\'hidden\\')\"");
  });
});

describe('Team Card widget result initialization', () => {
  it('renders a representative Belltown Raptors MCP tool-result notification', () => {
    const harness = executeWidget();
    const messageListener = harness.listeners.get('message')?.[0];
    expect(messageListener).toBeTypeOf('function');

    expect(() => messageListener?.({
      source: harness.windowObject.parent,
      data: {
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: { structuredContent: BELLTOWN_PAYLOAD },
      },
    })).not.toThrow();

    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
    expect(harness.elements.card.innerHTML).toContain('Lamar Jackson');
    expect(harness.elements.card.innerHTML).toContain('onerror="this.classList.add(\'hidden\')"');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });

  it('initializes from a guarded window.openai.toolOutput fallback', () => {
    const harness = executeWidget(BELLTOWN_PAYLOAD);
    expect(harness.elements.card.style.display).toBe('block');
    expect(harness.elements.card.innerHTML).toContain('Belltown Raptors');
  });

  it('handles later openai:set_globals toolOutput updates', () => {
    const harness = executeWidget();
    const listener = harness.listeners.get('openai:set_globals')?.[0];
    expect(listener).toBeTypeOf('function');
    expect(() => listener?.({ detail: { globals: { toolOutput: BELLTOWN_PAYLOAD } } })).not.toThrow();
    expect(harness.elements.card.style.display).toBe('block');
  });

  it('does not throw when no initial data exists and falls back to the empty state', () => {
    const harness = executeWidget();
    expect(harness.elements.card.style.display).toBe('none');
    expect(harness.timeoutCallbacks).toHaveLength(1);
    expect(() => harness.timeoutCallbacks[0]()).not.toThrow();
    expect(harness.elements['state-empty'].style.display).toBe('flex');
    expect(harness.elements['state-error'].style.display).toBe('none');
  });
});

describe('MCP route metadata and resources', () => {
  for (const [label, post, url] of [
    ['public', publicPost, 'http://localhost/api/mcp-public'],
    ['authenticated', authenticatedPost, 'http://localhost/api/mcp'],
  ] as const) {
    it(`${label} tools/list exposes matching string metadata and the exact output schema`, async () => {
      const body = await rpc(post, url, 'tools/list');
      const tool = body.result.tools.find((entry: any) => entry.name === 'show_team_card');
      expect(tool).toBeTruthy();
      expect(typeof tool._meta['openai/outputTemplate']).toBe('string');
      expect(typeof tool._meta.ui.resourceUri).toBe('string');
      expect(tool._meta['openai/outputTemplate']).toBe(TEAM_CARD_WIDGET_URI);
      expect(tool._meta.ui.resourceUri).toBe(TEAM_CARD_WIDGET_URI);
      expect(tool.outputSchema).toEqual(TEAM_CARD_OUTPUT_SCHEMA);
    });

    it(`${label} resources/list includes the v3 team-card resource`, async () => {
      const body = await rpc(post, url, 'resources/list');
      expect(body.result.resources).toContainEqual(TEAM_CARD_RESOURCE);
      expect(body.result.resources.map((r: any) => r.uri)).toContain('ui://widget/team-card-v3.html');
    });

    it(`${label} resources/read accepts and returns v3 with the exact MIME type and CSP`, async () => {
      const body = await rpc(post, url, 'resources/read', { uri: TEAM_CARD_WIDGET_URI });
      const resource = body.result.contents[0];
      expect(resource.uri).toBe(TEAM_CARD_WIDGET_URI);
      expect(resource.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource._meta).toEqual(TEAM_CARD_RESOURCE_META);
      const script = resource.text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
      expect(script).toBeTruthy();
      expect(() => new vm.Script(script!)).not.toThrow();
    });
  }

  it('public tools/call returns successful Belltown data with matching string metadata', async () => {
    const body = await rpc(publicPost, 'http://localhost/api/mcp-public', 'tools/call', {
      name: 'show_team_card',
      arguments: { name: 'Belltown Raptors' },
    });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual(BELLTOWN_PAYLOAD);
    expect(body.result._meta).toEqual(TEAM_CARD_TOOL_META);
    expect(body.result._meta.ui.resourceUri).toBe('ui://widget/team-card-v3.html');
    expect(body.result._meta['openai/outputTemplate']).toBe('ui://widget/team-card-v3.html');
  });
});

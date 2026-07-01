import vm from 'node:vm';
import { vi } from 'vitest';

export type FakeElement = {
  style: { display: string };
  innerHTML: string;
  textContent: string;
  classList: { add: ReturnType<typeof vi.fn> };
};

export type Harness = {
  elements: Record<string, FakeElement>;
  listeners: Map<string, Array<(event: any) => void>>;
  timeoutCallbacks: Array<() => void>;
  windowObject: any;
};

export function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('widget HTML does not contain an inline script');
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

export function executeWidget(html: string, initialToolOutput?: unknown): Harness {
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

  vm.runInNewContext(extractInlineScript(html), {
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

export function rpcRequest(url: string, method: string, params: unknown = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

export async function rpc(post: (request: Request) => Promise<Response>, url: string, method: string, params: unknown = {}) {
  const response = await post(rpcRequest(url, method, params));
  return response.json() as Promise<any>;
}

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '@/lib/mcp/tool-definitions';
import { WIDGET_ENTRIES, withVersionedWidgetMeta } from '@/lib/mcp/widgets/registry';

function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Widget HTML does not contain an inline script');
  return match[1];
}

describe('widget runtime regression guard', () => {
  it('serves unique cache-busted widget resource URIs', () => {
    const uris = WIDGET_ENTRIES.map((entry) => entry.resource.uri);
    expect(new Set(uris).size).toBe(uris.length);
    for (const uri of uris) {
      expect(uri).toContain('-styled-v2.html');
    }
  });

  it('parses the exact inline JavaScript delivered for every widget', () => {
    for (const entry of WIDGET_ENTRIES) {
      const script = extractInlineScript(entry.html);
      expect(() => new vm.Script(script, { filename: entry.resource.uri })).not.toThrow();
      expect(script).not.toContain('classList.add(');
    }
  });

  it('uses the same versioned URI in tool descriptors and resource registration', () => {
    const resourceUris = new Set(WIDGET_ENTRIES.map((entry) => entry.resource.uri));
    const widgetTools = MCP_TOOLS.filter((tool) => '_meta' in tool && tool._meta);

    for (const tool of widgetTools) {
      const meta = withVersionedWidgetMeta(tool._meta as Record<string, unknown>)!;
      const outputTemplate = meta['openai/outputTemplate'];
      const ui = meta.ui as Record<string, unknown>;

      expect(typeof outputTemplate).toBe('string');
      expect(ui.resourceUri).toBe(outputTemplate);
      expect(resourceUris.has(outputTemplate as string)).toBe(true);
    }
  });
});

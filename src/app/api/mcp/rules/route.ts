/**
 * MCP Tool: get_rules
 * Returns league rules as clean plain text, searchable by keyword.
 * Strips all HTML tags and normalises whitespace so an LLM can read the
 * output directly without parsing markup.
 *
 * Query params:
 *   ?search=waiver      — return only sections whose title or text contains
 *                         the keyword (case-insensitive). Returns all sections
 *                         when omitted.
 *   ?section=waivers    — return a single section by its id (e.g.
 *                         "waivers-free-agents"). Lists available ids when
 *                         the id is not found.
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { rulesHtmlSections } from '@/data/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|li|ul|ol|h[1-6]|div|br)[^>]*>/gi, '\n') // block elements → newline
    .replace(/<[^>]*>/g, '')                                   // remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')         // collapse inline whitespace
    .replace(/\n{3,}/g, '\n\n')      // max two consecutive newlines
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

const PARSED = rulesHtmlSections.map((s) => ({
  id: s.id,
  title: s.title,
  text: stripHtml(s.html),
}));

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const searchRaw = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const sectionId = (url.searchParams.get('section') ?? '').trim().toLowerCase();

  // Single-section lookup by id
  if (sectionId) {
    const found = PARSED.find((s) => s.id.toLowerCase() === sectionId);
    if (!found) {
      return NextResponse.json({
        error: 'section_not_found',
        availableSections: PARSED.map((s) => ({ id: s.id, title: s.title })),
      }, { status: 404 });
    }
    return NextResponse.json({
      meta: mcpMeta('get_rules', { lookup: 'section', sectionId }),
      section: found,
    });
  }

  // Keyword search across title + text
  const results = searchRaw
    ? PARSED.filter(
        (s) =>
          s.title.toLowerCase().includes(searchRaw) ||
          s.text.toLowerCase().includes(searchRaw),
      )
    : PARSED;

  // When a search term is provided, include only the matching line(s) in a
  // "matches" array so the LLM sees just the relevant excerpt, not the full
  // section. The full section text is still included for context.
  const sections = results.map((s) => {
    if (!searchRaw) return s;

    const matchingLines = s.text
      .split('\n')
      .filter((line) => line.toLowerCase().includes(searchRaw));

    return { ...s, matchingLines };
  });

  return NextResponse.json({
    meta: mcpMeta('get_rules', {
      search: searchRaw || null,
      totalSections: PARSED.length,
      matchedSections: sections.length,
      note: 'Rules sourced from the East v. West Rulebook v3, ratified 2026-02-12.',
    }),
    sections,
  });
}

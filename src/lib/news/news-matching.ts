/**
 * Shared news-matching utilities.
 *
 * Imported by /api/roster-news and /api/league-news so both routes use
 * identical matching logic.
 */

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function canonicalizeUrl(url: string | null | undefined): string | null {
  try {
    if (!url) return null;
    const u = new URL(url);
    const host = u.host.toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${host}${path}`;
  } catch {
    const s = String(url || '').trim();
    return s ? s.toLowerCase() : null;
  }
}

export function containsPhrase(hayNorm: string, phraseNorm: string): boolean {
  if (!hayNorm || !phraseNorm) return false;
  const re = new RegExp(`(^|\\s)${escapeRegExp(phraseNorm)}(\\s|$)`);
  return re.test(hayNorm);
}

function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function stripSuffixes(name: string): string {
  const parts = normalizeText(name).split(' ');
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
  return parts.filter((p) => !suffixes.has(p)).join(' ').trim();
}

export const NICKNAMES: Record<string, string[]> = {
  william:     ['bill', 'will', 'billy'],
  robert:      ['rob', 'bob', 'bobby', 'robbie'],
  richard:     ['rich', 'rick', 'ricky'],
  edward:      ['ed', 'eddie'],
  james:       ['jim', 'jimmy', 'jamie'],
  john:        ['jack', 'johnny'],
  matthew:     ['matt'],
  michael:     ['mike', 'mikey'],
  joseph:      ['joe', 'joey'],
  daniel:      ['dan', 'danny'],
  andrew:      ['andy', 'drew'],
  anthony:     ['tony'],
  nicholas:    ['nick', 'nico'],
  thomas:      ['tom', 'tommy'],
  patrick:     ['pat'],
  steven:      ['steve', 'stevie'],
  alexander:   ['alex'],
  samuel:      ['sam', 'sammy'],
  benjamin:    ['ben', 'benny'],
  christopher: ['chris'],
  nathaniel:   ['nate', 'nathan'],
  philip:      ['phil'],
  gregory:     ['greg'],
  kenneth:     ['ken', 'kenny'],
  ronald:      ['ron', 'ronnie'],
  timothy:     ['tim', 'timmy'],
};

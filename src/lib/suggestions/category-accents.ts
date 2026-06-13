/** Category accent colors for suggestion cards (league-wide, not team-specific). */
const CATEGORY_ACCENTS: Record<string, string> = {
  Rules: '#818cf8',
  Website: '#38bdf8',
  Discord: '#a78bfa',
  Location: '#34d399',
  Other: '#94a3b8',
};

const DEFAULT_ACCENT = '#6366f1';

export function categoryAccent(category?: string | null): string {
  if (!category) return DEFAULT_ACCENT;
  return CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
}

export function suggestionAccent(s: {
  category?: string;
  proposerTeam?: string;
  sponsorTeam?: string;
}): string {
  return categoryAccent(s.category);
}

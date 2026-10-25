/**
 * Shared, verified source paths for the 12 active East v. West franchises
 * and the official league emblem. Reuse for the draft broadcast, boards,
 * transitions, and ordinary site UI. The 3D stage uses these PNG files as
 * textures; no separate artwork uploads or duplicate binary files are needed.
 *
 * The original Minshew's Maniacs identity is a historical alias for Cascade
 * Marauders in the current league configuration.
 */
export const BROADCAST_LOGO_DIRECTORY = '/assets/teams/East%20v%20West%20Logos/';

export const BROADCAST_TEAM_LOGO_FILES = {
  'Belltown Raptors': 'Belltown Raptors logo.png',
  'Double Trouble': 'Double Trouble logo22.png',
  'Elemental Heroes': 'Elemental Heroes Logo.png',
  'Mt. Lebanon Cake Eaters': 'Cake Eaters Logo Final Version (1)-transparent.png',
  'Belleview Badgers': 'Belleview Badgers Primary Logo-transparent.png',
  'BeerNeverBrokeMyHeart': 'Beer Never Broke My Heart Logo.png',
  'Detroit Dawgs': 'Detroit Dawgs Logo.png',
  'bop pop': 'bop pop logo.png',
  'Cascade Marauders': 'Cascade Marauders Logo.png',
  'Red Pandas': 'Red Pandas Primary Logo (2).png',
  'The Lone Ginger': 'Lone Ginger Logo-transparent.png',
  'Bimg Bamg Boomg': 'Bimg Bamg Boomg Logo .png',
} as const;

export type BroadcastTeamName = keyof typeof BROADCAST_TEAM_LOGO_FILES;

export const LEAGUE_BROADCAST_LOGO_FILE = 'Official East v. West Logo.png';
export const LEAGUE_BROADCAST_LOGO_URL =
  BROADCAST_LOGO_DIRECTORY + encodeURIComponent(LEAGUE_BROADCAST_LOGO_FILE);

// Alternate spellings and old franchise identities intentionally do not count
// toward the 12 active logos.
export const BROADCAST_TEAM_LOGO_ALIASES: Record<string, BroadcastTeamName> = {
  "Minshew's Maniacs": 'Cascade Marauders',
  "Gardner's Ghost": 'Cascade Marauders',
};

export const BROADCAST_LOGO_CATALOG = [
  ...Object.entries(BROADCAST_TEAM_LOGO_FILES).map(([name, file]) => ({
    id: name,
    name,
    kind: 'team' as const,
    src: BROADCAST_LOGO_DIRECTORY + encodeURIComponent(file),
  })),
  {
    id: 'east-v-west-league',
    name: 'East v. West',
    kind: 'league' as const,
    src: LEAGUE_BROADCAST_LOGO_URL,
  },
] as const;

export function getBroadcastTeamLogoUrl(name: string): string | null {
  const normalized = name.trim().replace(/[\u2018\u2019\u02bc]/g, "'");
  const direct = normalized as BroadcastTeamName;
  const canonical = Object.prototype.hasOwnProperty.call(BROADCAST_TEAM_LOGO_FILES, direct)
    ? direct : BROADCAST_TEAM_LOGO_ALIASES[normalized];
  return canonical
    ? BROADCAST_LOGO_DIRECTORY + encodeURIComponent(BROADCAST_TEAM_LOGO_FILES[canonical])
    : null;
}

export function getBroadcastLogoUrl(params: {
  teamName?: string | null;
  eventLogoUrl?: string | null;
  league?: boolean;
}): string | null {
  // Draft-specific event branding takes priority over the general league mark.
  if (params.eventLogoUrl) return params.eventLogoUrl;
  if (params.teamName) return getBroadcastTeamLogoUrl(params.teamName);
  return params.league ? LEAGUE_BROADCAST_LOGO_URL : null;
}

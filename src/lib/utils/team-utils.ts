/**
 * Utility functions for team-related operations
 * Includes functions for team logos, colors, and other team-specific operations
 */

import { TEAM_COLORS, TeamColors } from '../constants/team-colors';
import { TEAM_NAMES } from '../constants/league';
import { CANONICAL_TEAM_BY_USER_ID, TEAM_ALIASES, normalizeName } from '../constants/team-mapping';

/**
 * Converts a team name to a URL-friendly format for logo paths
 * @param teamName The team name to format
 * @returns Formatted team name for logo path
 */
export const formatTeamNameForLogo = (teamName: string): string => {
  return teamName
    .toLowerCase()
    .replace(/[''\.]/g, '')
    .replace(/\s+/g, '-');
};

/**
 * Gets the path to a team's logo
 * @param teamName The team name
 * @returns Path to the team's logo
 */
export const getTeamLogoPath = (teamName: string): string => {
  // Map team names to their actual logo filenames in the East v West Logos folder
  const logoMap: Record<string, string> = {
    'Belleview Badgers': 'Belleview Badgers Primary Logo.png',
    'Belltown Raptors': 'Belltown Raptors logo.png',
    'Minshew\'s Maniacs': 'Minshew\'s Maniacs Logo.png',
    'Double Trouble': 'Double Trouble logo.png',
    'Mt. Lebanon Cake Eaters': 'Cake Eaters Logo Final Version (1).png',
    'The Lone Ginger': 'Lone Ginger Logo.png',
    'bop pop': 'bop pop logo.png',
    'Red Pandas': 'Red Pandas Primary Logo (2).png',
    'BeerNeverBrokeMyHeart': 'Beer Never Broke My Heart Logo.png',
    'Elemental Heroes': 'Elemental Heroes Logo.png',
    'Detroit Dawgs': 'Detroit Dawgs Logo.png',
    'Bimg Bamg Boomg': 'Bimg Bamg Boomg Logo .png'
  };
  
  const logoFile = logoMap[teamName] || `${formatTeamNameForLogo(teamName)}.png`;
  return `/assets/teams/East v West Logos/${logoFile}`;
};

/**
 * Gets a team's colors
 * @param teamName The team name
 * @returns The team's colors object
 */
export const getTeamColors = (teamName: string): TeamColors => {
  return TEAM_COLORS[teamName] || {
    primary: '#3b5b8b',
    secondary: '#ba1010'
  };
};

/**
 * Generates a CSS style object for team-colored elements
 * @param teamName The team name
 * @param variant 'primary' | 'secondary' | 'tertiary' - which color to use as background
 * @returns CSS style object with background and text colors
 */
export const getTeamColorStyle = (
  teamName: string, 
  variant: 'primary' | 'secondary' | 'tertiary' = 'primary'
): React.CSSProperties => {
  const colors = getTeamColors(teamName);
  const bgColor = colors[variant] || colors.primary;
  
  // Calculate if text should be light or dark based on background color
  const isLight = (color: string): boolean => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate luminance (perceived brightness)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  };
  
  return {
    backgroundColor: bgColor,
    color: isLight(bgColor) ? '#000000' : '#ffffff',
  };
};

/**
 * Canonical name resolution helpers
 */

// Precompute normalized canonical names for quick matching
const CANONICAL_BY_NORMALIZED = new Map<string, string>(
  TEAM_NAMES.map((n) => [normalizeName(n), n])
);

// Precompute normalized alias map
const ALIAS_BY_NORMALIZED = new Map<string, string>(
  Object.entries(TEAM_ALIASES).map(([alias, canon]) => [normalizeName(alias), canon])
);

/**
 * Resolve a canonical team name using owner_id first, then aliases, then best-effort matches.
 */
export function resolveCanonicalTeamName(params: {
  ownerId?: string | null;
  rosterTeamName?: string | null;
  userDisplayName?: string | null;
  username?: string | null;
}): string {
  const { ownerId, rosterTeamName, userDisplayName, username } = params;

  // 1) Direct mapping by user_id (source of truth across seasons)
  if (ownerId && CANONICAL_TEAM_BY_USER_ID[ownerId]) {
    return CANONICAL_TEAM_BY_USER_ID[ownerId];
  }

  const tryMap = (name?: string | null): string | undefined => {
    if (!name) return undefined;
    const key = normalizeName(name);
    return ALIAS_BY_NORMALIZED.get(key) || CANONICAL_BY_NORMALIZED.get(key);
  };

  // 2) Roster/team display name on Sleeper
  const fromRosterName = tryMap(rosterTeamName);
  if (fromRosterName) return fromRosterName;

  // 3) User display name or username as alias
  const fromDisplay = tryMap(userDisplayName) || tryMap(username);
  if (fromDisplay) return fromDisplay;

  // 4) Unknown – caller can log and/or fall back to placeholder in UI
  return 'Unknown Team';
}

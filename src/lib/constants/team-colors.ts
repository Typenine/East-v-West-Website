/**
 * Team colors for East v. West fantasy football league
 * Each team has up to 4 colors that can be used for branding and UI elements
 */

// Index-based TEAM_NAMES usage has been removed. Colors are keyed by canonical team name.

// Type for team colors
export interface TeamColors {
  primary: string;
  secondary: string;
  tertiary?: string;
  quaternary?: string;
}

// Map of team names to their colors
export const TEAM_COLORS: Record<string, TeamColors> = {
  'Belleview Badgers': {
    primary: '#006747',
    secondary: '#1E3052',
    tertiary: '#F2F7F9'
  },
  'Belltown Raptors': {
    primary: '#753bd1',
    secondary: '#ba002f',
    tertiary: '#8a8d8f'
  },
  'Minshew\'s Maniacs': {
    primary: '#A0022D',
    secondary: '#404040',
    tertiary: '#ca5517'
  },
  'Double Trouble': {
    primary: '#120a11',
    secondary: '#351b4b',
    tertiary: '#4b7755'
  },
  'Mt. Lebanon Cake Eaters': {
    primary: '#093351',
    secondary: '#DCAC24',
    tertiary: '#4b7755'
  },
  'The Lone Ginger': {
    primary: '#d56920',
    secondary: '#13110d',
    tertiary: '#f88618'
  },
  'bop pop': {
    primary: '#fedb35',
    secondary: '#98C4D0',
    tertiary: '#0E9E9E'
  },
  'Red Pandas': {
    primary: '#c90f0f',
    secondary: '#000000',
    tertiary: '#707574',
    quaternary: '#38c4f6'
  },
  'BeerNeverBrokeMyHeart': {
    primary: '#0E1A27',
    secondary: '#F4E3C3',
    tertiary: '#0B5320'
  },
  'Elemental Heroes': {
    primary: '#83e1e2',
    secondary: '#d65e5e',
    tertiary: '#f5bd37'
  },
  'Detroit Dawgs': {
    primary: '#5b3d27',
    secondary: '#e62127',
    tertiary: '#779c9c'
  },
  'Bimg Bamg Boomg': {
    primary: '#712D7C',
    secondary: '#BEDB30',
    tertiary: '#F2F7F9'
  }
};

// League colors for global UI elements
export const LEAGUE_COLORS = {
  primary: '#0b5f98', // Accent / brand
  secondary: '#be161e', // Danger
  tertiary: '#bf9944', // Gold highlight
  quaternary: '#fcfcfc', // White
  dark: '#050505', // Near-black
};

// Function to get team colors by team name
export const getTeamColors = (teamName: string): TeamColors => {
  return TEAM_COLORS[teamName] || {
    primary: LEAGUE_COLORS.primary,
    secondary: LEAGUE_COLORS.secondary
  };
};

// Removed getTeamColorByIndex; always resolve by canonical team name instead.

/**
 * East v. West Team Card — ChatGPT Apps SDK Widget
 *
 * Self-contained inline HTML served as text/html;profile=mcp-app via
 * the MCP resources/read endpoint. Runs inside a sandboxed ChatGPT iframe.
 */

const TEAM_COLOR_MAP: Record<string, { primary: string; secondary: string }> = {
  'Belleview Badgers':        { primary: '#006747', secondary: '#1E3052' },
  'Belltown Raptors':         { primary: '#753bbd', secondary: '#ba0c2f' },
  "Minshew's Maniacs":        { primary: '#A60F2D', secondary: '#4D4D4D' },
  'Double Trouble':           { primary: '#120a11', secondary: '#351b4b' },
  'Mt. Lebanon Cake Eaters':  { primary: '#023351', secondary: '#DCAC24' },
  'The Lone Ginger':          { primary: '#d56920', secondary: '#13110d' },
  'bop pop':                  { primary: '#fedb35', secondary: '#f88618' },
  'Red Pandas':               { primary: '#c90a00', secondary: '#000000' },
  'BeerNeverBrokeMyHeart':    { primary: '#0E1A27', secondary: '#F4E3C3' },
  'Elemental Heroes':         { primary: '#83e1e2', secondary: '#fd6e6e' },
  'Detroit Dawgs':            { primary: '#5a341f', secondary: '#da2127' },
  'Bimg Bamg Boomg':          { primary: '#712D7C', secondary: '#9BC46D' },
};

const LOGO_MAP: Record<string, string> = {
  'Belleview Badgers':        'Belleview Badgers Primary Logo.png',
  'Belltown Raptors':         'Belltown Raptors logo.png',
  "Minshew's Maniacs":        "Minshew's Maniacs Logo.png",
  'Double Trouble':           'Double Trouble logo.png',
  'Mt. Lebanon Cake Eaters':  'Cake Eaters Logo Final Version (1).png',
  'The Lone Ginger':          'Lone Ginger Logo.png',
  'bop pop':                  'bop pop logo.png',
  'Red Pandas':               'Red Pandas Primary Logo (2).png',
  'BeerNeverBrokeMyHeart':    'Beer Never Broke My Heart Logo.png',
  'Elemental Heroes':         'Elemental Heroes Logo.png',
  'Detroit Dawgs':            'Detroit Dawgs Logo.png',
  'Bimg Bamg Boomg':          'Bimg Bamg Boomg Logo .png',
};

export const BASE_URL = 'https://east-v-west-website.vercel.app';
export const COLOR_MAP_JSON = JSON.stringify(TEAM_COLOR_MAP);
export const LOGO_MAP_JSON = JSON.stringify(LOGO_MAP);


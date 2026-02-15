import { TradeAsset, TradeWants } from './user-store';
import { getAllPlayersCached } from '@/lib/utils/sleeper-api';

const DEBUG = process.env.TRADE_BLOCK_DEBUG === '1' || process.env.TRADE_BLOCK_DEBUG === 'true';

type DiffResult = {
  addedPlayers: TradeAsset[];
  removedPlayers: TradeAsset[];
  addedPicks: TradeAsset[];
  removedPicks: TradeAsset[];
  faabChanged: boolean;
  faabBefore?: number;
  faabAfter?: number;
  contactChanged: boolean;
  contactBefore?: string;
  contactAfter?: string;
  lookingForChanged: boolean;
  lookingForBefore?: string;
  lookingForAfter?: string;
  tagsChanged: boolean;
  tagsBefore: Set<string>;
  tagsAfter: Set<string>;
  addedPositions: string[];
  removedPositions: string[];
  addedPickTags: string[];
  removedPickTags: string[];
};

type NarrativeContext = {
  teamName: string;
  diff: DiffResult;
  currentPlayers: TradeAsset[];
  baseUrl: string | null;
  updatedAt: string;
  leagueContext?: LeagueMarketContext;
};

type LeagueMarketContext = {
  teamsSeekingPositions: Record<string, number>; // e.g., {"RB": 3, "WR": 2}
  teamsSeekingPickRounds: Record<string, number>; // e.g., {"1st": 4, "2nd": 2}
};

function assetToKey(asset: TradeAsset): string {
  if (asset.type === 'player') return `player:${asset.playerId}`;
  if (asset.type === 'pick') return `pick:${asset.year}-R${asset.round}-${asset.originalTeam ?? 'own'}`;
  if (asset.type === 'faab') return `faab:${asset.amount ?? 0}`;
  return '';
}

async function assetToLabel(asset: TradeAsset, players: Record<string, { first_name?: string; last_name?: string; position?: string; team?: string }>): Promise<string> {
  if (asset.type === 'player') {
    const player = players[asset.playerId];
    if (player) {
      const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
      return name || asset.playerId;
    }
    return asset.playerId;
  }
  if (asset.type === 'pick') {
    const round = asset.round === 1 ? '1st' : asset.round === 2 ? '2nd' : asset.round === 3 ? '3rd' : `${asset.round}th`;
    return `${asset.year} ${round}`;
  }
  if (asset.type === 'faab') {
    return `$${asset.amount ?? 0} FAAB`;
  }
  return 'Unknown';
}

function pickToLabel(asset: TradeAsset): string {
  if (asset.type !== 'pick') return '';
  const round = asset.round === 1 ? '1st' : asset.round === 2 ? '2nd' : asset.round === 3 ? '3rd' : `${asset.round}th`;
  return `${asset.year} ${round}`;
}

const POSITIONAL_TAGS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const PICK_TAGS = new Set(['1ST', '2ND', '3RD']);

const TEAM_HASHTAGS: Record<string, string> = {
  'Belltown Raptors': '#ClawCrew',
  'Double Trouble': '#DoubleThreat',
  'Elemental Heroes': '#HeroesRise',
  'Mt. Lebanon Cake Eaters': '#TakeTheCake',
  'Belleview Badgers': '#DigDeep',
  'BeerNeverBrokeMyHeart': '#BeerNation',
  'Detroit Dawgs': '#DawgPound',
  'bop pop': '#PopOff',
  'Minshew\'s Maniacs': '#ManiacMode',
  'Red Pandas': '#PandaPower',
  'The Lone Ginger': '#GingerArmy',
  'Bimg Bamg Boomg': '#BimgBamgBoom'
};

function extractTags(wants: TradeWants | null): Set<string> {
  const tags = new Set<string>();
  if (!wants) return tags;
  if (Array.isArray(wants.positions)) {
    wants.positions.forEach((p) => tags.add(p.toUpperCase()));
  }
  return tags;
}

function splitTags(tags: Set<string>): { positional: string[]; picks: string[] } {
  const positional: string[] = [];
  const picks: string[] = [];
  for (const tag of tags) {
    if (POSITIONAL_TAGS.has(tag)) positional.push(tag);
    else if (PICK_TAGS.has(tag)) picks.push(tag);
  }
  return { positional, picks };
}

export async function computeDiff(oldBlock: TradeAsset[], newBlock: TradeAsset[], oldWants: TradeWants | null, newWants: TradeWants | null): Promise<DiffResult> {
  const oldKeys = new Set(oldBlock.map(assetToKey));
  const newKeys = new Set(newBlock.map(assetToKey));

  const addedPlayers: TradeAsset[] = [];
  const removedPlayers: TradeAsset[] = [];
  const addedPicks: TradeAsset[] = [];
  const removedPicks: TradeAsset[] = [];
  let faabBefore: number | undefined;
  let faabAfter: number | undefined;

  for (const asset of newBlock) {
    const key = assetToKey(asset);
    if (!oldKeys.has(key)) {
      if (asset.type === 'player') addedPlayers.push(asset);
      else if (asset.type === 'pick') addedPicks.push(asset);
      else if (asset.type === 'faab') faabAfter = asset.amount;
    } else if (asset.type === 'faab') {
      faabAfter = asset.amount;
    }
  }

  for (const asset of oldBlock) {
    const key = assetToKey(asset);
    if (!newKeys.has(key)) {
      if (asset.type === 'player') removedPlayers.push(asset);
      else if (asset.type === 'pick') removedPicks.push(asset);
      else if (asset.type === 'faab') faabBefore = asset.amount;
    } else if (asset.type === 'faab') {
      faabBefore = asset.amount;
    }
  }

  const faabChanged = faabBefore !== faabAfter && (faabBefore !== undefined || faabAfter !== undefined);

  const oldContact = oldWants?.contactMethod;
  const newContact = newWants?.contactMethod;
  const contactChanged = oldContact !== newContact;

  const oldLookingFor = (oldWants?.text ?? '').trim();
  const newLookingFor = (newWants?.text ?? '').trim();
  const lookingForChanged = oldLookingFor !== newLookingFor;

  const tagsBefore = extractTags(oldWants);
  const tagsAfter = extractTags(newWants);
  const tagsChanged = tagsBefore.size !== tagsAfter.size || [...tagsBefore].some((t) => !tagsAfter.has(t));

  const beforeSplit = splitTags(tagsBefore);
  const afterSplit = splitTags(tagsAfter);
  
  const addedPositions = afterSplit.positional.filter((p) => !beforeSplit.positional.includes(p));
  const removedPositions = beforeSplit.positional.filter((p) => !afterSplit.positional.includes(p));
  const addedPickTags = afterSplit.picks.filter((p) => !beforeSplit.picks.includes(p));
  const removedPickTags = beforeSplit.picks.filter((p) => !afterSplit.picks.includes(p));

  return {
    addedPlayers,
    removedPlayers,
    addedPicks,
    removedPicks,
    faabChanged,
    faabBefore,
    faabAfter,
    contactChanged,
    contactBefore: oldContact,
    contactAfter: newContact,
    lookingForChanged,
    lookingForBefore: oldLookingFor,
    lookingForAfter: newLookingFor,
    tagsChanged,
    tagsBefore,
    tagsAfter,
    addedPositions,
    removedPositions,
    addedPickTags,
    removedPickTags,
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function pickTemplate<T>(arr: T[], rng: () => number): T {
  const idx = Math.floor(rng() * arr.length);
  return arr[idx];
}

const TEMPLATES = {
  playerAddSingle: [
    "I'm hearing {team} {verb} {player}.",
    "According to sources, {team} {verb} {player}.",
    "Sources tell me {team} {verb} {player}.",
    "Per sources, {team} {verb} {player}.",
    "{team} {verb} {player}, per league sources.",
    "Multiple sources indicate {team} {verb} {player}.",
    "Word around the league is {team} {verb} {player}.",
    "League insiders say {team} {verb} {player}.",
    "From what I'm hearing, {team} {verb} {player}.",
    "Sources close to the situation say {team} {verb} {player}.",
    "I'm told {team} {verb} {player}.",
    "The latest: {team} {verb} {player}, per sources.",
    "Breaking from my sources: {team} {verb} {player}.",
    "League sources confirm {team} {verb} {player}.",
    "Per league insiders, {team} {verb} {player}.",
    "Sources say {team} {verb} {player}. The team has been fielding calls.",
    "I'm told {team} {verb} {player}. They're open to offers but not desperate to move him.",
    "Breaking: {team} {verb} {player}. Multiple teams have expressed interest, per sources.",
    "Word is {team} {verb} {player}. League sources describe them as serious sellers.",
    "According to sources, {team} {verb} {player}. The asking price is believed to be significant.",
  ],
  playerAddMultiple: [
    "I'm hearing {team} {verb} {players}.",
    "According to sources, {team} {verb} {players}.",
    "Sources say {team} {verb} {players}.",
    "Per sources, {team} {verb} {players}.",
    "{team} {verb} {players}, according to sources.",
    "Multiple sources tell me {team} {verb} {players}.",
    "Word is {team} {verb} {players}.",
    "League insiders say {team} {verb} {players}.",
    "From what I'm gathering, {team} {verb} {players}.",
    "Sources close to the team indicate {team} {verb} {players}.",
    "I'm told {team} {verb} {players}.",
    "The latest from my sources: {team} {verb} {players}.",
    "Multiple league sources confirm {team} {verb} {players}.",
    "Breaking: {team} {verb} {players}.",
    "League sources say {team} {verb} {players}.",
    "Sources tell me {team} {verb} {players}. The team is open to moving multiple pieces.",
    "I'm hearing {team} {verb} {players}. They've been actively shopping the group, per sources.",
    "According to league insiders, {team} {verb} {players}. Several teams have shown interest.",
    "Breaking: {team} {verb} {players}. The market is believed to be strong.",
    "Word is {team} {verb} {players}. Sources describe the team as motivated sellers looking to shake things up.",
  ],
  playerRemoveSingle: [
    "Sources say {team} {verb} {player}.",
    "I'm hearing {team} {verb} {player}.",
    "According to sources, {team} {verb} {player}.",
    "League sources indicate {team} {verb} {player}.",
    "{team} {verb} {player}, per sources.",
    "Word around the league is {team} {verb} {player}.",
    "Multiple sources tell me {team} {verb} {player}.",
    "From what I'm hearing, {team} {verb} {player}.",
    "The latest: {team} {verb} {player}.",
    "I'm told {team} {verb} {player}.",
    "Per league sources, {team} {verb} {player}.",
    "League sources confirm {team} {verb} {player}.",
    "Sources tell me {team} {verb} {player}. The decision came after reassessing their roster needs.",
    "I'm hearing {team} {verb} {player}. Per sources, the team had a change of heart on moving him.",
    "Breaking: {team} {verb} {player}. They're now expected to hold onto him for the foreseeable future.",
    "Word is {team} {verb} {player}. League sources say talks cooled off after initial interest.",
  ],
  playerRemoveMultiple: [
    "Sources say {team} {verb} {players}.",
    "I'm hearing {team} {verb} {players}.",
    "Per league sources, {team} {verb} {players}.",
    "{team} {verb} {players}, according to sources.",
    "League insiders say {team} {verb} {players}.",
    "Word is {team} {verb} {players}.",
    "From what I'm gathering, {team} {verb} {players}.",
    "I'm told {team} {verb} {players}.",
    "League sources confirm {team} {verb} {players}.",
    "Breaking: {team} {verb} {players}.",
    "Sources tell me {team} {verb} {players}. The team is taking a different approach moving forward.",
    "I'm hearing {team} {verb} {players}. Per league insiders, they're now committed to this core group.",
    "Word around the league is {team} {verb} {players}. The market didn't develop as expected, per sources.",
  ],
  pickAddSingle: [
    "I'm also hearing {team} {verb} their {pick}.",
    "Sources say {team} {verb} their {pick}.",
    "Additionally, {team} {verb} their {pick}.",
    "{team} {verb} their {pick}, per sources.",
    "On the draft capital front, {team} {verb} their {pick}.",
    "Word is {team} {verb} their {pick} as well.",
    "Sources also indicate {team} {verb} their {pick}.",
    "I'm told {team} {verb} their {pick} too.",
    "Adding to that, {team} {verb} their {pick}.",
    "League sources say {team} {verb} their {pick}.",
    "In terms of picks, {team} {verb} their {pick}.",
    "From what I'm hearing, {team} {verb} their {pick} as well.",
    "Per sources, {team} {verb} their {pick} on top of that.",
  ],
  pickAddMultiple: [
    "I'm also hearing {team} {verb} {picks}.",
    "Sources indicate {team} {verb} {picks}.",
    "{team} {verb} {picks}, per sources.",
    "On the draft capital front, {team} {verb} {picks}.",
    "Word is {team} {verb} {picks} as well.",
    "Additionally, {team} {verb} {picks}.",
    "League sources say {team} {verb} {picks}.",
    "I'm told {team} {verb} {picks} too.",
    "In terms of picks, {team} {verb} {picks}.",
    "From what I'm gathering, {team} {verb} {picks} as well.",
  ],
  pickRemoveSingle: [
    "Sources say {team} {verb} their {pick}.",
    "{team} {verb} their {pick}, according to sources.",
    "I'm hearing {team} {verb} their {pick}.",
    "On the pick front, {team} {verb} their {pick}.",
    "League sources indicate {team} {verb} their {pick}.",
    "Word is {team} {verb} their {pick}.",
    "Per sources, {team} {verb} their {pick}.",
    "In terms of draft capital, {team} {verb} their {pick}.",
  ],
  pickRemoveMultiple: [
    "Sources say {team} {verb} {picks}.",
    "{team} {verb} {picks}, per sources.",
    "I'm hearing {team} {verb} {picks}.",
    "On the draft capital front, {team} {verb} {picks}.",
    "League sources indicate {team} {verb} {picks}.",
    "Word is {team} {verb} {picks}.",
    "In terms of picks, {team} {verb} {picks}.",
  ],
  mixed: [
    "{team} {verbAdd} {added} but {verbRemove} {removed}.",
    "Sources say {team} {verbAdd} {added} while {verbRemove} {removed}.",
    "The latest from my sources: {team} {verbAdd} {added}, though they {verbRemove} {removed}.",
    "Word is {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "League insiders tell me {team} {verbAdd} {added} while {verbRemove} {removed}.",
    "From what I'm gathering, {team} {verbAdd} {added} even as they {verbRemove} {removed}.",
    "Per sources, {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "Breaking: {team} {verbAdd} {added} while {verbRemove} {removed}.",
    "Multiple sources say {team} {verbAdd} {added}, though they {verbRemove} {removed}.",
    "According to league sources, {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "I'm told {team} {verbAdd} {added} even as they {verbRemove} {removed}.",
    "League sources confirm {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "Sources tell me {team} {verbAdd} {added} while {verbRemove} {removed}. The team is recalibrating their approach.",
    "Breaking: {team} {verbAdd} {added} but {verbRemove} {removed}. Per sources, they're being selective about what they'll move.",
    "Word around the league is {team} {verbAdd} {added} even as they {verbRemove} {removed}. The strategy shift is notable.",
  ],
  lookingFor: [
    "A {team} source tells me: \"{wants}.\"",
    "According to a {team} team official: \"{wants}.\"",
    "Per someone close to the {team}: \"{wants}.\"",
    "A {team} insider says: \"{wants}.\"",
    "I'm told by a {team} source: \"{wants}.\"",
    "From a {team} source: \"{wants}.\"",
    "League source with knowledge of the {team}'s thinking: \"{wants}.\"",
    "A {team} team official tells me: \"{wants}.\"",
    "Per a {team} source familiar with their plans: \"{wants}.\"",
    "Source close to the {team}: \"{wants}.\"",
    "{team} official on what they're after: \"{wants}.\"",
    "I'm hearing from a {team} source: \"{wants}.\"",
    "According to someone in the {team}'s front office: \"{wants}.\"",
    "A league source quotes a {team} official: \"{wants}.\"",
    "Per a {team} source with direct knowledge: \"{wants}.\"",
    "Source with knowledge of the {team}'s plans says: \"{wants}.\" The team has been exploring their options.",
    "A {team} official told me today: \"{wants}.\" They've been working the phones.",
    "From a {team} source familiar with the situation: \"{wants}.\" The team is being selective but open to conversations.",
  ],
  tagsPositional: [
    "Sources say the {team} are looking to acquire {positions} in any deal.",
    "I'm hearing the {team} want to add help at {positions}.",
    "League sources indicate the {team} are targeting {positions} as a key need.",
    "Word is the {team} are looking to land {positions} in return.",
    "The {team} are believed to be seeking upgrades at {positions}.",
    "Per sources, the {team} want to bring in {positions} as part of any trade.",
    "From what I'm gathering, the {team} are hoping to acquire {positions}.",
    "Multiple sources say the {team} are looking for {positions} in trade talks.",
    "I'm told the {team} are seeking to bolster {positions}.",
    "The {team} have identified {positions} as areas they're looking to strengthen.",
    "According to league insiders, the {team} are prioritizing {positions}. They've made that clear in discussions with other teams.",
    "Sources say the {team} want to add at {positions}. Per league sources, it's their top priority in any potential deal.",
    "I'm hearing the {team} are looking for {positions} help. Multiple teams know what they're after, per sources.",
  ],
  tagsPicks: [
    "In terms of draft capital, the {team} are looking to acquire {picks} in return.",
    "Sources say the {team} want to get {picks} back in any deal.",
    "I'm hearing the {team} are hoping to land {picks} as part of a trade.",
    "The {team} are believed to be targeting {picks}, per sources.",
    "League sources indicate the {team} are seeking to add {picks}.",
    "Word is the {team} want {picks} included in any package.",
    "From what I'm told, the {team} are looking to bring in {picks}.",
    "The {team}'s focus is on securing {picks}, per league insiders.",
    "I'm hearing the {team} want to stockpile {picks} through trades.",
    "According to sources, the {team} are prioritizing draft capital. They're specifically looking for {picks} in any potential deal.",
    "Sources say the {team} are focused on {picks}. Per league insiders, they're building for the future and want to add premium picks.",
  ],
  tagsCombo: [
    "Sources say the {team} are looking to acquire {positions} and {picks} in return.",
    "I'm hearing the {team} want to bring in {positions} along with {picks}.",
    "The {team} are hoping to land {positions} and also get {picks} back, per sources.",
    "Word is the {team} are seeking {positions} and {picks} in any deal.",
    "According to sources, the {team} are looking for {positions} help and {picks} to come back.",
    "Per league insiders, the {team} want to acquire {positions} and also land {picks}.",
    "I'm told the {team} are hoping to get {positions} in return alongside {picks}.",
    "League sources say the {team} are targeting both {positions} and {picks}. Per sources, they want immediate help plus future assets.",
  ],
  marketContext: [
    "Notably, {count} {plural} currently {verb} {asset}, creating potential buyer interest.",
    "With {count} {plural} seeking {asset}, there's a competitive market.",
    "Interestingly, {count} {plural} {verb} {asset} across the league.",
    "Worth noting: {count} {plural} have expressed interest in {asset}.",
    "League intel shows {count} {plural} {verb} {asset} right now.",
    "Sources say {count} {plural} are in the market for {asset}.",
    "The demand for {asset} is strong with {count} {plural} looking.",
  ],
  headliner: [
    " Notably, {headliners} {verb} on the block.",
    " {headliners} {verb} believed to be available.",
    " Sources say {headliners} {verb} in play.",
    " Word is {headliners} {verb} drawing interest.",
    " I'm told {headliners} {verb} generating calls.",
    " {headliners} {verb} reportedly available.",
    " Among the names available: {headliners}.",
    " The centerpiece{plural} could be {headliners}.",
    " Key assets include {headliners}.",
    " {headliners} {verb} the headliner{plural}.",
  ],
};

const VERBS_ADD = [
  'are open to moving',
  'are shopping',
  'have made available',
  'are listening on offers for',
  'are fielding calls on',
  'are willing to discuss',
  'are actively shopping',
  'are taking calls on',
  'have put on the block',
  'are gauging interest in',
  'are making available',
  'are open to dealing',
  'are willing to part with',
  'have signaled willingness to move',
  'are exploring deals for',
  'are entertaining offers for',
  'have opened trade discussions on',
  'are receptive to offers on',
  'are testing the market on',
  'are floating in trade talks',
];

const VERBS_REMOVE = [
  'are pulling back on',
  'are no longer shopping',
  'have taken off the block',
  'are keeping',
  'have decided to hold onto',
  'are reluctant to move',
  'have shut down talks on',
  'are no longer entertaining offers for',
  'have removed from availability',
  'are standing pat on',
  'have closed the door on moving',
  'are backing off talks for',
  'have pulled from trade discussions',
  'are now holding onto',
  'have decided against dealing',
  'are no longer willing to part with',
  'have ended discussions on',
  'are keeping off the market',
];

const VERBS_PICK_ADD = [
  'are making available',
  'are open to moving',
  'are willing to part with',
  'have added to the block',
  'are shopping',
  'are listening on',
  'have put in play',
  'are fielding calls on',
  'are open to dealing',
  'have signaled willingness to move',
  'are entertaining offers for',
  'are willing to discuss',
];

const VERBS_PICK_REMOVE = [
  'are pulling back on',
  'are keeping',
  'are no longer shopping',
  'have taken off the table',
  'are holding onto',
  'have shut down talks on',
  'are no longer willing to move',
  'have removed from availability',
];

const OPENERS = [
  'Breaking news:',
  'Latest intel:',
  'Just in:',
  'Hearing this morning:',
  'Developing story:',
  'Per my sources:',
  'League update:',
  'Trade block news:',
  'Sources across the league tell me:',
  'Getting word that:',
  'Multiple sources confirm:',
  'The latest from around the league:',
  'Big news:',
  'Important development:',
];

const CLOSERS = [
  'More to come as this develops.',
  'Situation remains fluid.',
  'Will monitor closely.',
  'Stay tuned for updates.',
  'Expect more movement soon.',
  'Things are heating up.',
  'Worth watching closely.',
  'Developing situation.',
  'This could get interesting.',
  'Keep an eye on this.',
  'More details to follow.',
];

const TRANSITIONS = [
  'Meanwhile,',
  'Additionally,',
  'In other news,',
  'On another front,',
  'Separately,',
  'Also worth noting:',
  'At the same time,',
  'On a related note,',
];

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

export async function getLeagueMarketContext(): Promise<LeagueMarketContext> {
  const { listAllUserDocs } = await import('@/server/db/queries');
  const allDocs = await listAllUserDocs().catch(() => []);
  
  const teamsSeekingPositions: Record<string, number> = {};
  const teamsSeekingPickRounds: Record<string, number> = {};
  
  for (const doc of allDocs) {
    if (!doc.tradeWants) continue;
    const wants = doc.tradeWants as unknown as TradeWants;
    if (!wants.positions || !Array.isArray(wants.positions)) continue;
    
    for (const pos of wants.positions) {
      const upper = pos.toUpperCase();
      if (upper === '1ST' || upper === '2ND' || upper === '3RD') {
        teamsSeekingPickRounds[upper] = (teamsSeekingPickRounds[upper] || 0) + 1;
      } else if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(upper)) {
        teamsSeekingPositions[upper] = (teamsSeekingPositions[upper] || 0) + 1;
      }
    }
  }
  
  return { teamsSeekingPositions, teamsSeekingPickRounds };
}

async function selectHeadliners(
  addedPlayers: TradeAsset[],
  currentPlayers: TradeAsset[],
  removedPlayers: TradeAsset[],
  players: Record<string, { first_name?: string; last_name?: string; position?: string; team?: string }>
): Promise<string[]> {
  const candidates: TradeAsset[] = [];
  
  if (addedPlayers.length > 0) {
    candidates.push(...addedPlayers.slice(0, 2));
  } else {
    const removedIds = new Set(removedPlayers.map((a) => a.type === 'player' ? a.playerId : ''));
    const available = currentPlayers.filter((a) => a.type === 'player' && !removedIds.has(a.playerId));
    const sorted = available.sort((a, b) => {
      if (a.type !== 'player' || b.type !== 'player') return 0;
      return a.playerId.localeCompare(b.playerId);
    });
    candidates.push(...sorted.slice(0, 2));
  }

  const labels: string[] = [];
  for (const asset of candidates) {
    labels.push(await assetToLabel(asset, players));
  }
  return labels;
}

export async function buildTradeBlockReport(ctx: NarrativeContext): Promise<string | null> {
  const { teamName, diff, currentPlayers, baseUrl, updatedAt, leagueContext } = ctx;

  const hasPlayerChanges = diff.addedPlayers.length > 0 || diff.removedPlayers.length > 0;
  const hasPickChanges = diff.addedPicks.length > 0 || diff.removedPicks.length > 0;
  const hasTagChanges = diff.addedPositions.length > 0 || diff.removedPositions.length > 0 || diff.addedPickTags.length > 0 || diff.removedPickTags.length > 0;
  const hasAnyChange = hasPlayerChanges || hasPickChanges || diff.faabChanged || diff.lookingForChanged || diff.contactChanged || hasTagChanges;

  if (!hasAnyChange) {
    return null;
  }

  const players = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string; team?: string }>));

  const seed = simpleHash(`${teamName}|${updatedAt}|${JSON.stringify(diff)}`);
  const rng = seededRandom(seed);
  
  const useOpener = rng() > 0.6;
  const useCloser = rng() > 0.7;
  const useTransition = hasPickChanges && hasPlayerChanges && rng() > 0.5;

  if (DEBUG) {
    console.log(`[trade-block-narrative][${teamName}] seed: ${seed}`);
    console.log(`[trade-block-narrative][${teamName}] diff:`, {
      addedPlayers: diff.addedPlayers.length,
      removedPlayers: diff.removedPlayers.length,
      addedPicks: diff.addedPicks.length,
      removedPicks: diff.removedPicks.length,
      lookingForChanged: diff.lookingForChanged,
      addedPositions: diff.addedPositions,
      addedPickTags: diff.addedPickTags,
    });
  }

  const parts: string[] = [];
  
  if (useOpener) {
    parts.push(pickTemplate(OPENERS, rng));
  }

  const addedPlayerLabels = await Promise.all(diff.addedPlayers.map((a) => assetToLabel(a, players)));
  const removedPlayerLabels = await Promise.all(diff.removedPlayers.map((a) => assetToLabel(a, players)));
  const addedPickLabels = diff.addedPicks.map(pickToLabel);
  const removedPickLabels = diff.removedPicks.map(pickToLabel);

  if (diff.addedPlayers.length > 0 && diff.removedPlayers.length === 0) {
    const verb = pickTemplate(VERBS_ADD, rng);
    if (diff.addedPlayers.length === 1) {
      const tpl = pickTemplate(TEMPLATES.playerAddSingle, rng);
      const sentence = tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{player}', addedPlayerLabels[0]);
      parts.push(sentence);
    } else {
      const tpl = pickTemplate(TEMPLATES.playerAddMultiple, rng);
      const playerList = formatList(addedPlayerLabels);
      const sentence = tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{players}', playerList);
      parts.push(sentence);
    }
  } else if (diff.removedPlayers.length > 0 && diff.addedPlayers.length === 0) {
    const verb = pickTemplate(VERBS_REMOVE, rng);
    if (diff.removedPlayers.length === 1) {
      const tpl = pickTemplate(TEMPLATES.playerRemoveSingle, rng);
      const sentence = tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{player}', removedPlayerLabels[0]);
      parts.push(sentence);
    } else {
      const tpl = pickTemplate(TEMPLATES.playerRemoveMultiple, rng);
      const playerList = formatList(removedPlayerLabels);
      const sentence = tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{players}', playerList);
      parts.push(sentence);
    }
  } else if (diff.addedPlayers.length > 0 && diff.removedPlayers.length > 0) {
    const verbAdd = pickTemplate(VERBS_ADD, rng);
    const verbRemove = pickTemplate(VERBS_REMOVE, rng);
    const tpl = pickTemplate(TEMPLATES.mixed, rng);
    const addedList = formatList(addedPlayerLabels);
    const removedList = formatList(removedPlayerLabels);
    const sentence = tpl.replace('{team}', teamName).replace('{verbAdd}', verbAdd).replace('{added}', addedList).replace('{verbRemove}', verbRemove).replace('{removed}', removedList);
    parts.push(sentence);
  }

  if (diff.addedPicks.length > 0 && diff.removedPicks.length === 0) {
    if (useTransition && parts.length > 0) {
      parts.push(pickTemplate(TRANSITIONS, rng));
    }
    const verb = pickTemplate(VERBS_PICK_ADD, rng);
    if (diff.addedPicks.length === 1) {
      const tpl = pickTemplate(TEMPLATES.pickAddSingle, rng);
      parts.push(tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{pick}', addedPickLabels[0]));
    } else {
      const tpl = pickTemplate(TEMPLATES.pickAddMultiple, rng);
      const pickList = formatList(addedPickLabels);
      parts.push(tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{picks}', pickList));
    }
  } else if (diff.removedPicks.length > 0 && diff.addedPicks.length === 0) {
    if (useTransition && parts.length > 0) {
      parts.push(pickTemplate(TRANSITIONS, rng));
    }
    const verb = pickTemplate(VERBS_PICK_REMOVE, rng);
    if (diff.removedPicks.length === 1) {
      const tpl = pickTemplate(TEMPLATES.pickRemoveSingle, rng);
      parts.push(tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{pick}', removedPickLabels[0]));
    } else {
      const tpl = pickTemplate(TEMPLATES.pickRemoveMultiple, rng);
      const pickList = formatList(removedPickLabels);
      parts.push(tpl.replace('{team}', teamName).replace('{verb}', verb).replace('{picks}', pickList));
    }
  }

  if (diff.lookingForChanged && diff.lookingForAfter) {
    const tpl = pickTemplate(TEMPLATES.lookingFor, rng);
    parts.push(tpl.replace('{team}', teamName).replace('{wants}', diff.lookingForAfter));

    // Always add context about what's available when looking-for changes
    if (currentPlayers.length > 0) {
      const headliners = await selectHeadliners(diff.addedPlayers, currentPlayers, diff.removedPlayers, players);
      if (headliners.length > 0) {
        const headlinerList = formatList(headliners);
        const verb = headliners.length === 1 ? 'is' : 'are';
        const plural = headliners.length === 1 ? '' : 's';
        const tpl = pickTemplate(TEMPLATES.headliner, rng);
        parts.push(tpl.replace('{headliners}', headlinerList).replace('{verb}', verb).replace('{plural}', plural));
      }
    }
  }

  if (diff.addedPositions.length > 0 || diff.addedPickTags.length > 0) {
    const hasPositions = diff.addedPositions.length > 0;
    const hasPicks = diff.addedPickTags.length > 0;
    
    if (hasPositions && hasPicks) {
      const tpl = pickTemplate(TEMPLATES.tagsCombo, rng);
      const positionList = formatList(diff.addedPositions);
      const pickList = formatList(diff.addedPickTags);
      parts.push(tpl.replace('{team}', teamName).replace('{positions}', positionList).replace('{picks}', pickList));
    } else if (hasPositions) {
      const tpl = pickTemplate(TEMPLATES.tagsPositional, rng);
      const positionList = formatList(diff.addedPositions);
      parts.push(tpl.replace('{team}', teamName).replace('{positions}', positionList));
    } else if (hasPicks) {
      const tpl = pickTemplate(TEMPLATES.tagsPicks, rng);
      const pickList = formatList(diff.addedPickTags);
      parts.push(tpl.replace('{team}', teamName).replace('{picks}', pickList));
    }
    
    // Add context about what's on the block when tags change
    if (currentPlayers.length > 0) {
      const headliners = await selectHeadliners(diff.addedPlayers, currentPlayers, diff.removedPlayers, players);
      if (headliners.length > 0) {
        const headlinerList = formatList(headliners);
        const verb = headliners.length === 1 ? 'is' : 'are';
        const plural = headliners.length === 1 ? '' : 's';
        const tpl = pickTemplate(TEMPLATES.headliner, rng);
        parts.push(tpl.replace('{headliners}', headlinerList).replace('{verb}', verb).replace('{plural}', plural));
      }
    }
  }

  // Add market context if available
  if (leagueContext && rng() > 0.4) {
    const marketInsights: string[] = [];
    
    // Check if team is adding players that others want
    if (diff.addedPlayers.length > 0) {
      for (const player of diff.addedPlayers) {
        if (player.type !== 'player') continue;
        const playerData = players[player.playerId];
        if (playerData?.position) {
          const pos = playerData.position.toUpperCase();
          const seekers = leagueContext.teamsSeekingPositions[pos] || 0;
          if (seekers >= 2) {
            const tpl = pickTemplate(TEMPLATES.marketContext, rng);
            const plural = seekers === 1 ? 'team' : 'teams';
            const verb = seekers === 1 ? 'is seeking' : 'are seeking';
            const insight = tpl
              .replace('{count}', String(seekers))
              .replace('{plural}', plural)
              .replace('{verb}', verb)
              .replace('{asset}', pos);
            marketInsights.push(insight);
            break; // Only add one market insight
          }
        }
      }
    }
    
    // Check if team is adding picks that others want
    if (diff.addedPicks.length > 0 && marketInsights.length === 0) {
      for (const pick of diff.addedPicks) {
        if (pick.type !== 'pick') continue;
        const roundLabel = pick.round === 1 ? '1st' : pick.round === 2 ? '2nd' : pick.round === 3 ? '3rd' : `${pick.round}th`;
        const roundUpper = roundLabel.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const seekers = leagueContext.teamsSeekingPickRounds[roundUpper] || 0;
        if (seekers >= 2) {
          const tpl = pickTemplate(TEMPLATES.marketContext, rng);
          const plural = seekers === 1 ? 'team' : 'teams';
          const verb = seekers === 1 ? 'is seeking' : 'are seeking';
          const insight = tpl
            .replace('{count}', String(seekers))
            .replace('{plural}', plural)
            .replace('{verb}', verb)
            .replace('{asset}', `${roundLabel} round picks`);
          marketInsights.push(insight);
          break;
        }
      }
    }
    
    if (marketInsights.length > 0) {
      parts.push(marketInsights[0]);
    }
  }

  // Check if we have any substantive content (not just opener/closer)
  // This prevents posting empty messages when only contact/faab changed
  const hasSubstantiveContent = hasPlayerChanges || hasPickChanges || hasTagChanges || 
    (diff.lookingForChanged && diff.lookingForAfter);
  
  if (!hasSubstantiveContent || parts.length === 0) {
    if (DEBUG) {
      console.log(`[trade-block-narrative][${teamName}] No substantive content, skipping message`);
    }
    return null;
  }
  
  if (useCloser && rng() > 0.5) {
    parts.push(pickTemplate(CLOSERS, rng));
  }
  
  const tradeBlockUrl = baseUrl ? `${baseUrl}/trades/block` : '/trades/block';
  const hashtag = TEAM_HASHTAGS[teamName] || '';
  const hashtagSuffix = hashtag ? ` ${hashtag}` : '';
  const message = parts.join(' ') + `\n\n${tradeBlockUrl}${hashtagSuffix}`;

  if (DEBUG) {
    console.log(`[trade-block-narrative][${teamName}] message:`, message);
  }

  return message;
}

export function getTradeBlockBaseUrl(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return siteUrl.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://eastvswest.win';
}

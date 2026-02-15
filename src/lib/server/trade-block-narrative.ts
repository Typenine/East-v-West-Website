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
};

type NarrativeContext = {
  teamName: string;
  diff: DiffResult;
  currentPlayers: TradeAsset[];
  baseUrl: string | null;
  updatedAt: string;
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

function extractTags(wants: TradeWants | null): Set<string> {
  const tags = new Set<string>();
  if (!wants) return tags;
  if (Array.isArray(wants.positions)) {
    wants.positions.forEach((p) => tags.add(p.toUpperCase()));
  }
  return tags;
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
    "League chatter is {team} {verb} {player}.",
    "Sources tell me {team} {verb} {player}.",
    "Per sources, {team} {verb} {player}.",
    "There's buzz that {team} {verb} {player}.",
    "The sense is {team} {verb} {player}.",
    "{team} {verb} {player}, per league sources.",
    "Multiple sources indicate {team} {verb} {player}.",
    "Word around the league is {team} {verb} {player}.",
    "League insiders say {team} {verb} {player}.",
    "From what I'm hearing, {team} {verb} {player}.",
    "Sources close to the situation say {team} {verb} {player}.",
    "I'm told {team} {verb} {player}.",
    "According to multiple league sources, {team} {verb} {player}.",
    "The latest: {team} {verb} {player}, per sources.",
    "Breaking from my sources: {team} {verb} {player}.",
    "League sources confirm {team} {verb} {player}.",
    "Hearing from multiple people that {team} {verb} {player}.",
    "Per league insiders, {team} {verb} {player}.",
  ],
  playerAddMultiple: [
    "I'm hearing {team} {verb} {players}.",
    "According to sources, {team} {verb} {players}.",
    "League chatter is {team} {verb} {players}.",
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
    "Hearing {team} {verb} {players}, per league sources.",
    "Multiple league sources confirm {team} {verb} {players}.",
    "Per people familiar with the matter, {team} {verb} {players}.",
    "Breaking: {team} {verb} {players}.",
    "League sources say {team} {verb} {players}.",
    "According to people with knowledge of the situation, {team} {verb} {players}.",
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
    "League insiders say {team} {verb} {player}.",
    "The latest: {team} {verb} {player}.",
    "Sources close to the team say {team} {verb} {player}.",
    "I'm told {team} {verb} {player}.",
    "Per league sources, {team} {verb} {player}.",
    "According to multiple sources, {team} {verb} {player}.",
    "Hearing {team} {verb} {player}, per sources familiar with the situation.",
    "League sources confirm {team} {verb} {player}.",
    "Breaking news: {team} {verb} {player}.",
    "Multiple league insiders indicate {team} {verb} {player}.",
  ],
  playerRemoveMultiple: [
    "Sources say {team} {verb} {players}.",
    "I'm hearing {team} {verb} {players}.",
    "Per league sources, {team} {verb} {players}.",
    "{team} {verb} {players}, according to sources.",
    "League insiders say {team} {verb} {players}.",
    "Multiple sources indicate {team} {verb} {players}.",
    "Word is {team} {verb} {players}.",
    "From what I'm gathering, {team} {verb} {players}.",
    "The latest from sources: {team} {verb} {players}.",
    "I'm told {team} {verb} {players}.",
    "According to people close to the situation, {team} {verb} {players}.",
    "Sources close to the team say {team} {verb} {players}.",
    "Per multiple league sources, {team} {verb} {players}.",
    "League sources confirm {team} {verb} {players}.",
    "Breaking: {team} {verb} {players}.",
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
    "I'm hearing {team} {verbAdd} {added} and {verbRemove} {removed}.",
    "The latest from my sources: {team} {verbAdd} {added}, though they {verbRemove} {removed}.",
    "Word is {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "League insiders tell me {team} {verbAdd} {added} while {verbRemove} {removed}.",
    "From what I'm gathering, {team} {verbAdd} {added} even as they {verbRemove} {removed}.",
    "Per sources, {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "Breaking: {team} {verbAdd} {added} while {verbRemove} {removed}.",
    "Multiple sources say {team} {verbAdd} {added}, though they {verbRemove} {removed}.",
    "According to league sources, {team} {verbAdd} {added} but {verbRemove} {removed}.",
    "I'm told {team} {verbAdd} {added} even as they {verbRemove} {removed}.",
    "The sense around the league is {team} {verbAdd} {added} while {verbRemove} {removed}.",
    "League sources confirm {team} {verbAdd} {added} but {verbRemove} {removed}.",
  ],
  lookingFor: [
    "The {team} are believed to be targeting {wants}.",
    "Sources say the focus is on acquiring {wants}.",
    "League sources indicate the {team} are looking for {wants}.",
    "I'm hearing the {team}'s priority is {wants}.",
    "The sense is the {team} are targeting {wants}.",
    "From what I'm told, the {team} are seeking {wants}.",
    "Word around the league is the {team} want {wants}.",
    "Multiple sources say the {team}'s focus is {wants}.",
    "Per league insiders, the {team} are in the market for {wants}.",
    "The {team} are reportedly looking to land {wants}.",
    "Sources close to the team say they're after {wants}.",
    "I'm hearing the {team}'s wish list includes {wants}.",
    "According to sources, the {team} have their eyes on {wants}.",
    "The latest: the {team} are pursuing {wants}.",
    "League sources say the {team}'s target is {wants}.",
    "From what I'm gathering, the {team} are hoping to acquire {wants}.",
    "The {team} are believed to be in search of {wants}.",
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
  const { teamName, diff, currentPlayers, baseUrl, updatedAt } = ctx;

  const hasPlayerChanges = diff.addedPlayers.length > 0 || diff.removedPlayers.length > 0;
  const hasPickChanges = diff.addedPicks.length > 0 || diff.removedPicks.length > 0;
  const hasAnyChange = hasPlayerChanges || hasPickChanges || diff.faabChanged || diff.lookingForChanged || diff.contactChanged;

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

    if (currentPlayers.length > 0 && rng() > 0.3) {
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

  if (useCloser && rng() > 0.5) {
    parts.push(pickTemplate(CLOSERS, rng));
  }
  
  const tradeBlockUrl = baseUrl ? `${baseUrl}/trades/block` : '/trades/block';
  const message = parts.join(' ') + `\n\n${tradeBlockUrl}`;

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

// src/newsletter/compose.js
import { getProfile } from '../personality/sliders.js';
import { openerFor, makeBlurt } from '../personality/variability.js';
import { buildLLMRecaps } from './recaps.js';
import { analyzeTradeEvent } from '../analysis/trade_analyzer.js';
import { humanizeTradeWriteups } from './voice.js';
import { genWithLLM } from '../ai/llm.js';

function sentence(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }
const countBy = (arr, pred) => arr.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);

function buildIntroContext(week, pairs, events) {
  const numGames   = pairs.length;
  const blowouts   = countBy(pairs, p => p.margin >= 30);
  const nailbiters = countBy(pairs, p => p.margin <= 5);
  const biggest    = pairs[0] || null;
  const closest    = pairs.reduce((a, b) => (!a || b.margin < a.margin ? b : a), null);
  const trades     = events.filter(e => e.type === 'trade').length;
  const bigWaivers = events.filter(e => e.type === 'waiver' && e.relevance_score >= 70).length;
  return { numGames, blowouts, nailbiters, biggest, closest, trades, bigWaivers, week };
}

async function buildIntro(week, pairs, events) {
  const entProfileIntro = await getProfile('entertainer', 'Intro');
  const anaProfileIntro = await getProfile('analyst', 'Intro');
  const { numGames, blowouts, nailbiters, biggest, closest, trades, bigWaivers } = buildIntroContext(week, pairs, events);

  const eLines = [];
  eLines.push(`${openerFor('Intro','entertainer', entProfileIntro, week)} ${numGames} games — ${nailbiters} nail-biters, ${blowouts} blowouts.`);
  if (biggest) eLines.push(`Biggest flex: ${biggest.winner.name} +${biggest.margin.toFixed(1)}.`);
  if (closest && closest.matchup_id !== biggest?.matchup_id) eLines.push(`Closest: ${closest.winner.name} +${closest.margin.toFixed(1)}.`);
  if (trades || bigWaivers) eLines.push(`${trades} trades; ${bigWaivers} big-bid waivers.`);
  const bot1_text = eLines.join(' ');

  const aLines = [];
  aLines.push(`${openerFor('Intro','analyst', anaProfileIntro, week)} We'll monitor stability next week.`);
  const bot2_text = aLines.join(' ');
  return { bot1_text, bot2_text };
}

async function buildLLMIntro(week, pairs, events, memEntertainer, memAnalyst, relationship) {
  const fallback = await buildIntro(week, pairs, events);
  const { numGames, blowouts, nailbiters, biggest, closest, trades, bigWaivers } = buildIntroContext(week, pairs, events);

  const lead = relationship?.dynamic?.entertainer_lead_in_predictions || 0;
  const relNote = lead !== 0
    ? `Season context: Entertainer is ${lead > 0 ? `up ${lead}` : `down ${Math.abs(lead)}`} in prediction record vs the Analyst.`
    : '';

  const context = [
    `Week ${week} summary: ${numGames} games, ${nailbiters} nail-biters, ${blowouts} blowouts.`,
    biggest  ? `Biggest win: ${biggest.winner.name} by ${biggest.margin.toFixed(1)}.`  : '',
    closest && closest.matchup_id !== biggest?.matchup_id
               ? `Closest game: ${closest.winner.name} by ${closest.margin.toFixed(1)}.` : '',
    (trades || bigWaivers) ? `${trades} trades this week; ${bigWaivers} high-priority waiver adds.` : '',
    relNote
  ].filter(Boolean).join(' ');

  const entSys = `You are the Entertainer, a fantasy football personality. Mood: ${memEntertainer?.summaryMood || 'Focused'}. Sarcasm 8/10, excitability 9/10, depth 4/10. Write a punchy 2-sentence weekly opener. No raw scores. Reply with only the opener.`;
  const anaSys = `You are the Analyst, a fantasy football personality. Mood: ${memAnalyst?.summaryMood || 'Focused'}. Depth 9/10, measured tone. Write a measured 1-2 sentence weekly opener that sets an analytical frame. Reply with only the opener.`;

  const [bot1_text, bot2_text] = await Promise.all([
    genWithLLM(entSys, context, 100).catch(() => null),
    genWithLLM(anaSys, context, 100).catch(() => null)
  ]);

  return {
    bot1_text: bot1_text ?? fallback.bot1_text,
    bot2_text: bot2_text ?? fallback.bot2_text
  };
}

async function buildLLMFinalWord(relationship, week) {
  const fallback = {
    bot1: `That’s the show. Somebody’s about to get humbled.`,
    bot2: `On to the next slate—small edges add up.`
  };

  const debateCount = relationship?.dynamic?.total_pushbacks || 0;
  const lead        = relationship?.dynamic?.entertainer_lead_in_predictions || 0;
  const context = [
    `End of week ${week}.`,
    lead !== 0 ? `Entertainer is ${lead > 0 ? `up ${lead}` : `down ${Math.abs(lead)}`} in season predictions vs Analyst.` : '',
    debateCount ? `${debateCount} on-record debate${debateCount > 1 ? 's' : ''} so far this season.` : ''
  ].filter(Boolean).join(' ');

  const entSys = `You are the Entertainer, a fantasy football personality. Sarcasm 8/10, excitability 9/10. Write one punchy closing sentence to end the newsletter. React to the season context. Reply with only the sentence.`;
  const anaSys = `You are the Analyst, a fantasy football personality. Depth 9/10, measured tone. Write one calm, forward-looking closing sentence. Reply with only the sentence.`;

  const [bot1, bot2] = await Promise.all([
    genWithLLM(entSys, context, 60).catch(() => null),
    genWithLLM(anaSys, context, 60).catch(() => null)
  ]);

  return { bot1: bot1 ?? fallback.bot1, bot2: bot2 ?? fallback.bot2 };
}

export async function composeNewsletter({
  leagueName, week, derived, memEntertainer, memAnalyst, forecast, tagsBundle,
  posCounts, players, dynastyConfig, season, rosterPlayersByTeam, lastCallbacks,
  relationship, playerMemory
}) {
  const pairs = derived.matchup_pairs || [];
  const events = derived.events_scored || [];

  const intro = await buildLLMIntro(week, pairs, events, memEntertainer, memAnalyst, relationship);
  const blurtData = { bot1: makeBlurt('entertainer', memEntertainer?.summaryMood), bot2: makeBlurt('analyst', memAnalyst?.summaryMood) };
  const recaps = await buildLLMRecaps(pairs, tagsBundle, memEntertainer, memAnalyst, relationship, week, playerMemory);

  const waiverItems = events
    .filter(e => e.type === 'waiver' || (e.type === 'fa_add' && e.relevance_score >= 40))
    .map(e => {
      const player = e.player || 'a depth piece';
      const cov = String(e.coverage_level || '').toLowerCase();
      const flavor =
        cov === 'high' ? 'splashy add' :
        cov === 'moderate' ? 'solid add' :
        'depth flyer';
      return ({
        event_id: e.event_id,
        coverage_level: e.coverage_level,
        reasons: e.reasons || e.why || [],
        bot1: `${e.team} bags ${player} — ${flavor}; if the role sticks, this plays.`,
        bot2: `${e.team} adds ${player}; process checks out. Track usage and snaps.`
      });
    });

  // Trades with analysis, then humanize paragraphs + optional debate line
  const tradeItems = await Promise.all(
    events.filter(e => e.type === 'trade').map(async e => {
      const item = {
        event_id: e.event_id,
        coverage_level: e.coverage_level,
        reasons: e.reasons || e.why || [],
        context: e.details?.headline ? `${e.parties?.join(' ↔ ')}: ${e.details.headline}` : e.parties?.join(' ↔ ') || 'Trade',
        teams: e.details?.by_team || null,
        analysis: analyzeTradeEvent(e, posCounts, tagsBundle, memEntertainer, memAnalyst, { players, dynasty: dynastyConfig, season, rosterPlayersByTeam })
      };
      return humanizeTradeWriteups(item, tagsBundle, memEntertainer, memAnalyst);
    })
  );

  const spotlightPair = pairs[0] || null;
  const spotlight = spotlightPair ? {
    team: spotlightPair.winner.name,
    bot1: `Spotlight: ${spotlightPair.winner.name} owns the week by ${spotlightPair.margin.toFixed(1)}.`,
    bot2: `Largest win by ${spotlightPair.winner.name}.`
  } : null;

  const finalWord = await buildLLMFinalWord(relationship, week);

  const sections = [{ type:'Intro', data:intro }];
  if (lastCallbacks) sections.push({ type:'Callbacks', data:lastCallbacks });
  if (blurtData.bot1 || blurtData.bot2) sections.push({ type:'Blurt', data:blurtData });
  sections.push(
    { type:'MatchupRecaps', data:recaps },
    { type:'WaiversAndFA', data:waiverItems },
    { type:'Trades', data:tradeItems }
  );
  if (spotlight) sections.push({ type:'SpotlightTeam', data:spotlight });
  if (forecast) sections.push({ type:'Forecast', data:forecast });
  sections.push({ type:'FinalWord', data:finalWord });

  return { meta:{ leagueName, week, date:new Date().toLocaleDateString() }, sections, _forCallbacks:{ tradeItems, spotlight } };
}
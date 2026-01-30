/**
 * Compose Module
 * Assembles all newsletter sections into a complete newsletter object
 */

import type {
  Newsletter,
  NewsletterSection,
  DerivedData,
  BotMemory,
  ForecastData,
  IntroSection,
  BlurtSection,
  WaiverItem,
  TradeItem,
  SpotlightSection,
  FinalWordSection,
  CallbacksSection,
} from './types';
import { getProfile, openerFor, makeBlurt } from './personality';
import { buildDeepRecaps } from './recaps';

// ============ Helper Functions ============

function sentence(str: string | undefined): string {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

function countBy<T>(arr: T[], pred: (x: T) => boolean): number {
  return arr.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
}

// ============ Section Builders ============

async function buildIntro(
  week: number,
  pairs: DerivedData['matchup_pairs'],
  events: DerivedData['events_scored']
): Promise<IntroSection> {
  const entProfileIntro = getProfile('entertainer', 'Intro');
  const anaProfileIntro = getProfile('analyst', 'Intro');

  const numGames = pairs.length;
  const blowouts = countBy(pairs, p => p.margin >= 30);
  const nailbiters = countBy(pairs, p => p.margin <= 5);
  const biggest = pairs[0] || null;
  const closest = pairs.reduce((a, b) => (!a || b.margin < a.margin ? b : a), null as typeof pairs[0] | null);
  const trades = events.filter(e => e.type === 'trade').length;
  const bigWaivers = events.filter(e => e.type === 'waiver' && e.relevance_score >= 70).length;

  const eLines: string[] = [];
  eLines.push(`${openerFor('Intro', 'entertainer', entProfileIntro, week)} ${numGames} games — ${nailbiters} nail-biters, ${blowouts} blowouts.`);
  if (biggest) eLines.push(`Biggest flex: ${biggest.winner.name} +${biggest.margin.toFixed(1)}.`);
  if (closest && closest.matchup_id !== biggest?.matchup_id) {
    eLines.push(`Closest: ${closest.winner.name} +${closest.margin.toFixed(1)}.`);
  }
  if (trades || bigWaivers) eLines.push(`${trades} trades; ${bigWaivers} big-bid waivers.`);
  const bot1_text = eLines.join(' ');

  const aLines: string[] = [];
  aLines.push(`${openerFor('Intro', 'analyst', anaProfileIntro, week)} We'll monitor stability next week.`);
  const bot2_text = aLines.join(' ');

  return { bot1_text, bot2_text };
}

function buildWaiverItems(events: DerivedData['events_scored']): WaiverItem[] {
  return events
    .filter(e => e.type === 'waiver' || (e.type === 'fa_add' && e.relevance_score >= 40))
    .map(e => {
      const player = e.player || 'a depth piece';
      const cov = String(e.coverage_level || '').toLowerCase();
      const flavor =
        cov === 'high' ? 'splashy add' :
        cov === 'moderate' ? 'solid add' :
        'depth flyer';

      return {
        event_id: e.event_id,
        coverage_level: e.coverage_level,
        reasons: e.reasons || [],
        bot1: `${e.team} bags ${player} — ${flavor}; if the role sticks, this plays.`,
        bot2: `${e.team} adds ${player}; process checks out. Track usage and snaps.`,
      };
    });
}

function buildTradeItems(events: DerivedData['events_scored']): TradeItem[] {
  return events
    .filter(e => e.type === 'trade')
    .map(e => {
      const context = e.details?.headline
        ? `${e.parties?.join(' ↔ ')}: ${e.details.headline}`
        : e.parties?.join(' ↔ ') || 'Trade';

      // Simple analysis for now - can be enhanced with more sophisticated logic
      const analysis: Record<string, { grade: string; deltaText: string; entertainer_paragraph: string; analyst_paragraph: string }> = {};
      
      for (const party of e.parties || []) {
        const grade = e.relevance_score >= 70 ? 'B+' : e.relevance_score >= 50 ? 'B' : 'C+';
        analysis[party] = {
          grade,
          deltaText: 'neutral impact',
          entertainer_paragraph: `${party} makes a move. Let's see if it pays off.`,
          analyst_paragraph: `${party} adjusts roster composition. Monitor role changes.`,
        };
      }

      return {
        event_id: e.event_id,
        coverage_level: e.coverage_level,
        reasons: e.reasons || [],
        context,
        teams: e.details?.by_team || null,
        analysis,
      };
    });
}

function buildSpotlight(pairs: DerivedData['matchup_pairs']): SpotlightSection | null {
  const spotlightPair = pairs[0] || null;
  if (!spotlightPair) return null;

  return {
    team: spotlightPair.winner.name,
    bot1: `Spotlight: ${spotlightPair.winner.name} owns the week by ${spotlightPair.margin.toFixed(1)}.`,
    bot2: `Largest win by ${spotlightPair.winner.name}.`,
  };
}

function buildFinalWord(): FinalWordSection {
  return {
    bot1: "That's the show. Somebody's about to get humbled.",
    bot2: 'On to the next slate—small edges add up.',
  };
}

// ============ Main Compose Function ============

export interface ComposeNewsletterInput {
  leagueName: string;
  week: number;
  season: number;
  derived: DerivedData;
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  forecast: ForecastData | null;
  lastCallbacks?: CallbacksSection | null;
}

export async function composeNewsletter(input: ComposeNewsletterInput): Promise<Newsletter> {
  const {
    leagueName,
    week,
    season,
    derived,
    memEntertainer,
    memAnalyst,
    forecast,
    lastCallbacks,
  } = input;

  const pairs = derived.matchup_pairs || [];
  const events = derived.events_scored || [];

  // Build all sections
  const intro = await buildIntro(week, pairs, events);
  const blurtData: BlurtSection = {
    bot1: makeBlurt('entertainer', memEntertainer?.summaryMood),
    bot2: makeBlurt('analyst', memAnalyst?.summaryMood),
  };
  const recaps = buildDeepRecaps(pairs, null, memEntertainer, memAnalyst);
  const waiverItems = buildWaiverItems(events);
  const tradeItems = buildTradeItems(events);
  const spotlight = buildSpotlight(pairs);
  const finalWord = buildFinalWord();

  // Assemble sections array
  const sections: NewsletterSection[] = [
    { type: 'Intro', data: intro },
  ];

  if (lastCallbacks) {
    sections.push({ type: 'Callbacks', data: lastCallbacks });
  }

  if (blurtData.bot1 || blurtData.bot2) {
    sections.push({ type: 'Blurt', data: blurtData });
  }

  sections.push(
    { type: 'MatchupRecaps', data: recaps },
    { type: 'WaiversAndFA', data: waiverItems },
    { type: 'Trades', data: tradeItems }
  );

  if (spotlight) {
    sections.push({ type: 'SpotlightTeam', data: spotlight });
  }

  if (forecast) {
    sections.push({ type: 'Forecast', data: forecast });
  }

  sections.push({ type: 'FinalWord', data: finalWord });

  return {
    meta: {
      leagueName,
      week,
      date: new Date().toLocaleDateString(),
      season,
    },
    sections,
    _forCallbacks: { tradeItems, spotlight },
  };
}

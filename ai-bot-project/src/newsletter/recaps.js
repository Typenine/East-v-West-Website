// src/newsletter/recaps.js
// Opinion-first, narrative recaps with varied phrasing.
import { genWithLLM } from '../ai/llm.js';
import { getProfile } from '../personality/sliders.js';
import fs from 'fs-extra';

function cap(s) { return String(s || '').replace(/\s+/g, ' ').trim().replace(/^([a-z])/, m => m.toUpperCase()); }
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const getCap = (mem, name) => mem?.teams?.[name] || { trust: 0, frustration: 0, mood: 'Neutral' };
const trustDelta = t => (t.trust ?? 0) - (t.frustration ?? 0);

const tagsOf = (tb, team) => tb?.byTeam?.[team]?.tags || [];
const metOf  = (tb, team) => tb?.byTeam?.[team]?.metrics || {};
const actOf  = (tb, team) => tb?.byTeam?.[team]?.activity || { trades: 0, waiversHi: 0, waiversAny: 0 };

// ------- lightweight classifiers (no raw numbers in copy) -------
function marginLabel(m) {
  const x = Math.abs(Number(m) || 0);
  if (x >= 30) return { label: 'blowout', verbs: ['steamrolled', 'ran off the field', 'buried'] };
  if (x >= 15) return { label: 'comfortable win', verbs: ['handled', 'controlled', 'bossed'] };
  if (x <= 5)  return { label: 'nail-biter', verbs: ['escaped', 'squeaked by', 'survived'] };
  return { label: 'clean win', verbs: ['beat', 'outplayed', 'took down'] };
}
function trendWord(last3, season) {
  if (!Number.isFinite(last3) || !Number.isFinite(season)) return null;
  const d = last3 - season;
  if (d >= 6)  return pick(['arrow up', 'rising form', 'building momentum']);
  if (d <= -6) return pick(['slipping', 'form dipped', 'cooling off']);
  return pick(['on pace', 'par for them', 'about right']);
}
function stabilityWord(sd) {
  if (!Number.isFinite(sd)) return null;
  if (sd >= 16) return pick(['volatile', 'swingy', 'boom-or-bust']);
  if (sd <= 10) return pick(['stable', 'steady', 'buttoned-up']);
  return pick(['up-and-down', 'uneven']);
}
function tagHook(tags) {
  if (!tags?.length) return null;
  if (tags.includes('Reckless Contender')) return pick(['reckless contender swagger showed', 'they pressed the gas and it worked']);
  if (tags.includes('Chaos Agent'))        return pick(['chaos energy won out', 'embraced the mess and got paid']);
  if (tags.includes('Dark Horse'))         return pick(['dark-horse vibes are real', 'sneaky contender signs']);
  if (tags.includes('Safe Builder'))       return pick(['the methodical build showed', 'steady beats flashy']);
  if (tags.includes('Boom/Bust'))          return pick(['boom showed up, bust stayed home', 'high ceiling flashed']);
  return null;
}
function activityHook(act) {
  const trades = act?.trades || 0, hi = act?.waiversHi || 0;
  if (trades && hi) return pick(['after a busy week of moves', 'post-shakeup']);
  if (trades)       return pick(['after a roster reshuffle', 'post-trade tweak']);
  if (hi)           return pick(['after a high-FAAB swing', 'after a decisive claim']);
  return null;
}

// ------- lines -------
function entertainerTake(w, l, margin, tagsW, tagsL, metW, actW, entCap, losCap) {
  const { label, verbs } = marginLabel(margin);
  const lead = `${w} ${pick(verbs)} ${l} in a ${label}.`;

  const hooks = [];
  const tagNote = tagHook([...tagsW, ...tagsL]);
  const actNote = activityHook(actW);
  const trend = trendWord(metW.last3_avg, metW.season_avg);

  if (tagNote) hooks.push(cap(tagNote));
  if (actNote) hooks.push(cap(actNote));
  if (trend)   hooks.push(cap(trend));

  // pick at most 2 hooks to avoid rambling
  const reasons = hooks.slice(0, 2).join('. ');

  const t = trustDelta(entCap);
  const verdict =
    t >= 10 ? pick([`I’m buying ${w}.`, `Stamp it: I’m in.`]) :
    t <= -8 ? pick([`Still not sold.`, `Prove it again.`]) :
              pick([`Convince me next week.`, `Keep it coming.`]);

  const shade = (losCap.mood === 'Irritated') ? pick([`And ${l}? Spiraling.`, `${l} looked rattled.`]) : '';

  return [lead, reasons && reasons + '.', verdict, shade].filter(Boolean).join(' ');
}

function analystTake(w, l, margin, metW, metL, anaCap, actW) {
  const { label } = marginLabel(margin);
  const start = `${w} took a ${label}.`;

  const stW = stabilityWord(metW.stdev), stL = stabilityWord(metL.stdev);
  let stability = '';
  if (stW && stL) {
    if (stW === stL) stability = pick([`Both profiles looked ${stW}.`, `This was floor vs floor football.`]);
    else stability = pick([`${w} ${stW} beat ${l} ${stL}.`, `Steady beat swingy — edge ${w}.`]);
  } else if (stW) stability = `${w} looked ${stW}.`;

  const trend = trendWord(metW.last3_avg, metW.season_avg);
  const trendLine = trend ? (
    trend.includes('arrow') || trend.includes('rising') ? `Recent form supports it.` :
    trend.includes('slipping') || trend.includes('cooling') ? `Result outpaced their trend — regression watch.` :
    `Performance aligned with season profile.`
  ) : '';

  const actNote = activityHook(actW);
  const actLine = actNote ? `${cap(actNote)}, which helped at the margins.` : '';

  const t = trustDelta(anaCap);
  const verdict =
    t >= 10 ? pick([`Sustainable if usage holds.`, `Bankable if they stay healthy.`]) :
    t <= -8 ? pick([`Don’t overreact.`, `Caution on signal vs noise.`]) :
              pick([`Small step, not a leap.`, `Tentative thumbs-up.`]);

  return [start, stability, trendLine, actLine, verdict].filter(Boolean).join(' ');
}

// ------- LLM support -------
let _personas = null;
async function loadPersonas() {
  if (_personas) return _personas;
  const [ent, ana] = await Promise.all([
    fs.readJson('config/personas/entertainer.json').catch(() => ({})),
    fs.readJson('config/personas/analyst.json').catch(() => ({}))
  ]);
  _personas = { entertainer: ent, analyst: ana };
  return _personas;
}

function buildSystemPrompt(botName, profile, persona) {
  const rhetoric = persona.rhetoric || {};
  const stance = persona.stance || {};
  const openers = (rhetoric.openers || []).join('", "');
  const closers = (rhetoric.closers || []).join('", "');

  if (botName === 'entertainer') {
    return `You are the Entertainer, a fantasy football analyst. Writing profile: sarcasm ${profile.sarcasm}/10, snark ${profile.snark}/10, excitability ${profile.excitability}/10, depth ${profile.depth}/10. Pacing: bursty. Risk bias: ${stance.riskBias || 'pro-ceiling'}. You rarely concede (${Math.round((stance.concedeRate || 0.15) * 100)}% concede rate).

Write a 2-3 sentence matchup recap. Lead with a strong opinion on the result. Reference the outcome type and any narrative context provided (never cite raw scores). End with a punchy verdict. Typical openers: "${openers}". Typical closers: "${closers}".

Reply with only the recap text.`;
  }

  return `You are the Analyst, a fantasy football analyst. Writing profile: depth ${profile.depth}/10, sarcasm ${profile.sarcasm}/10, excitability ${profile.excitability}/10. Pacing: measured. Risk bias: ${stance.riskBias || 'floor-weighted'}. You frequently acknowledge uncertainty (${Math.round((stance.concedeRate || 0.45) * 100)}% concede rate).

Write a 2-4 sentence matchup recap. Lead with a stability or trend observation. Reference scoring consistency, form vs. baseline, and process. End with a sustainable outlook. Typical openers: "${openers}". Typical closers: "${closers}".

Reply with only the recap text.`;
}

function buildMatchupUserPrompt(p, tagsBundle, memBot) {
  const w = p?.winner?.name || 'Winner';
  const l = p?.loser?.name  || 'Loser';
  const margin = Number(p?.margin || 0);
  const { label } = marginLabel(margin);

  const tagsW  = tagsOf(tagsBundle, w);
  const tagsL  = tagsOf(tagsBundle, l);
  const metW   = metOf(tagsBundle, w);
  const metL   = metOf(tagsBundle, l);
  const actW   = actOf(tagsBundle, w);
  const capW   = getCap(memBot, w);
  const capL   = getCap(memBot, l);

  const trendW  = trendWord(metW.last3_avg, metW.season_avg) || 'on pace';
  const trendL  = trendWord(metL.last3_avg, metL.season_avg) || 'on pace';
  const stabW   = stabilityWord(metW.stdev) || 'consistent';
  const stabL   = stabilityWord(metL.stdev) || 'consistent';
  const actNote = activityHook(actW) || 'no notable moves';

  return [
    `Matchup: ${w} def. ${l} (${label})`,
    ``,
    `Winner (${w}):`,
    `- Tags: ${tagsW.length ? tagsW.join(', ') : 'none'}`,
    `- Recent form vs season: ${trendW}`,
    `- Scoring consistency: ${stabW}`,
    `- Activity this week: ${actNote}`,
    `- Memory: trust ${capW.trust >= 0 ? '+' : ''}${capW.trust}, frustration ${capW.frustration}, mood: ${capW.mood}`,
    ``,
    `Loser (${l}):`,
    `- Tags: ${tagsL.length ? tagsL.join(', ') : 'none'}`,
    `- Recent form vs season: ${trendL}`,
    `- Scoring consistency: ${stabL}`,
    `- Memory: trust ${capL.trust >= 0 ? '+' : ''}${capL.trust}, frustration ${capL.frustration}, mood: ${capL.mood}`,
    ``,
    `Write your recap now.`
  ].join('\n');
}

// ------- public -------
export function buildDeepRecaps(pairs = [], tagsBundle, memEntertainer, memAnalyst) {
  return pairs.map(p => {
    const w = p?.winner?.name || 'Winner';
    const l = p?.loser?.name  || 'Loser';
    const margin = Number(p?.margin || 0);

    const tagsW = tagsOf(tagsBundle, w), tagsL = tagsOf(tagsBundle, l);
    const metW  = metOf(tagsBundle, w),  metL  = metOf(tagsBundle, l);
    const actW  = actOf(tagsBundle, w);

    const eCapW = getCap(memEntertainer, w);
    const aCapW = getCap(memAnalyst, w);
    const eCapL = getCap(memEntertainer, l);

    const header = `${w} def. ${l} (${marginLabel(margin).label})`;

    return {
      matchup_id: p.matchup_id,
      header,
      bot1: entertainerTake(w, l, margin, tagsW, tagsL, metW, actW, eCapW, eCapL),
      bot2: analystTake(w, l, margin, metW, metL, aCapW, actW)
    };
  });
}

export async function buildLLMRecaps(pairs = [], tagsBundle, memEntertainer, memAnalyst) {
  const fallback = buildDeepRecaps(pairs, tagsBundle, memEntertainer, memAnalyst);

  let entSystem, anaSystem;
  try {
    const [personas, entProfile, anaProfile] = await Promise.all([
      loadPersonas(),
      getProfile('entertainer', 'MatchupRecaps'),
      getProfile('analyst', 'MatchupRecaps')
    ]);
    entSystem = buildSystemPrompt('entertainer', entProfile, personas.entertainer);
    anaSystem = buildSystemPrompt('analyst', anaProfile, personas.analyst);
  } catch {
    return fallback;
  }

  const results = await Promise.allSettled(
    pairs.map(async (p, i) => {
      const [entRes, anaRes] = await Promise.allSettled([
        genWithLLM(entSystem, buildMatchupUserPrompt(p, tagsBundle, memEntertainer), 200),
        genWithLLM(anaSystem, buildMatchupUserPrompt(p, tagsBundle, memAnalyst), 200)
      ]);
      return {
        matchup_id: p.matchup_id,
        header: fallback[i].header,
        bot1: entRes.status === 'fulfilled' ? entRes.value : fallback[i].bot1,
        bot2: anaRes.status === 'fulfilled' ? anaRes.value : fallback[i].bot2
      };
    })
  );

  return results.map((r, i) => r.status === 'fulfilled' ? r.value : fallback[i]);
}

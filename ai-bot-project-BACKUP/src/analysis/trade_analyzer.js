// src/analysis/trade_analyzer.js
// Dynasty-aware trade analysis with roster-talent impact.

const POS = ["QB", "RB", "WR", "TE"];

const POS_WEIGHT = { QB: 40, RB: 60, WR: 60, TE: 25 }; // baseline structural value
const PICK_WEIGHT = { 1: 55, 2: 35, 3: 20, 4: 10, 5: 5 }; // per round, before year decay

const zero = () => ({ QB:0, RB:0, WR:0, TE:0 });
const clone = (c={}) => ({ QB:+(c.QB||0), RB:+(c.RB||0), WR:+(c.WR||0), TE:+(c.TE||0) });
const add = (a,b,sign=+1)=>({ QB:a.QB+sign*(b.QB||0), RB:a.RB+sign*(b.RB||0), WR:a.WR+sign*(b.WR||0), TE:a.TE+sign*(b.TE||0) });

function posCountsFromList(items=[]) {
  const out = zero();
  for (const s of items) {
    const m = String(s).match(/\b(QB|RB|WR|TE)\b/);
    if (m) out[m[1]] += 1;
  }
  return out;
}
function medianCounts(all=[]) {
  const med = zero();
  if (!all.length) return med;
  for (const k of POS) {
    const sorted = all.map(c=>+c[k]||0).sort((a,b)=>a-b);
    med[k] = sorted[Math.floor(sorted.length/2)];
  }
  return med;
}
function parsePicksWithYear(items=[], season=Number(new Date().getFullYear()), decay=0.07) {
  // returns list [{round,year,value}] and net value
  const out = [];
  let total = 0;
  for (const s of items) {
    const m = String(s).match(/(\d{4})\s*R(\d)/i);
    if (!m) continue;
    const year = +m[1], r = +m[2];
    const base = PICK_WEIGHT[r] || 0;
    const yearsOut = Math.max(0, year - season);
    const val = Math.round(base * Math.pow(1 - decay, yearsOut));
    out.push({ round: r, year, value: val });
    total += val;
  }
  return { list: out, total };
}
function listPlayers(items=[]) {
  return items.filter(x => !/^\s*\d{4}\s*R\d/i.test(String(x))); // exclude picks
}

// --- player talent model ---
function buildNameIndex(players) {
  const idx = new Map();
  for (const [pid, p] of Object.entries(players||{})) {
    const key = `${(p.name||'').toLowerCase()}|${p.pos||''}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push({ pid, ...p });
  }
  return idx;
}
function resolveByNamePos(s, nameIdx) {
  // "Adam Thielen (WR)" => {pid,...} approx
  const m = String(s).match(/^(.*?)\s*\((QB|RB|WR|TE)\)/i);
  const nm = (m ? m[1] : String(s)).trim();
  const pos = (m ? m[2] : '').toUpperCase();
  const key = `${nm.toLowerCase()}|${pos}`;
  const arr = nameIdx.get(key);
  return arr && arr[0] ? arr[0] : null;
}
function ageCurveFactor(age, pos, curveCfg) {
  if (!age || !curveCfg) return 0;
  const curve = curveCfg[pos] || { primeStart: 24, primeEnd: 28 };
  if (age < curve.primeStart - 2) return +4;       // promising youth
  if (age < curve.primeStart)     return +2;
  if (age <= curve.primeEnd)      return +6;       // prime bump
  if (age <= curve.primeEnd + 2)  return -2;
  return -6;                                       // aging decline
}
function draftCapitalBonus(dr, map) {
  if (!dr) return 0;
  const k = String(dr);
  return map[k] ?? 0;
}
function injuryPenalty(status, pen) {
  if (!status || status === 'Questionable' || status === 'Probable') return 0;
  if (status === 'Out' || status === 'Injured Reserve' || status === 'PUP') return -pen;
  return 0;
}
function playerTalent(p, cfg) {
  if (!p) return 0;
  const { ageCurves, draftRoundValue, injuryPenalty: injPen } = cfg;
  const base = { QB: 30, RB: 34, WR: 32, TE: 26 }[p.pos] || 20; // base by pos
  const ageAdj = ageCurveFactor(p.age, p.pos, ageCurves);
  const expAdj = p.years_exp === 0 ? +4 : (p.years_exp === 1 ? +2 : 0);
  const dcAdj  = draftCapitalBonus(p.draft_round, draftRoundValue);
  const injAdj = injuryPenalty(p.injury_status, injPen);
  return Math.round(base + ageAdj + expAdj + dcAdj + injAdj);
}
function teamTalentIndex(playerIds=[], players={}, lineup, weights) {
  // returns overall score using starters vs bench weighting
  const byPos = { QB:[], RB:[], WR:[], TE:[] };
  for (const pid of (playerIds||[])) {
    const p = players[pid];
    if (!p || !byPos[p.pos]) continue;
    byPos[p.pos].push({ pid, score: playerTalent(p, weights.cfg) });
  }
  for (const k of POS) byPos[k].sort((a,b)=>b.score-a.score);

  const starters = { QB: lineup.QB||1, RB: lineup.RB||2, WR: lineup.WR||2, TE: lineup.TE||1 };
  const FLEX = lineup.FLEX || 0;

  let total = 0;

  // core slots
  for (const k of POS) {
    const arr = byPos[k];
    const sCount = starters[k] || 0;
    for (let i=0;i<arr.length;i++) {
      const w = i < sCount ? weights.starterWeight : weights.benchWeight;
      total += arr[i].score * w;
    }
  }

  // flex: take best remaining RB/WR/TE beyond starters
  if (FLEX > 0) {
    let remain = [];
    for (const k of ["RB","WR","TE"]) {
      const s = starters[k] || 0;
      remain = remain.concat((byPos[k] || []).slice(s));
    }
    remain.sort((a,b)=>b.score-a.score);
    for (let i=0;i<Math.min(FLEX, remain.length); i++) {
      total += remain[i].score * weights.starterWeight;
    }
  }

  return Math.round(total);
}

// vibe helpers
function tagsFor(team, tagsBundle) {
  return (tagsBundle?.teams?.[team]?.tags)
      || (tagsBundle?.[team]?.tags)
      || [];
}
function vibeLine(team, tags, mem) {
  const t = mem?.teams?.[team] || {};
  const d = (t.trust||0) - (t.frustration||0);
  const tagHint = tags.length ? ` (${tags.slice(0,2).join(', ')})` : '';
  if (d >= 10) return `This fits their recent arc${tagHint}; we’ve been bullish.`;
  if (d <= -10) return `Feels off-brand${tagHint}; we’ve been skeptical.`;
  return `Neutral to their arc${tagHint}.`;
}
function winWindowWord(tags){
  const s = (tags||[]).join(' ').toLowerCase();
  if (s.match(/contend|win|favorite|title/)) return 'contender';
  if (s.match(/rebuild|retool|future|youth/)) return 'rebuilding';
  return 'neutral';
}

export function analyzeTradeEvent(
  e,
  posCounts = {},
  tagsBundle = null,
  memEntertainer = null,
  memAnalyst = null,
  opts = {} // { players, dynasty, season, rosterPlayersByTeam }
){
  const players = opts.players || {};
  const season = Number(opts.season || new Date().getFullYear());
  const dyn = Object.assign(
    {
      enabled: true,
      lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:2 },
      pickYearDecay: 0.07,
      ageCurves: {
        QB: { primeStart: 24, primeEnd: 33 },
        RB: { primeStart: 23, primeEnd: 26 },
        WR: { primeStart: 23, primeEnd: 28 },
        TE: { primeStart: 24, primeEnd: 30 }
      },
      draftRoundValue: { "1": 12, "2": 7, "3": 4, "4": 2, "5": 1, "6": 0, "7": 0, "UDFA": -3 },
      injuryPenalty: 5,
      starterWeight: 1.0,
      benchWeight: 0.35
    },
    opts.dynasty || {}
  );

  const nameIdx = buildNameIndex(players);
  const med = medianCounts(Object.values(posCounts||{}));
  const teams = Object.keys(e?.details?.by_team || {});
  const rosterPlayersByTeam = opts.rosterPlayersByTeam || {};

  const result = {};

  for (const team of teams) {
    const rec = e.details.by_team[team] || { gets:[], gives:[] };

    // convert list strings to player objects for talent / roster math
    const getPlayers = listPlayers(rec.gets).map(s => resolveByNamePos(s, nameIdx)).filter(Boolean);
    const givePlayers = listPlayers(rec.gives).map(s => resolveByNamePos(s, nameIdx)).filter(Boolean);

    // position deltas & pick value (with year decay)
    const getsPos  = posCountsFromList(rec.gets);
    const givesPos = posCountsFromList(rec.gives);
    const deltaPos = add(getsPos, givesPos, -1);

    const picksIn  = parsePicksWithYear(rec.gets, season, dyn.pickYearDecay);
    const picksOut = parsePicksWithYear(rec.gives, season, dyn.pickYearDecay);

    // structural score (positions + picks)
    let score = 0;
    for (const k of POS) score += (deltaPos[k]||0) * (POS_WEIGHT[k] || 0);
    score += (picksIn.total - picksOut.total);

    // roster talent index delta (team-level, dynasty-aware)
    const preRoster = rosterPlayersByTeam[team] || [];
    const weights = { starterWeight: dyn.starterWeight, benchWeight: dyn.benchWeight, cfg: dyn };
    const preIndex  = teamTalentIndex(preRoster, players, dyn.lineup, weights);

    // simulate roster after trade (swap by IDs we resolved)
    const idsIn  = new Set(getPlayers.map(p=>p.pid));
    const idsOut = new Set(givePlayers.map(p=>p.pid));
    const postRoster = preRoster
      .filter(pid => !idsOut.has(pid))
      .concat(Array.from(idsIn));
    const postIndex = teamTalentIndex(postRoster, players, dyn.lineup, weights);

    const talentDelta = Math.max(-50, Math.min(50, postIndex - preIndex)); // clamp
    score += Math.round(talentDelta * 0.6); // roster impact influences grade heavily

    const deltaText = POS.map(k => deltaPos[k] ? `${k} ${deltaPos[k] > 0 ? `+${deltaPos[k]}` : deltaPos[k]}` : null)
                         .filter(Boolean).join(', ') || 'no roster change';

    const tags = tagsFor(team, tagsBundle);
    const analystVibe = vibeLine(team, tags, memAnalyst);
    const entertainerVibe = vibeLine(team, tags, memEntertainer);
    const window = winWindowWord(tags);

    const playersInStr  = getPlayers.map(p=>`${p.name} (${p.pos})`).slice(0,4).join(', ') || 'no headliners';
    const playersOutStr = givePlayers.map(p=>`${p.name} (${p.pos})`).slice(0,4).join(', ') || 'depth pieces';

    const pickLine = (() => {
      const a = picksIn.list.length ? `adds ${picksIn.list.map(x=>`${x.year} R${x.round}`).join(', ')}` : '';
      const b = picksOut.list.length ? `sends ${picksOut.list.map(x=>`${x.year} R${x.round}`).join(', ')}` : '';
      if (!a && !b) return 'no notable pick movement.';
      return [a,b].filter(Boolean).join(' and ') + '.';
    })();

    const posImpactBits = Object.entries(add(clone(posCounts[team]||zero()), deltaPos, +1))
      .map(([k,v]) => `${k} now ${v} (med ${med[k]})`).join('; ');

    // paragraphs
    const aParagraph =
      `${team} receives ${playersInStr} and sends ${playersOutStr}; ${pickLine} ` +
      `Roster delta: ${deltaText}. ${posImpactBits || 'No positional swing.'} ` +
      `Pre→post talent index: ${preIndex} → ${postIndex} (${talentDelta >= 0 ? '+' : ''}${talentDelta}). ` +
      `${analystVibe} As a ${window}, this leans ${talentDelta >= 0 ? 'win-now' : 'future-leaning'} ` +
      `and the net pick value is ${picksIn.total - picksOut.total >= 0 ? '+' : ''}${picksIn.total - picksOut.total}.`;

    const eParagraph =
      `${team} shakes it up: ${playersInStr} in, ${playersOutStr} out — ${deltaText}. ` +
      `Talent meter ${talentDelta >= 0 ? 'up' : 'down'} (${preIndex} → ${postIndex}). ` +
      `${entertainerVibe} Picks ${picksIn.total - picksOut.total >= 0 ? 'banked' : 'spent'}; vibes say ` +
      `${talentDelta >= 0 ? 'they pushed chips in' : 'they cashed out a bit'} for a ${window} build.`;

    result[team] = {
      grade: letterGrade(score),
      score,
      deltaText,
      analyst_paragraph: aParagraph,
      entertainer_paragraph: eParagraph
    };
  }

  return result;
}

function letterGrade(score) {
  if (score >= 55) return "A";
  if (score >= 40) return "A-";
  if (score >= 28) return "B+";
  if (score >= 16) return "B";
  if (score >= 6)  return "B-";
  if (score >= -6) return "C+";
  if (score >= -16) return "C";
  if (score >= -28) return "C-";
  return "D";
}

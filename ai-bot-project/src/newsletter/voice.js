// src/newsletter/voice.js
// Persona-driven, pundit-style copy + disagreement hooks.

import fs from 'fs-extra';

let personas = null;
let toneRules = null;

async function loadJSON(path, fallback = {}) {
  try { return await fs.readJson(path); } catch { return fallback; }
}

export async function loadVoices() {
  if (!personas) {
    personas = {
      entertainer: await loadJSON('config/personas/entertainer.json'),
      analyst: await loadJSON('config/personas/analyst.json')
    };
  }
  if (!toneRules) {
    toneRules = await loadJSON('config/tone-rules.json', { debate: { enable: true, gradeGapToDebate: 2, lines: [] } });
  }
  return { personas, toneRules };
}

function pick(arr = [], n = 1) {
  if (!arr.length) return [];
  const out = [];
  const seen = new Set();
  while (out.length < Math.min(n, arr.length)) {
    const i = Math.floor(Math.random() * arr.length);
    if (!seen.has(i)) { out.push(arr[i]); seen.add(i); }
  }
  return out;
}

function parseItems(list = []) {
  const players = [];
  const picks = [];
  for (const s of list) {
    const str = String(s).trim();
    const pm = str.match(/^(.*?)\s*\((QB|RB|WR|TE)\)$/i);
    const pk = str.match(/(\d{4})\s*R(\d)/i);
    if (pm) players.push({ name: pm[1].trim(), pos: pm[2].toUpperCase(), raw: str });
    else if (pk) picks.push({ year: +pk[1], round: +pk[2], raw: str });
    else if (str) players.push({ name: str.replace(/\s*\([^)]*\)\s*$/, ''), pos: '', raw: str });
  }
  return { players, picks };
}
const listNames = (players = [], max = 3) => {
  const names = players.map(p => p.name).filter(Boolean);
  if (!names.length) return '';
  const head = names.slice(0, max).join(', ');
  return names.length > max ? `${head}, +more` : head;
};
const picksLine = (inPicks = [], outPicks = []) => {
  const fmt = (arr) => arr.map(p => `${p.year} R${p.round}`).join(', ');
  const a = inPicks.length ? `adds ${fmt(inPicks)}` : '';
  const b = outPicks.length ? `sends ${fmt(outPicks)}` : '';
  if (!a && !b) return '';
  return [a, b].filter(Boolean).join(' and ');
};

function windowWord(tags = []) {
  const s = tags.join(' ').toLowerCase();
  if (s.match(/contend|win|title|favorite/)) return 'contender';
  if (s.match(/rebuild|retool|future|youth/)) return 'rebuilding team';
  return 'swing-agnostic club';
}
function memoryMood(memTeam) {
  if (!memTeam) return 'neutral';
  const d = (memTeam.trust || 0) - (memTeam.frustration || 0);
  if (d >= 10) return 'we’ve been buying them';
  if (d <= -10) return 'we’ve been skeptical';
  return 'we’ve been undecided';
}

function lineEntertainer(team, got, gave, tags, mem) {
  const p = personas.entertainer || {};
  const opener = pick(p.rhetoric?.openers || ['Here we go.'])[0];
  const closer = pick(p.rhetoric?.closers || ['Book it.'])[0];
  const ww = windowWord(tags);
  const mood = memoryMood(mem);
  const gotNames = listNames(got.players);
  const gaveNames = listNames(gave.players);
  const pk = picksLine(got.picks, gave.picks);
  const verdict = pick(p.rhetoric?.verdicts || ['love it'])[0];

  const a = got.players.length
    ? `${team} grabs ${gotNames}${pk ? `, ${pk}` : ''}.`
    : `${team} plays the long game${pk ? ` — ${pk}` : ''}.`;

  const b = gave.players.length
    ? ` Moves off ${gaveNames}. This is ${verdict} for a ${ww}.`
    : ` ${verdict} for a ${ww}.`;

  return `${opener} ${a}${b} ${mood}. ${closer}`;
}
function lineAnalyst(team, got, gave, tags, mem) {
  const p = personas.analyst || {};
  const opener = pick(p.rhetoric?.openers || ['Process check:'])[0];
  const closer = pick(p.rhetoric?.closers || ['Sustainable if usage holds.'])[0];
  const ww = windowWord(tags);
  const mood = memoryMood(mem);
  const gotNames = listNames(got.players);
  const gaveNames = listNames(gave.players);
  const pk = picksLine(got.picks, gave.picks);

  const angle = (() => {
    const hasR1In = got.picks.some(x => x.round === 1);
    const hasR1Out = gave.picks.some(x => x.round === 1);
    if (hasR1In && !hasR1Out) return 'future-leaning capital';
    if (hasR1Out && !hasR1In) return 'win-now allocation';
    if (got.players.length && gave.players.length) return 'value shuffle';
    return 'portfolio rebalance';
  })();

  const head = got.players.length
    ? `${team} adds ${gotNames}${pk ? ` (${pk})` : ''}.`
    : `${team} accrues ${pk || 'assets'}.`;

  const tail = gave.players.length
    ? ` Cost is ${gaveNames}. Within a ${ww} lens, this reads as ${angle}; ${mood}.`
    : ` ${angle} for a ${ww}; ${mood}.`;

  return `${opener} ${head}${tail} ${closer}`;
}

export async function humanizeTradeWriteups(tradeItem, tagsBundle, memEntertainer, memAnalyst) {
  await loadVoices();
  if (!tradeItem || !tradeItem.teams || !tradeItem.analysis) return tradeItem;

  // write paragraphs per team
  for (const [team, a] of Object.entries(tradeItem.analysis)) {
    const rec = tradeItem.teams[team] || { gets: [], gives: [] };
    const got = parseItems(rec.gets);
    const gave = parseItems(rec.gives);
    const tags = (tagsBundle?.teams?.[team]?.tags) || [];

    const mem1 = memEntertainer?.teams?.[team] || null;
    const mem2 = memAnalyst?.teams?.[team] || null;

    a.entertainer_paragraph = lineEntertainer(team, got, gave, tags, mem1) + ` Grade: ${a.grade}.`;
    a.analyst_paragraph = lineAnalyst(team, got, gave, tags, mem2) + ` Grade: ${a.grade}.`;
  }

  // add debate line if grades diverge strongly between teams
  const grades = Object.values(tradeItem.analysis).map(x => x.grade);
  const toScore = g => ({A:4,'A-':3.5,'B+':3,'B':2.5,'B-':2,'C+':1.5,'C':1,'C-':0.5,'D':0}[g] ?? 1);
  if (toneRules?.debate?.enable && grades.length >= 2) {
    const spread = Math.abs(toScore(grades[0]) - toScore(grades[1]));
    if (spread >= (toneRules.debate.gradeGapToDebate || 2)) {
      tradeItem.debate_line = pick(toneRules.debate.lines || [
        'Entertainer: ceiling wins in December. Analyst: roles win in November.'
      ])[0];
    }
  }

  return tradeItem;
}
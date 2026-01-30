// src/forecast/forecast.js
function sentence(str) { return str.replace(/\s+/g, ' ').trim(); }
const getCap = (mem, name) => mem?.teams?.[name] || { trust: 0, frustration: 0, mood: 'Neutral' };
const delta = t => (t.trust ?? 0) - (t.frustration ?? 0);

function pickConfidence(margin) {
  const a = Math.abs(margin);
  if (a >= 20) return 'high';
  if (a >= 10) return 'medium';
  return 'low';
}
function buildLastPointsMap(pairs) {
  const map = new Map();
  for (const p of pairs || []) for (const t of p.teams || []) map.set(t.name, Number(t.points || 0));
  return map;
}
function fmtEdge(x) {
  const v = Number(x || 0);
  const sign = v > 0 ? '+' : v < 0 ? '' : '';
  return `${sign}${v.toFixed(1)}`;
}

// small helper to create a one-liner per bot
function makeNote({ winner, confidence, formEdge, biasEdge }) {
  const confWord = confidence === 'high' ? 'comfortably' : confidence === 'medium' ? 'by a score' : 'in a coin flip';
  const formLean = formEdge > 1 ? 'form edge' : formEdge < -1 ? 'form disadvantage' : 'neutral form';
  const biasLean = Math.abs(biasEdge) >= 1 ? 'trust tilt' : 'no tilt';
  return `${winner} ${confWord} — ${formLean} (${fmtEdge(formEdge)}), ${biasLean} (${fmtEdge(biasEdge)}).`;
}

function predictForBot(upcoming_pairs, lastPoints, mem, biasWeight = 2) {
  const details = new Map();

  for (const u of upcoming_pairs || []) {
    const [A, B] = u.teams;
    if (!A || !B) continue;

    const capA = getCap(mem, A), capB = getCap(mem, B);
    const baseA = lastPoints.get(A) || 110;
    const baseB = lastPoints.get(B) || 110;

    const formEdge = baseA - baseB;                 // + favours A, - favours B
    const biasA = biasWeight * (delta(capA) / 5);
    const biasB = biasWeight * (delta(capB) / 5);
    const biasEdge = biasA - biasB;                 // + favours A, - favours B

    const strengthA = baseA + biasA;
    const strengthB = baseB + biasB;

    const winner = strengthA >= strengthB ? A : B;
    const loser  = strengthA >= strengthB ? B : A;

    const maxS = Math.max(strengthA, strengthB);
    const minS = Math.min(strengthA, strengthB);

    const confMargin = Math.round(Math.abs(strengthA - strengthB) * 0.15);
    const confidence = pickConfidence(confMargin);

    const est_str = `${Math.round(maxS)}–${Math.round(minS)}`;
    const upset = Math.abs(formEdge) >= 8 && Math.sign(formEdge) !== Math.sign(biasEdge);

    const note = makeNote({ winner, confidence, formEdge, biasEdge });

    details.set(u.matchup_id, {
      team1: A, team2: B,
      pick: winner,
      confidence,
      est_margin: confMargin,
      est_str,
      why: `form ${fmtEdge(formEdge)}, bias ${fmtEdge(biasEdge)}`,
      note,
      upset,
      formEdge, biasEdge
    });
  }

  let motw = null;
  for (const d of details.values()) if (!motw || Math.abs(d.est_margin) < Math.abs(motw.est_margin)) motw = d;
  const bold_player = details.size ? Array.from(details.values())[0].pick + ' star pops' : null;

  return { details, motw, bold_player };
}

export function makeForecast({ upcoming_pairs, last_pairs, memEntertainer, memAnalyst, nextWeek }) {
  const lastPoints = buildLastPointsMap(last_pairs);

  const ent = predictForBot(upcoming_pairs, lastPoints, memEntertainer, 2.5);
  const ana = predictForBot(upcoming_pairs, lastPoints, memAnalyst, 1.5);

  let agree_count = 0;
  const disagreements = [];

  const picks = upcoming_pairs.map(u => {
    const e = ent.details.get(u.matchup_id);
    const a = ana.details.get(u.matchup_id);
    if (e?.pick && a?.pick) {
      if (e.pick === a.pick) agree_count += 1;
      else disagreements.push(`${u.teams[0]} vs ${u.teams[1]}`);
    }
    return {
      matchup_id: u.matchup_id,
      team1: u.teams[0],
      team2: u.teams[1],
      bot1_pick: e?.pick || null,
      bot2_pick: a?.pick || null,
      confidence_bot1: e?.confidence || null,
      confidence_bot2: a?.confidence || null,
      est_bot1: e?.est_str || null,
      est_bot2: a?.est_str || null,
      why_bot1: e?.why || null,
      why_bot2: a?.why || null,
      note_bot1: e?.note || null,
      note_bot2: a?.note || null,
      upset_bot1: e?.upset || false,
      upset_bot2: a?.upset || false
    };
  });

  const forecast = {
    picks,
    bot1_matchup_of_the_week: ent.motw ? `${ent.motw.team1} vs ${ent.motw.team2}` : null,
    bot2_matchup_of_the_week: ana.motw ? `${ana.motw.team1} vs ${ana.motw.team2}` : null,
    bot1_bold_player: ent.bold_player,
    bot2_bold_player: ana.bold_player,
    records: { entertainer: { w: 0, l: 0 }, analyst: { w: 0, l: 0 } },
    summary: { agree_count, total: upcoming_pairs.length, disagreements }
  };

  const pending = {
    week: nextWeek,
    picks: upcoming_pairs.map(u => {
      const ePick = ent.details.get(u.matchup_id)?.pick || null;
      const aPick = ana.details.get(u.matchup_id)?.pick || null;
      return { matchup_id: u.matchup_id, team1: u.teams[0], team2: u.teams[1], entertainer_pick: ePick, analyst_pick: aPick };
    })
  };

  return { forecast, pending };
}

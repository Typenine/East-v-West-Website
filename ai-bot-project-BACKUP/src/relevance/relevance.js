// src/relevance/relevance.js
// Scores transactions for coverage level, spice/impact, and reasons.
// Works even if some Sleeper fields are missing.

const HIGH = 'High', MOD = 'Moderate', LOW = 'Low';

function cov(score) {
  if (score >= 75) return HIGH;
  if (score >= 45) return MOD;
  return LOW;
}

function ensureArray(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

// Pretty name helpers injected from index via callbacks
function prettyTeam(id, rosterIdToName, userIdToName) {
  if (id == null) return 'Unknown Team';
  let name = rosterIdToName ? rosterIdToName(id) : undefined;
  // If roster map returns a generic fallback, try user map as well
  if (!name || String(name).startsWith('Roster ')) {
    const n2 = userIdToName ? userIdToName(id) : undefined;
    if (n2 && n2 !== 'Unknown Team') return n2;
  }
  return name || 'Unknown Team';
}

function asPickString(year, round) {
  return year && round ? `${year} R${round}` : null;
}

function addIf(arr, cond, s) { if (cond) arr.push(s); }

export function scoreEvents({ transactions = [], rosterIdToName, userIdToName, resolvePlayer }) {
  const out = [];

  for (const t of transactions || []) {
    const type = t?.type || t?.transaction_type || '';

    /* ---------------- TRADES ---------------- */
    if (type === 'trade') {
      const teamIds = ensureArray(t.roster_ids);
      const partiesNames = teamIds.map(id => prettyTeam(id, rosterIdToName, userIdToName));

      // Build per-team "gets / gives"
      const by_team = {};
      const reasons = [];
      let spiceScore = 0;
      let r1Involved = false;
      let multiPieces = 0;

      for (const id of teamIds) {
        const name = prettyTeam(id, rosterIdToName, userIdToName);
        const rec = { gets: [], gives: [] };

        // adds/drops keyed by player_id -> roster_id in Sleeper
        const adds = t.adds || {};
        const drops = t.drops || {};

        // pick arrays (Sleeper: draft_picks)
        const picks = ensureArray(t.draft_picks);

        // Who this team gets (players + picks)
        for (const [pid, toRoster] of Object.entries(adds)) {
          if (String(toRoster) !== String(id)) continue;
          const p = resolvePlayer ? resolvePlayer(pid) : null;
          rec.gets.push(p ? `${p.name} (${p.pos || ''})` : `Player ${pid}`);
          multiPieces++;
        }
        for (const pk of picks) {
          if (String(pk.owner_id) === String(id)) {
            // owner keeps; skip
          } else if (String(pk.owner_id) !== String(id) && String(pk.previous_owner_id) !== String(id)) {
            // ambiguous; ignore
          } else {
            const s = asPickString(pk.season || pk.year, pk.round);
            if (s) {
              rec.gets.push(s);
              if (pk.round === 1) r1Involved = true;
              multiPieces++;
            }
          }
        }

        // Who this team gives (players + picks)
        for (const [pid, fromRoster] of Object.entries(drops)) {
          if (String(fromRoster) !== String(id)) continue;
          const p = resolvePlayer ? resolvePlayer(pid) : null;
          rec.gives.push(p ? `${p.name} (${p.pos || ''})` : `Player ${pid}`);
          multiPieces++;
        }
        for (const pk of picks) {
          // team gives picks if pk.owner_id == team BEFORE the trade and goes to other
          if (String(pk.owner_id) === String(id) && String(pk.roster_id) !== String(id)) {
            const s = asPickString(pk.season || pk.year, pk.round);
            if (s) {
              rec.gives.push(s);
              if (pk.round === 1) r1Involved = true;
              multiPieces++;
            }
          }
        }

        by_team[name] = rec;
      }

      addIf(reasons, r1Involved, 'R1 capital moved');
      addIf(reasons, multiPieces >= 6, 'multi-piece swap');
      addIf(reasons, partiesNames.length >= 3, '3+ teams involved');

      // Spice scoring
      spiceScore += r1Involved ? 35 : 0;
      spiceScore += Math.min(30, (multiPieces || 0) * 3);
      spiceScore += partiesNames.length >= 3 ? 15 : 0;

      out.push({
        type: 'trade',
        event_id: t.transaction_id || t.id || Math.random().toString(36).slice(2),
        parties: partiesNames,
        coverage_level: cov(spiceScore),
        relevance_score: spiceScore,
        reasons,
        details: {
          headline: r1Involved ? 'R1 capital involved' : (multiPieces >= 6 ? 'Multi-piece swap' : 'Roster shuffle'),
          by_team
        }
      });

      continue;
    }

    /* ---------------- WAIVERS / FA ---------------- */
    if (type === 'waiver' || type === 'free_agent' || type === 'faab') {
      const reasons = [];
      let impact = 20;

      const teamName = prettyTeam(t.roster_id || t.creator || t.rosterIds?.[0], rosterIdToName, userIdToName);

      const playerId = t.adds ? Object.keys(t.adds)[0] : t.player || t.player_id;
      const p = resolvePlayer ? resolvePlayer(playerId) : null;

      const bid = Number(t.waiver_bid || t.settings?.waiver_bid || 0);
      const isHighBid = bid >= 20;
      addIf(reasons, isHighBid, `FAAB ${bid}`);

      const contested = Number(t.settings?.bid_count || t.metadata?.num_bids || 0) >= 3;
      addIf(reasons, contested, 'multi-bid pickup');

      if (isHighBid) impact += 25;
      if (contested) impact += 15;
      if (p && (p.pos === 'RB' || p.pos === 'WR')) impact += 10;

      out.push({
        type: 'waiver',
        event_id: t.transaction_id || t.id || Math.random().toString(36).slice(2),
        team: teamName,
        coverage_level: cov(impact),
        relevance_score: impact,
        reasons,
        player: p ? `${p.name} (${p.pos || ''})` : undefined
      });
    }
  }

  return out;
}
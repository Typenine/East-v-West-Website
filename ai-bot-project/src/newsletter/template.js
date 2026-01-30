// src/newsletter/template.js

function esc(s = '') {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function h2(title) {
  return `<h2 style="margin:24px 0 8px;font-size:20px;line-height:1.2;color:#0f172a;">${esc(title)}</h2>
  <div style="height:2px;background:#e5e7eb;margin-bottom:12px;"></div>`;
}

/* ---------- Sections ---------- */

function sectionIntro(d) {
  return `
  ${h2('Intro')}
  <div style="display:grid;gap:8px;">
    <div><strong>Entertainer:</strong> ${esc(d.bot1_text)}</div>
    <div><strong>Analyst:</strong> ${esc(d.bot2_text)}</div>
  </div>`;
}

function sectionCallbacks(cb) {
  if (!cb) return '';
  const picks = (cb.forecast_picks || []).map(x => {
    const label = (x.team1 && x.team2)
      ? `${esc(x.team1)} vs ${esc(x.team2)}${x.matchup_id ? ` (#${esc(x.matchup_id)})` : ''}`
      : `Matchup #${esc(x.matchup_id)}`;
    return `<li style="margin:4px 0;">${label} — Entertainer: ${esc(x.entertainer_pick || '—')} · Analyst: ${esc(x.analyst_pick || '—')}</li>`;
  }).join('');
  const trades = (cb.trade_grades || []).slice(0,6).map(t =>
    `<li style="margin:4px 0;">${esc(t.team)} — Grade ${esc(t.grade)}</li>`
  ).join('');
  return `
  ${h2('Callbacks')}
  <div style="color:#64748b;font-size:12px;margin-bottom:6px;">Last week: ${esc(cb.saved_at || '')}</div>
  <div style="display:grid;gap:8px;">
    <div><strong>Spotlight (then):</strong> ${esc(cb.spotlight_team || '—')}</div>
    <div><strong>Forecast Picks:</strong>${picks ? `<ul style="margin:6px 0 0 18px;">${picks}</ul>` : ' —'}</div>
    <div><strong>Trade Grades:</strong>${trades ? `<ul style="margin:6px 0 0 18px;">${trades}</ul>` : ' —'}</div>
  </div>`;
}

function sectionBlurt(d) {
  const rows = [];
  if (d.bot1) rows.push(`<div><strong>Entertainer:</strong> ${esc(d.bot1)}</div>`);
  if (d.bot2) rows.push(`<div><strong>Analyst:</strong> ${esc(d.bot2)}</div>`);
  if (!rows.length) return '';
  return `
  ${h2('Side Notes')}
  <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff;">
    ${rows.join('')}
  </div>`;
}

function sectionRecaps(list) {
  if (!list?.length) return `${h2('Matchup Recaps')}<div style="color:#334155;">No games found.</div>`;
  const rows = list.map(x => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">#${esc(x.matchup_id)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;"><strong>Entertainer:</strong> ${esc(x.bot1)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;"><strong>Analyst:</strong> ${esc(x.bot2)}</td>
    </tr>`).join('');
  return `
  ${h2('Matchup Recaps')}
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <tbody>${rows}</tbody>
  </table>`;
}

function sectionWaivers(list) {
  const items = (list || []).map(x => {
    const badge = x.coverage_level
      ? `<span style="display:inline-block;padding:2px 6px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;margin-right:6px;text-transform:capitalize;">${esc(x.coverage_level)}</span>`
      : '';
    const why = (x.reasons && x.reasons.length)
      ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">${esc(x.reasons.join(' • '))}</div>`
      : '';
    return `<li style="margin:6px 0;">${badge}<strong>Entertainer:</strong> ${esc(x.bot1)}<br/><strong>Analyst:</strong> ${esc(x.bot2)}${why}</li>`;
  }).join('');
  return `
  ${h2('Waiver Wire & Free Agent Moves')}
  ${items ? `<ul style="padding-left:18px;margin:0;">${items}</ul>` : `<div style="color:#334155;">No notable moves.</div>`}`;
}

/* ---- Trades ---- */
function sectionTrades(list) {
  const items = (list || []).map(x => {
    const badge = x.coverage_level
      ? `<span style="display:inline-block;padding:2px 6px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;margin-right:6px;text-transform:capitalize;">${esc(x.coverage_level)}</span>`
      : '';
    const header = `${badge}${esc(x.context || 'Trade')}`;

    const teamMoves = x.teams
      ? Object.entries(x.teams).map(([team, rec]) => `
          <div style="color:#475569;font-size:13px;margin:4px 0 0;">
            <em>${esc(team)}</em> gets: ${esc((rec.gets||[]).join(', ') || '—')} • gives: ${esc((rec.gives||[]).join(', ') || '—')}
          </div>
        `).join('')
      : '';

    const teamAnalysis = Object.entries(x.analysis || {}).map(([team, a]) => `
      <div style="margin:10px 0 2px 0;">
        <div style="font-weight:700;">${esc(team)} — Grade ${esc(a.grade)} <span style="color:#64748b;">(${esc(a.deltaText)})</span></div>
        <div><strong>Entertainer:</strong> ${esc(a.entertainer_paragraph)}</div>
        <div><strong>Analyst:</strong> ${esc(a.analyst_paragraph)}</div>
      </div>
    `).join('');

    const debate = x.debate_line
      ? `<div style="margin-top:6px;padding:8px 10px;border-left:3px solid #eab308;background:#fffbeb;color:#92400e;font-size:13px;">${esc(x.debate_line)}</div>`
      : '';

    const reasons = x.reasons?.length ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${esc(x.reasons.join(' • '))}</div>` : '';

    return `
    <li style="margin:10px 0;">
      <div>${header}</div>
      ${teamMoves}
      ${teamAnalysis}
      ${debate}
      ${reasons}
    </li>`;
  }).join('');

  return `
  ${h2('Trades')}
  ${items ? `<ul style="padding-left:18px;margin:0;">${items}</ul>` : `<div style="color:#334155;">No trades this week.</div>`}`;
}

function sectionSpotlight(d) {
  return `
  ${h2('Spotlight Team')}
  <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff;">
    <div style="font-weight:700;margin-bottom:6px;">${esc(d.team)}</div>
    <div><strong>Entertainer:</strong> ${esc(d.bot1)}</div>
    <div><strong>Analyst:</strong> ${esc(d.bot2)}</div>
  </div>`;
}

function sectionForecast(d) {
  const recordsLine = d.records
    ? `<div style="color:#64748b;font-size:12px;margin-bottom:6px;">
         Records — Entertainer: ${esc(String(d.records.entertainer?.w || 0))}-${esc(String(d.records.entertainer?.l || 0))}
         · Analyst: ${esc(String(d.records.analyst?.w || 0))}-${esc(String(d.records.analyst?.l || 0))}
       </div>`
    : '';

  const summaryLine = d.summary
    ? `<div style="color:#64748b;font-size:12px;margin-bottom:6px;">
         Agreement: ${esc(String(d.summary.agree_count || 0))}/${esc(String(d.summary.total || 0))}
         ${d.summary.disagreements?.length ? `· Disagreements: ${esc(d.summary.disagreements.join(', '))}` : ''}
       </div>`
    : '';

  const rows = (d.picks || []).map(p => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${esc(p.team1)} vs ${esc(p.team2)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
        <div>
          <strong>Entertainer:</strong> ${esc(p.bot1_pick || '-')}
          <span style="color:#64748b;font-size:12px;">(${esc(p.confidence_bot1 || '')})</span>
          ${p.upset_bot1 ? `<span style="margin-left:6px;border:1px solid #f59e0b;border-radius:8px;padding:1px 6px;font-size:12px;color:#92400e;background:#fffbeb;">upset</span>` : ''}
        </div>
        ${p.est_bot1 ? `<div style="color:#64748b;font-size:12px;">Est: ${esc(p.est_bot1)}</div>` : ''}
        ${p.note_bot1 ? `<div style="color:#0f172a;font-size:12px;margin-top:2px;">${esc(p.note_bot1)}</div>` : ''}
      </td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
        <div>
          <strong>Analyst:</strong> ${esc(p.bot2_pick || '-')}
          <span style="color:#64748b;font-size:12px;">(${esc(p.confidence_bot2 || '')})</span>
          ${p.upset_bot2 ? `<span style="margin-left:6px;border:1px solid #f59e0b;border-radius:8px;padding:1px 6px;font-size:12px;color:#92400e;background:#fffbeb;">upset</span>` : ''}
        </div>
        ${p.est_bot2 ? `<div style="color:#64748b;font-size:12px;">Est: ${esc(p.est_bot2)}</div>` : ''}
        ${p.note_bot2 ? `<div style="color:#0f172a;font-size:12px;margin-top:2px;">${esc(p.note_bot2)}</div>` : ''}
      </td>
    </tr>`).join('');

  const extras = `
    <div style="margin-top:8px;color:#334155;">
      <div><strong>Entertainer — Matchup of the Week:</strong> ${esc(d.bot1_matchup_of_the_week || '—')}</div>
      <div><strong>Analyst — Matchup of the Week:</strong> ${esc(d.bot2_matchup_of_the_week || '—')}</div>
      <div style="margin-top:6px;"><strong>Bold Picks:</strong> Entertainer — ${esc(d.bot1_bold_player || '—')} · Analyst — ${esc(d.bot2_bold_player || '—')}</div>
    </div>`;

  return `
  ${h2('Next Week’s Forecast')}
  ${recordsLine}${summaryLine}
  ${rows
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"><tbody>${rows}</tbody></table>${extras}`
    : `<div style="color:#334155;">No upcoming matchups found.</div>`}`;
}

function sectionFinal(d) {
  return `
  ${h2('The Final Word')}
  <div><strong>Entertainer:</strong> ${esc(d.bot1)}</div>
  <div><strong>Analyst:</strong> ${esc(d.bot2)}</div>`;
}

/* ---------- Render ---------- */

export function renderHtml(newsletter) {
  const { meta, sections } = newsletter;
  const header = `
  <div style="background:#0f172a;color:#fff;border-radius:12px;padding:18px 20px;">
    <div style="font-size:14px;opacity:.9;">${esc(meta.date)} • Week ${esc(meta.week)}</div>
    <h1 style="margin:6px 0 0;font-size:24px;line-height:1.2;">${esc(meta.leagueName)} — Weekly Newsletter</h1>
  </div>`;

  const body = sections.map(s => {
    if (s.type === 'Intro') return sectionIntro(s.data);
    if (s.type === 'Callbacks') return sectionCallbacks(s.data);
    if (s.type === 'Blurt') return sectionBlurt(s.data);
    if (s.type === 'MatchupRecaps') return sectionRecaps(s.data);
    if (s.type === 'WaiversAndFA') return sectionWaivers(s.data);
    if (s.type === 'Trades') return sectionTrades(s.data);
    if (s.type === 'SpotlightTeam') return sectionSpotlight(s.data);
    if (s.type === 'Forecast') return sectionForecast(s.data);
    if (s.type === 'FinalWord') return sectionFinal(s.data);
    return '';
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(meta.leagueName)} — Week ${esc(meta.week)} Newsletter</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial;">
  <div style="max-width:740px;margin:24px auto;padding:0 16px;">
    ${header}
    ${body}
    <div style="color:#94a3b8;font-size:12px;margin:20px 0 40px;">Generated by AI League Newsletter • Data: Sleeper</div>
  </div>
</body></html>`;
}
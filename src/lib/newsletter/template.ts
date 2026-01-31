/**
 * Template Module
 * Renders newsletter data to HTML - The Athletic style
 */

import type {
  Newsletter,
  IntroSection,
  BlurtSection,
  RecapItem,
  WaiverItem,
  TradeItem,
  SpotlightSection,
  ForecastData,
  FinalWordSection,
  CallbacksSection,
} from './types';

// ============ Helper Functions ============

function esc(s: string | number | undefined | null = ''): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sectionHeader(title: string, subtitle?: string): string {
  return `
  <div style="margin:48px 0 24px;border-bottom:3px solid #be161e;">
    <h2 style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;">${esc(title)}</h2>
    ${subtitle ? `<p style="margin:0 0 12px;font-size:14px;color:#6b7280;">${esc(subtitle)}</p>` : ''}
  </div>`;
}

function authorByline(name: string, role: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
    <div style="width:40px;height:40px;border-radius:50%;background:${role === 'entertainer' ? 'linear-gradient(135deg, #be161e, #bf9944)' : 'linear-gradient(135deg, #0b5f98, #1e40af)'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">${name.charAt(0).toUpperCase()}</div>
    <div>
      <div style="font-weight:600;font-size:14px;color:#111827;">${esc(name)}</div>
      <div style="font-size:12px;color:#6b7280;">${role === 'entertainer' ? 'The Entertainer' : 'The Analyst'}</div>
    </div>
  </div>`;
}

function dualPerspective(entertainerText: string, analystText: string): string {
  return `
  <div style="display:grid;gap:24px;margin:20px 0;">
    <div style="background:linear-gradient(135deg, #fef3c7, #fde68a);border-left:4px solid #f59e0b;padding:16px 20px;border-radius:0 8px 8px 0;">
      <div style="font-weight:600;font-size:12px;color:#92400e;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">🎭 The Entertainer</div>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#1f2937;">${esc(entertainerText)}</p>
    </div>
    <div style="background:#f0f9ff;border-left:4px solid #0b5f98;padding:16px 20px;border-radius:0 8px 8px 0;">
      <div style="font-weight:600;font-size:12px;color:#0b5f98;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">📊 The Analyst</div>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${esc(analystText)}</p>
    </div>
  </div>`;
}

// ============ Section Renderers ============

function sectionIntro(d: IntroSection, week: number): string {
  const isChampionship = week >= 17;
  const isSemifinal = week === 16;
  const isPlayoffs = week >= 15;
  
  let headerTitle = `WEEK ${week} RECAP`;
  let subtitle = '';
  
  if (isChampionship) {
    headerTitle = '🏆 CHAMPIONSHIP EDITION';
    subtitle = 'The final showdown is here. One team will be crowned champion.';
  } else if (isSemifinal) {
    headerTitle = '🔥 PLAYOFF SEMIFINALS';
    subtitle = 'Four teams remain. Two will advance to the championship.';
  } else if (isPlayoffs) {
    headerTitle = '🏈 PLAYOFF EDITION';
    subtitle = 'Win or go home. The postseason is here.';
  }
  
  return `
  <article style="margin-bottom:40px;">
    ${sectionHeader(headerTitle, subtitle)}
    
    <div style="background:linear-gradient(135deg, #fef3c7, #fde68a);border-left:4px solid #f59e0b;padding:24px 28px;margin-bottom:24px;border-radius:0 12px 12px 0;">
      ${authorByline('The Entertainer', 'entertainer')}
      <p style="margin:0;font-size:19px;line-height:1.8;color:#1f2937;font-style:italic;">"${esc(d.bot1_text)}"</p>
    </div>
    
    <div style="background:#f0f9ff;border-left:4px solid #0b5f98;padding:24px 28px;border-radius:0 12px 12px 0;">
      ${authorByline('The Analyst', 'analyst')}
      <p style="margin:0;font-size:17px;line-height:1.8;color:#374151;">${esc(d.bot2_text)}</p>
    </div>
  </article>`;
}

function sectionCallbacks(cb: CallbacksSection | null): string {
  if (!cb) return '';
  
  const picks = (cb.forecast_picks || []).map(x => {
    const label = (x.team1 && x.team2)
      ? `${esc(x.team1)} vs ${esc(x.team2)}`
      : `Matchup #${esc(x.matchup_id)}`;
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
      <span style="font-weight:500;">${label}</span>
      <span style="color:#6b7280;">🎭 ${esc(x.entertainer_pick || '—')} · 📊 ${esc(x.analyst_pick || '—')}</span>
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader('LOOKING BACK', 'How did our predictions hold up?')}
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">Last week: ${esc(cb.saved_at || '')}</div>
      ${cb.spotlight_team ? `<div style="margin-bottom:16px;"><strong>Spotlight Team:</strong> ${esc(cb.spotlight_team)}</div>` : ''}
      ${picks || '<div style="color:#6b7280;">No predictions to review.</div>'}
    </div>
  </article>`;
}

function sectionBlurt(d: BlurtSection): string {
  if (!d.bot1 && !d.bot2) return '';

  return `
  <article>
    ${sectionHeader('QUICK TAKES')}
    ${dualPerspective(d.bot1 || '', d.bot2 || '')}
  </article>`;
}

function sectionRecaps(list: RecapItem[], week: number): string {
  if (!list?.length) return `${sectionHeader('MATCHUP RECAPS')}<div style="color:#6b7280;padding:20px;">No games found.</div>`;

  const isChampionship = week >= 17;
  
  // For championship week, highlight matchup #1 as THE championship
  const recaps = list.map((x, idx) => {
    const isChampMatch = isChampionship && (x.matchup_id === 1 || idx === 0);
    const matchLabel = isChampMatch ? '🏆 THE CHAMPIONSHIP' : `Matchup ${x.matchup_id}`;
    const cardStyle = isChampMatch 
      ? 'background:linear-gradient(135deg, #fef3c7, #fff7ed);border:2px solid #f59e0b;'
      : 'background:#fff;border:1px solid #e5e7eb;';
    
    return `
    <div style="${cardStyle}border-radius:12px;padding:24px;margin-bottom:20px;">
      <div style="font-weight:700;font-size:${isChampMatch ? '16px' : '14px'};color:${isChampMatch ? '#92400e' : '#374151'};margin-bottom:16px;${isChampMatch ? 'text-align:center;' : ''}">${matchLabel}</div>
      ${dualPerspective(x.bot1, x.bot2)}
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader(isChampionship ? 'THE FINAL RESULTS' : 'MATCHUP RECAPS', isChampionship ? 'A champion has been crowned' : `${list.length} matchups this week`)}
    ${recaps}
  </article>`;
}

function sectionWaivers(list: WaiverItem[]): string {
  if (!list?.length) return '';

  const items = list.map(x => {
    const badge = x.coverage_level === 'high' 
      ? '<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">HOT</span>'
      : x.coverage_level === 'moderate'
      ? '<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">NOTABLE</span>'
      : '';
    
    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="margin-bottom:12px;">${badge}${x.reasons?.length ? `<span style="color:#6b7280;font-size:13px;">${esc(x.reasons.join(' • '))}</span>` : ''}</div>
      ${dualPerspective(x.bot1, x.bot2)}
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader('WAIVER WIRE', 'This week\'s roster moves')}
    ${items}
  </article>`;
}

function sectionTrades(list: TradeItem[]): string {
  if (!list?.length) return '';

  const items = list.map(x => {
    const teamMoves = x.teams
      ? Object.entries(x.teams).map(([team, rec]) => `
          <div style="background:#f9fafb;padding:12px 16px;border-radius:8px;margin:8px 0;">
            <div style="font-weight:600;color:#111827;margin-bottom:4px;">${esc(team)}</div>
            <div style="font-size:13px;color:#059669;">📥 Gets: ${esc((rec.gets || []).join(', ') || '—')}</div>
            <div style="font-size:13px;color:#dc2626;">📤 Gives: ${esc((rec.gives || []).join(', ') || '—')}</div>
          </div>
        `).join('')
      : '';

    const teamAnalysis = Object.entries(x.analysis || {}).map(([team, a]) => `
      <div style="margin:16px 0;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-weight:700;font-size:15px;">${esc(team)}</span>
          <span style="background:${a.grade === 'A' || a.grade === 'A+' ? '#059669' : a.grade === 'B' || a.grade === 'B+' ? '#0b5f98' : a.grade === 'C' ? '#f59e0b' : '#dc2626'};color:#fff;padding:4px 12px;border-radius:6px;font-weight:700;">Grade: ${esc(a.grade)}</span>
        </div>
        ${dualPerspective(a.entertainer_paragraph, a.analyst_paragraph)}
      </div>
    `).join('');

    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px;">
      <div style="font-weight:700;font-size:16px;color:#111827;margin-bottom:16px;">${esc(x.context || 'Trade')}</div>
      ${teamMoves}
      ${teamAnalysis}
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader('TRADE ANALYSIS', 'Breaking down this week\'s deals')}
    ${items}
  </article>`;
}

function sectionSpotlight(d: SpotlightSection): string {
  return `
  <article>
    ${sectionHeader('TEAM OF THE WEEK', 'Spotlight performance')}
    <div style="background:linear-gradient(135deg, #fef3c7, #fff7ed);border:2px solid #f59e0b;border-radius:12px;padding:24px;">
      <div style="font-weight:700;font-size:20px;color:#92400e;margin-bottom:16px;text-align:center;">⭐ ${esc(d.team)}</div>
      ${dualPerspective(d.bot1, d.bot2)}
    </div>
  </article>`;
}

function sectionForecast(d: ForecastData): string {
  const recordsLine = d.records
    ? `<div style="display:flex;gap:24px;margin-bottom:16px;">
         <div style="background:#f9fafb;padding:12px 16px;border-radius:8px;flex:1;text-align:center;">
           <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">🎭 Entertainer Record</div>
           <div style="font-size:20px;font-weight:700;color:#111827;">${esc(String(d.records.entertainer?.w || 0))}-${esc(String(d.records.entertainer?.l || 0))}</div>
         </div>
         <div style="background:#f9fafb;padding:12px 16px;border-radius:8px;flex:1;text-align:center;">
           <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">📊 Analyst Record</div>
           <div style="font-size:20px;font-weight:700;color:#111827;">${esc(String(d.records.analyst?.w || 0))}-${esc(String(d.records.analyst?.l || 0))}</div>
         </div>
       </div>`
    : '';

  const rows = (d.picks || []).map(p => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="font-weight:600;font-size:15px;color:#111827;margin-bottom:16px;text-align:center;">${esc(p.team1)} vs ${esc(p.team2)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:linear-gradient(135deg, #fef3c7, #fde68a);padding:12px 16px;border-radius:8px;">
          <div style="font-size:11px;color:#92400e;font-weight:600;margin-bottom:4px;">🎭 ENTERTAINER PICK</div>
          <div style="font-weight:700;color:#1f2937;">${esc(p.bot1_pick || '-')}</div>
          ${p.confidence_bot1 ? `<div style="font-size:12px;color:#6b7280;">${esc(p.confidence_bot1)}</div>` : ''}
          ${p.upset_bot1 ? `<span style="display:inline-block;margin-top:4px;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">UPSET</span>` : ''}
        </div>
        <div style="background:#f0f9ff;padding:12px 16px;border-radius:8px;">
          <div style="font-size:11px;color:#0b5f98;font-weight:600;margin-bottom:4px;">📊 ANALYST PICK</div>
          <div style="font-weight:700;color:#1f2937;">${esc(p.bot2_pick || '-')}</div>
          ${p.confidence_bot2 ? `<div style="font-size:12px;color:#6b7280;">${esc(p.confidence_bot2)}</div>` : ''}
          ${p.upset_bot2 ? `<span style="display:inline-block;margin-top:4px;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">UPSET</span>` : ''}
        </div>
      </div>
    </div>`).join('');

  const extras = d.bot1_matchup_of_the_week || d.bot2_matchup_of_the_week ? `
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-top:20px;">
      <div style="font-weight:600;margin-bottom:12px;">🔥 Matchups of the Week</div>
      ${d.bot1_matchup_of_the_week ? `<div style="margin-bottom:8px;"><span style="color:#92400e;">🎭</span> ${esc(d.bot1_matchup_of_the_week)}</div>` : ''}
      ${d.bot2_matchup_of_the_week ? `<div><span style="color:#0b5f98;">📊</span> ${esc(d.bot2_matchup_of_the_week)}</div>` : ''}
    </div>` : '';

  return `
  <article>
    ${sectionHeader("NEXT WEEK'S FORECAST", 'Who will come out on top?')}
    ${recordsLine}
    ${rows || '<div style="color:#6b7280;padding:20px;">No upcoming matchups found.</div>'}
    ${extras}
  </article>`;
}

function sectionFinal(d: FinalWordSection): string {
  return `
  <article>
    ${sectionHeader('THE FINAL WORD', 'Closing thoughts')}
    ${dualPerspective(d.bot1, d.bot2)}
  </article>`;
}

// ============ Main Render Function ============

export function renderHtml(newsletter: Newsletter): string {
  const { meta, sections } = newsletter;
  const week = meta.week;
  const episodeType = meta.episodeType || 'regular';
  const isSpecialEpisode = episodeType !== 'regular';
  const isChampionship = week >= 17 || episodeType === 'championship';
  const isSemifinal = week === 16;
  const isPlayoffs = week >= 15 || episodeType === 'playoffs_round' || episodeType === 'playoffs_preview';

  // Determine header styling based on episode type
  let headerBg = 'linear-gradient(135deg, #0f172a, #1e293b)';
  let headerAccent = '';
  
  if (episodeType === 'preseason') {
    headerBg = 'linear-gradient(135deg, #059669, #047857)';
    headerAccent = '🌟 ';
  } else if (episodeType === 'pre_draft') {
    headerBg = 'linear-gradient(135deg, #7c3aed, #5b21b6)';
    headerAccent = '📋 ';
  } else if (episodeType === 'post_draft') {
    headerBg = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
    headerAccent = '📊 ';
  } else if (episodeType === 'trade_deadline') {
    headerBg = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    headerAccent = '🔔 ';
  } else if (episodeType === 'offseason') {
    headerBg = 'linear-gradient(135deg, #6b7280, #4b5563)';
    headerAccent = '💤 ';
  } else if (isChampionship) {
    headerBg = 'linear-gradient(135deg, #92400e, #b45309)';
    headerAccent = '🏆 ';
  } else if (isSemifinal) {
    headerBg = 'linear-gradient(135deg, #be161e, #991b1b)';
    headerAccent = '🔥 ';
  } else if (isPlayoffs) {
    headerBg = 'linear-gradient(135deg, #0b5f98, #1e40af)';
    headerAccent = '🏈 ';
  }

  // Build subtitle based on episode type
  let subtitle = '';
  if (isSpecialEpisode && meta.episodeTitle) {
    subtitle = meta.episodeSubtitle || '';
  } else if (isChampionship) {
    subtitle = '— Championship Edition';
  } else if (isPlayoffs) {
    subtitle = '— Playoffs';
  } else if (week > 0) {
    subtitle = '';
  }

  // Build main title
  const mainTitle = isSpecialEpisode && meta.episodeTitle 
    ? meta.episodeTitle 
    : (week > 0 ? `Week ${week}` : 'Newsletter');

  const header = `
  <header style="background:${headerBg};color:#fff;border-radius:16px;padding:32px;margin-bottom:32px;">
    <div style="font-size:12px;opacity:.8;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">${esc(meta.date)}</div>
    <h1 style="margin:0 0 8px;font-size:32px;line-height:1.2;font-weight:800;">${headerAccent}${esc(meta.leagueName)}</h1>
    <div style="font-size:18px;opacity:.9;">${esc(mainTitle)}${subtitle ? ` ${esc(subtitle)}` : ''}</div>
  </header>`;

  const body = sections.map(s => {
    switch (s.type) {
      case 'Intro': return sectionIntro(s.data, week);
      case 'Callbacks': return sectionCallbacks(s.data);
      case 'Blurt': return sectionBlurt(s.data);
      case 'MatchupRecaps': return sectionRecaps(s.data, week);
      case 'WaiversAndFA': return sectionWaivers(s.data);
      case 'Trades': return sectionTrades(s.data);
      case 'SpotlightTeam': return sectionSpotlight(s.data);
      case 'Forecast': return sectionForecast(s.data);
      case 'FinalWord': return sectionFinal(s.data);
      default: return '';
    }
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(meta.leagueName)} — ${isSpecialEpisode && meta.episodeTitle ? esc(meta.episodeTitle) : `Week ${esc(String(meta.week))}`} Newsletter</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #f8fafc; font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2937; line-height: 1.6; }
  article { margin-bottom: 48px; }
</style>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:24px 20px;">
    ${header}
    ${body}
    <footer style="text-align:center;color:#9ca3af;font-size:12px;padding:32px 0;border-top:1px solid #e5e7eb;margin-top:48px;">
      East v. West Newsletter • Data from Sleeper
    </footer>
  </div>
</body></html>`;
}

// ============ React-friendly render (returns sections as components) ============

export function renderNewsletterData(newsletter: Newsletter): {
  meta: Newsletter['meta'];
  htmlSections: Array<{ type: string; html: string }>;
} {
  const { meta, sections } = newsletter;
  const week = meta.week;

  const htmlSections = sections.map(s => {
    let html = '';
    switch (s.type) {
      case 'Intro': html = sectionIntro(s.data, week); break;
      case 'Callbacks': html = sectionCallbacks(s.data); break;
      case 'Blurt': html = sectionBlurt(s.data); break;
      case 'MatchupRecaps': html = sectionRecaps(s.data, week); break;
      case 'WaiversAndFA': html = sectionWaivers(s.data); break;
      case 'Trades': html = sectionTrades(s.data); break;
      case 'SpotlightTeam': html = sectionSpotlight(s.data); break;
      case 'Forecast': html = sectionForecast(s.data); break;
      case 'FinalWord': html = sectionFinal(s.data); break;
    }
    return { type: s.type, html };
  });

  return { meta, htmlSections };
}

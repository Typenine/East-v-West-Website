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
  PowerRankingsSection,
  SeasonPreviewSection,
  BotDebate,
  WeeklyHotTake,
  WeeklyAwards,
  WhatIfScenario,
  DynastyAnalysis,
  RivalryMatchup,
  PlayoffOddsSection,
  NarrativeCallback,
} from './types';
import { TEAM_COLORS } from '../constants/team-colors';
import { getTeamLogoPath } from '../utils/team-utils';

// ============ Team Color Helpers ============

function getTeamColor(teamName: string, type: 'primary' | 'secondary' = 'primary'): string {
  const colors = TEAM_COLORS[teamName];
  if (!colors) return type === 'primary' ? '#3b5b8b' : '#ba1010';
  return type === 'primary' ? colors.primary : colors.secondary;
}

function teamBadge(teamName: string, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const primary = getTeamColor(teamName, 'primary');
  const secondary = getTeamColor(teamName, 'secondary');
  const sizes = { sm: '24px', md: '32px', lg: '48px' };
  const logoPath = getTeamLogoPath(teamName);
  const initials = teamName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  
  // Use actual team logo with gradient background fallback
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${sizes[size]};height:${sizes[size]};border-radius:50%;background:linear-gradient(135deg, ${primary}, ${secondary});overflow:hidden;flex-shrink:0;"><img src="${logoPath}" alt="${esc(initials)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.style.color='#fff';this.parentElement.style.fontWeight='700';this.parentElement.innerHTML='${initials}'"/></span>`;
}

function teamNameStyled(teamName: string): string {
  const primary = getTeamColor(teamName, 'primary');
  return `<span style="font-weight:600;color:${primary};">${esc(teamName)}</span>`;
}

function matchupVsBlock(team1: string, team2: string, score1?: number, score2?: number): string {
  const t1Primary = getTeamColor(team1, 'primary');
  const t2Primary = getTeamColor(team2, 'primary');
  const winner = score1 !== undefined && score2 !== undefined ? (score1 > score2 ? team1 : team2) : null;
  
  return `
  <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f9fafb;border-radius:8px;margin:8px 0;">
    <div style="flex:1;text-align:right;">
      ${teamBadge(team1, 'sm')}
      <span style="margin-left:8px;font-weight:${winner === team1 ? '700' : '500'};color:${t1Primary};">${esc(team1)}</span>
      ${score1 !== undefined ? `<span style="margin-left:8px;font-weight:700;color:${winner === team1 ? '#059669' : '#6b7280'};">${score1.toFixed(1)}</span>` : ''}
    </div>
    <div style="font-weight:700;color:#9ca3af;font-size:12px;">VS</div>
    <div style="flex:1;text-align:left;">
      ${score2 !== undefined ? `<span style="margin-right:8px;font-weight:700;color:${winner === team2 ? '#059669' : '#6b7280'};">${score2.toFixed(1)}</span>` : ''}
      <span style="margin-right:8px;font-weight:${winner === team2 ? '700' : '500'};color:${t2Primary};">${esc(team2)}</span>
      ${teamBadge(team2, 'sm')}
    </div>
  </div>`;
}

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

// Render dialogue as a back-and-forth conversation with multiple blobs
function conversationalDialogue(dialogue: Array<{ speaker: 'entertainer' | 'analyst'; text: string }>): string {
  if (!dialogue?.length) return '';
  
  return `
  <div style="display:grid;gap:16px;margin:20px 0;">
    ${dialogue.map((turn) => {
      const isEntertainer = turn.speaker === 'entertainer';
      const bgStyle = isEntertainer 
        ? 'background:linear-gradient(135deg, #fef3c7, #fde68a);border-left:4px solid #f59e0b;'
        : 'background:#f0f9ff;border-left:4px solid #0b5f98;';
      const labelColor = isEntertainer ? '#92400e' : '#0b5f98';
      const textColor = isEntertainer ? '#1f2937' : '#374151';
      const icon = isEntertainer ? '🎭' : '📊';
      const label = isEntertainer ? 'The Entertainer' : 'The Analyst';
      
      return `
      <div style="${bgStyle}padding:16px 20px;border-radius:0 8px 8px 0;">
        <div style="font-weight:600;font-size:12px;color:${labelColor};margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${icon} ${label}</div>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${textColor};">${esc(turn.text)}</p>
      </div>`;
    }).join('')}
  </div>`;
}

// ============ Section Renderers ============

function sectionIntro(d: IntroSection, week: number, episodeType?: string, episodeTitle?: string): string {
  const isChampionship = week >= 17 || episodeType === 'championship';
  const isSemifinal = week === 16;
  const isPlayoffs = week >= 15 || episodeType === 'playoffs_round' || episodeType === 'playoffs_preview';
  const isSpecialEpisode = episodeType && episodeType !== 'regular';
  
  let headerTitle = `WEEK ${week} RECAP`;
  let subtitle = '';
  
  // Handle special episode types first
  if (isSpecialEpisode && episodeTitle) {
    headerTitle = episodeTitle.toUpperCase();
    switch (episodeType) {
      case 'preseason':
        subtitle = 'Your complete guide to the upcoming season';
        break;
      case 'pre_draft':
        subtitle = 'Everything you need to know before the draft';
        break;
      case 'post_draft':
        subtitle = 'Grading every team\'s draft haul';
        break;
      case 'offseason':
        subtitle = 'Catching up on league news';
        break;
      case 'trade_deadline':
        subtitle = 'Breaking down the deadline deals';
        break;
    }
  } else if (isChampionship) {
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

  const isPlayoffs = week >= 15;
  const isChampionshipWeek = week >= 17;
  
  // Use bracket labels from derived data for proper playoff game identification
  const recaps = list.map((x) => {
    // Use bracketLabel if available, otherwise fall back to matchup_id
    const bracketLabel = x.bracketLabel;
    const isChampMatch = bracketLabel?.includes('Championship') || false;
    const isThirdPlace = bracketLabel?.includes('3rd Place') || false;
    const isToiletBowl = bracketLabel?.includes('Toilet Bowl') || false;
    
    // Determine match label and styling based on bracket position
    let matchLabel: string;
    let cardStyle: string;
    let labelColor: string;
    let fontSize: string;
    let textAlign: string;
    
    if (isChampMatch) {
      matchLabel = bracketLabel || '🏆 Championship';
      cardStyle = 'background:linear-gradient(135deg, #fef3c7, #fff7ed);border:2px solid #f59e0b;';
      labelColor = '#92400e';
      fontSize = '16px';
      textAlign = 'text-align:center;';
    } else if (isThirdPlace) {
      matchLabel = bracketLabel || '🥉 3rd Place Game';
      cardStyle = 'background:linear-gradient(135deg, #fef3c7, #fde68a);border:2px solid #d97706;';
      labelColor = '#92400e';
      fontSize = '15px';
      textAlign = 'text-align:center;';
    } else if (isToiletBowl) {
      matchLabel = bracketLabel || '🚽 Toilet Bowl';
      cardStyle = 'background:linear-gradient(135deg, #fef2f2, #fee2e2);border:2px solid #ef4444;';
      labelColor = '#991b1b';
      fontSize = '14px';
      textAlign = 'text-align:center;';
    } else if (bracketLabel) {
      matchLabel = bracketLabel;
      cardStyle = 'background:#f9fafb;border:1px solid #d1d5db;';
      labelColor = '#374151';
      fontSize = '14px';
      textAlign = '';
    } else {
      matchLabel = isPlayoffs ? `Playoff Matchup ${x.matchup_id}` : `Matchup ${x.matchup_id}`;
      cardStyle = 'background:#fff;border:1px solid #e5e7eb;';
      labelColor = '#374151';
      fontSize = '14px';
      textAlign = '';
    }
    
    // Extract team names and scores from recap data if available
    const winner = x.winner || '';
    const loser = x.loser || '';
    const winnerScore = x.winner_score;
    const loserScore = x.loser_score;
    
    // Use conversational dialogue if available (multi-turn), otherwise fall back to dual perspective
    const dialogueHtml = x.dialogue && x.dialogue.length > 0 
      ? conversationalDialogue(x.dialogue)
      : dualPerspective(x.bot1, x.bot2);
    
    return `
    <div style="${cardStyle}border-radius:12px;padding:24px;margin-bottom:20px;">
      <div style="font-weight:700;font-size:${fontSize};color:${labelColor};margin-bottom:16px;${textAlign}">${matchLabel}</div>
      ${winner && loser ? matchupVsBlock(winner, loser, winnerScore, loserScore) : ''}
      ${dialogueHtml}
    </div>`;
  }).join('');

  // Determine section header based on week
  let sectionTitle: string;
  let sectionSubtitle: string;
  if (isChampionshipWeek) {
    sectionTitle = 'THE FINAL RESULTS';
    sectionSubtitle = 'A champion has been crowned';
  } else if (isPlayoffs) {
    sectionTitle = 'PLAYOFF RESULTS';
    sectionSubtitle = `${list.length} playoff matchups this week`;
  } else {
    sectionTitle = 'MATCHUP RECAPS';
    sectionSubtitle = `${list.length} matchups this week`;
  }

  return `
  <article>
    ${sectionHeader(sectionTitle, sectionSubtitle)}
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

// ============ New LLM-Powered Section Renderers ============

function sectionBotDebates(debates: BotDebate[]): string {
  if (!debates || debates.length === 0) return '';

  const debateCards = debates.map(d => `
    <div style="background:#fff;border:2px solid #dc2626;border-radius:12px;padding:20px;margin-bottom:20px;">
      <div style="text-align:center;margin-bottom:16px;">
        <span style="background:linear-gradient(135deg, #dc2626, #f59e0b);color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">🔥 DEBATE 🔥</span>
      </div>
      <div style="font-weight:700;font-size:18px;text-align:center;margin-bottom:16px;">${esc(d.team1)} vs ${esc(d.team2)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:linear-gradient(135deg, #fef3c7, #fde68a);padding:16px;border-radius:8px;">
          <div style="font-size:11px;color:#92400e;font-weight:600;margin-bottom:8px;">🎭 ENTERTAINER PICKS: ${esc(d.entertainer_position)}</div>
          <div style="font-size:14px;color:#1f2937;">${esc(d.entertainer_argument)}</div>
        </div>
        <div style="background:#f0f9ff;padding:16px;border-radius:8px;">
          <div style="font-size:11px;color:#0b5f98;font-weight:600;margin-bottom:8px;">📊 ANALYST PICKS: ${esc(d.analyst_position)}</div>
          <div style="font-size:14px;color:#1f2937;">${esc(d.analyst_argument)}</div>
        </div>
      </div>
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('THE GREAT DEBATE', 'When our columnists disagree')}
    ${debateCards}
  </article>`;
}

function sectionHotTakes(takes: WeeklyHotTake[]): string {
  if (!takes || takes.length === 0) return '';

  const boldnessEmoji = { mild: '🌶️', spicy: '🌶️🌶️', nuclear: '🌶️🌶️🌶️' };
  const boldnessColor = { mild: '#f59e0b', spicy: '#dc2626', nuclear: '#7c2d12' };

  const takeCards = takes.map(t => `
    <div style="background:#fff;border-left:4px solid ${boldnessColor[t.boldness]};padding:16px;margin-bottom:12px;border-radius:0 8px 8px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:#6b7280;">${t.bot === 'entertainer' ? '🎭 Entertainer' : '📊 Analyst'}</span>
        <span style="font-size:12px;">${boldnessEmoji[t.boldness]} ${t.boldness.toUpperCase()}</span>
      </div>
      <div style="font-weight:700;color:#111827;margin-bottom:4px;">${esc(t.subject)}</div>
      <div style="font-size:15px;color:#374151;">${esc(t.take)}</div>
      ${t.followUp ? `<div style="margin-top:8px;font-size:13px;color:#6b7280;font-style:italic;">Update: ${esc(t.followUp)}</div>` : ''}
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('🔥 HOT TAKES', 'Bold predictions we\'ll grade later')}
    ${takeCards}
  </article>`;
}

function sectionWeeklyAwards(awards: WeeklyAwards): string {
  if (!awards) return '';

  return `
  <article>
    ${sectionHeader('🏆 WEEKLY AWARDS', 'This week\'s winners and losers')}
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div style="background:linear-gradient(135deg, #dcfce7, #bbf7d0);border-radius:12px;padding:20px;">
        <div style="font-size:12px;color:#166534;font-weight:600;margin-bottom:8px;">🏅 MVP OF THE WEEK</div>
        <div style="font-weight:700;font-size:18px;color:#14532d;">${esc(awards.mvp.team)}</div>
        ${awards.mvp.points ? `<div style="font-size:14px;color:#166534;margin-bottom:12px;">${awards.mvp.points.toFixed(1)} points</div>` : ''}
        <div style="font-size:13px;color:#15803d;margin-bottom:8px;">🎭 ${esc(awards.mvp.entertainer_take)}</div>
        <div style="font-size:13px;color:#166534;">📊 ${esc(awards.mvp.analyst_take)}</div>
      </div>
      
      <div style="background:linear-gradient(135deg, #fee2e2, #fecaca);border-radius:12px;padding:20px;">
        <div style="font-size:12px;color:#991b1b;font-weight:600;margin-bottom:8px;">💀 BUST OF THE WEEK</div>
        <div style="font-weight:700;font-size:18px;color:#7f1d1d;">${esc(awards.bust.team)}</div>
        ${awards.bust.points ? `<div style="font-size:14px;color:#991b1b;margin-bottom:12px;">${awards.bust.points.toFixed(1)} points</div>` : ''}
        <div style="font-size:13px;color:#b91c1c;margin-bottom:8px;">🎭 ${esc(awards.bust.entertainer_take)}</div>
        <div style="font-size:13px;color:#991b1b;">📊 ${esc(awards.bust.analyst_take)}</div>
      </div>
    </div>

    ${awards.biggest_blowout ? `
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;margin-bottom:4px;">💥 BIGGEST BLOWOUT</div>
      <div style="font-weight:600;">${esc(awards.biggest_blowout.winner)} destroyed ${esc(awards.biggest_blowout.loser)} by ${awards.biggest_blowout.margin.toFixed(1)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px;">${esc(awards.biggest_blowout.commentary)}</div>
    </div>` : ''}

    ${awards.nail_biter ? `
    <div style="background:#f9fafb;border-radius:8px;padding:16px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;margin-bottom:4px;">😰 NAIL-BITER</div>
      <div style="font-weight:600;">${esc(awards.nail_biter.winner)} edged ${esc(awards.nail_biter.loser)} by ${awards.nail_biter.margin.toFixed(1)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px;">${esc(awards.nail_biter.commentary)}</div>
    </div>` : ''}
  </article>`;
}

function sectionWhatIf(scenarios: WhatIfScenario[]): string {
  if (!scenarios || scenarios.length === 0) return '';

  const scenarioCards = scenarios.map(s => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">${esc(s.winner)} beat ${esc(s.loser)} by ${s.margin.toFixed(1)}</div>
      <div style="font-weight:600;color:#111827;">${esc(s.scenario)}</div>
      <div style="color:#059669;margin-top:4px;">→ ${esc(s.outcome_change)}</div>
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('🤔 WHAT IF...', 'Alternative timelines for close games')}
    ${scenarioCards}
  </article>`;
}

function sectionDynastyAnalysis(analyses: DynastyAnalysis[]): string {
  if (!analyses || analyses.length === 0) return '';

  const analysisCards = analyses.map(a => `
    <div style="background:linear-gradient(135deg, #f3e8ff, #e9d5ff);border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="font-size:12px;color:#7c3aed;font-weight:600;margin-bottom:12px;">👑 DYNASTY DEEP DIVE</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:12px;">${a.teams.join(' ↔️ ')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:#fff;padding:12px;border-radius:8px;">
          <div style="font-size:11px;color:#6b7280;">Short-term Winner</div>
          <div style="font-weight:700;color:#059669;">${esc(a.short_term_winner)}</div>
        </div>
        <div style="background:#fff;padding:12px;border-radius:8px;">
          <div style="font-size:11px;color:#6b7280;">Long-term Winner</div>
          <div style="font-weight:700;color:#7c3aed;">${esc(a.long_term_winner)}</div>
        </div>
      </div>
      ${dualPerspective(a.entertainer_dynasty_take, a.analyst_dynasty_take)}
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('DYNASTY OUTLOOK', 'Long-term trade implications')}
    ${analysisCards}
  </article>`;
}

function sectionRivalryWatch(rivalries: RivalryMatchup[]): string {
  if (!rivalries || rivalries.length === 0) return '';

  const rivalryCards = rivalries.map(r => `
    <div style="background:linear-gradient(135deg, #1f2937, #374151);color:#fff;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="text-align:center;margin-bottom:16px;">
        ${r.rivalry_name ? `<div style="font-size:12px;color:#f59e0b;font-weight:600;margin-bottom:4px;">${esc(r.rivalry_name)}</div>` : ''}
        <div style="font-size:24px;font-weight:800;">${esc(r.team1)} vs ${esc(r.team2)}</div>
        <div style="font-size:14px;color:#9ca3af;margin-top:4px;">All-time: ${r.all_time_record.team1_wins}-${r.all_time_record.team2_wins}</div>
      </div>
      <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="font-size:11px;color:#f59e0b;font-weight:600;margin-bottom:4px;">🎭 THE HYPE</div>
        <div style="font-size:14px;">${esc(r.entertainer_hype)}</div>
      </div>
      <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:16px;">
        <div style="font-size:11px;color:#60a5fa;font-weight:600;margin-bottom:4px;">📊 THE BREAKDOWN</div>
        <div style="font-size:14px;">${esc(r.analyst_breakdown)}</div>
      </div>
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('⚔️ RIVALRY WATCH', 'When history meets the present')}
    ${rivalryCards}
  </article>`;
}

function sectionPlayoffOdds(odds: PlayoffOddsSection): string {
  if (!odds) return '';

  return `
  <article>
    ${sectionHeader('📊 PLAYOFF PICTURE', 'Who\'s in, who\'s out, who\'s sweating')}
    
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;">
      <div style="background:#dcfce7;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#166534;font-weight:600;margin-bottom:8px;">✅ CLINCHED</div>
        ${odds.clinched.length > 0 
          ? odds.clinched.map(t => `<div style="font-weight:600;color:#14532d;">${esc(t)}</div>`).join('')
          : '<div style="color:#6b7280;font-size:13px;">None yet</div>'}
      </div>
      <div style="background:#fef3c7;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:8px;">😰 BUBBLE</div>
        ${odds.bubble_teams.length > 0 
          ? odds.bubble_teams.map(t => `<div style="font-weight:600;color:#78350f;">${esc(t.team)} (${t.wins}-${t.losses})</div><div style="font-size:11px;color:#92400e;">${esc(t.scenario)}</div>`).join('')
          : '<div style="color:#6b7280;font-size:13px;">TBD</div>'}
      </div>
      <div style="background:#fee2e2;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#991b1b;font-weight:600;margin-bottom:8px;">❌ ELIMINATED</div>
        ${odds.eliminated.length > 0 
          ? odds.eliminated.map(t => `<div style="font-weight:600;color:#7f1d1d;">${esc(t)}</div>`).join('')
          : '<div style="color:#6b7280;font-size:13px;">None yet</div>'}
      </div>
    </div>

    ${dualPerspective(odds.entertainer_commentary, odds.analyst_commentary)}
  </article>`;
}

function sectionNarrativeCallbacks(callbacks: NarrativeCallback[]): string {
  if (!callbacks || callbacks.length === 0) return '';

  const callbackCards = callbacks.map(c => {
    const typeEmoji = {
      prediction_grade: '🎯',
      hot_take_followup: '🌶️',
      streak_update: '📈',
      rivalry_continuation: '⚔️',
    };
    const typeLabel = {
      prediction_grade: 'Prediction Check',
      hot_take_followup: 'Hot Take Update',
      streak_update: 'Streak Watch',
      rivalry_continuation: 'Rivalry Update',
    };

    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:#6b7280;">${typeEmoji[c.type]} ${typeLabel[c.type]}</span>
        <span style="font-size:11px;color:#9ca3af;">Week ${c.original_week}</span>
      </div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">Original: "${esc(c.original_statement)}"</div>
      <div style="font-weight:600;color:#111827;margin-bottom:4px;">${esc(c.current_status)}</div>
      <div style="font-size:14px;color:#374151;font-style:italic;">"${esc(c.bot_reaction)}"</div>
    </div>
  `;
  }).join('');

  return `
  <article>
    ${sectionHeader('📜 RECEIPTS', 'Following up on past predictions')}
    ${callbackCards}
  </article>`;
}

// ============ Special Episode Section Renderers ============

function sectionPowerRankings(d: PowerRankingsSection): string {
  const rankings = (d.rankings || []).map(r => `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;">
      <div style="width:40px;height:40px;background:${r.rank <= 3 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : r.rank <= 6 ? '#3b82f6' : '#6b7280'};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">
        ${r.rank}
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:16px;color:#111827;">${esc(r.team)}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">${esc(r.bot1_blurb)}</div>
      </div>
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('PRESEASON POWER RANKINGS', 'Who\'s poised for glory?')}
    ${dualPerspective(d.bot1_intro, d.bot2_intro)}
    <div style="margin-top:24px;">
      ${rankings}
    </div>
  </article>`;
}

function sectionSeasonPreview(d: SeasonPreviewSection): string {
  const contenders = (d.contenders || []).map(c => `
    <div style="padding:12px;background:#dcfce7;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;margin-bottom:8px;">
      <div style="font-weight:700;color:#166534;">${esc(c.team)}</div>
      <div style="font-size:13px;color:#15803d;">${esc(c.reason)}</div>
    </div>
  `).join('');

  const sleepers = (d.sleepers || []).map(s => `
    <div style="padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;margin-bottom:8px;">
      <div style="font-weight:700;color:#92400e;">${esc(s.team)}</div>
      <div style="font-size:13px;color:#a16207;">${esc(s.reason)}</div>
    </div>
  `).join('');

  const busts = (d.bustCandidates || []).map(b => `
    <div style="padding:12px;background:#fee2e2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;margin-bottom:8px;">
      <div style="font-weight:700;color:#991b1b;">${esc(b.team)}</div>
      <div style="font-size:13px;color:#b91c1c;">${esc(b.reason)}</div>
    </div>
  `).join('');

  const predictions1 = (d.boldPredictions?.bot1 || []).map(p => `<li style="margin-bottom:8px;">${esc(p)}</li>`).join('');
  const predictions2 = (d.boldPredictions?.bot2 || []).map(p => `<li style="margin-bottom:8px;">${esc(p)}</li>`).join('');

  return `
  <article>
    ${sectionHeader('SEASON PREVIEW', 'Your complete guide to the upcoming season')}
    
    <div style="margin-bottom:32px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;">🏆 Championship Contenders</h3>
      ${contenders || '<div style="color:#6b7280;">No contenders identified.</div>'}
    </div>

    <div style="margin-bottom:32px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;">😴 Sleeper Teams</h3>
      ${sleepers || '<div style="color:#6b7280;">No sleepers identified.</div>'}
    </div>

    <div style="margin-bottom:32px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;">📉 Bust Watch</h3>
      ${busts || '<div style="color:#6b7280;">No bust candidates identified.</div>'}
    </div>

    <div style="margin-bottom:32px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;">🔥 Bold Predictions</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div style="background:linear-gradient(135deg, #fef3c7, #fde68a);padding:16px;border-radius:8px;">
          <div style="font-weight:600;font-size:12px;color:#92400e;margin-bottom:8px;">🎭 THE ENTERTAINER</div>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#1f2937;">${predictions1}</ul>
        </div>
        <div style="background:#f0f9ff;padding:16px;border-radius:8px;">
          <div style="font-weight:600;font-size:12px;color:#0b5f98;margin-bottom:8px;">📊 THE ANALYST</div>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#374151;">${predictions2}</ul>
        </div>
      </div>
    </div>

    <div style="background:linear-gradient(135deg, #fef3c7, #fff7ed);border:2px solid #f59e0b;border-radius:12px;padding:24px;text-align:center;">
      <h3 style="font-size:18px;font-weight:700;color:#92400e;margin:0 0 16px;">🏆 Championship Picks</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div style="font-size:12px;color:#92400e;margin-bottom:4px;">🎭 Entertainer</div>
          <div style="font-weight:700;font-size:15px;color:#1f2937;">${esc(d.championshipPick?.bot1 || 'TBD')}</div>
        </div>
        <div>
          <div style="font-size:12px;color:#0b5f98;margin-bottom:4px;">📊 Analyst</div>
          <div style="font-weight:700;font-size:15px;color:#1f2937;">${esc(d.championshipPick?.bot2 || 'TBD')}</div>
        </div>
      </div>
    </div>
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
      case 'Intro': return sectionIntro(s.data, week, episodeType, meta.episodeTitle);
      case 'Callbacks': return sectionCallbacks(s.data);
      case 'Blurt': return sectionBlurt(s.data);
      case 'MatchupRecaps': return sectionRecaps(s.data, week);
      case 'WaiversAndFA': return sectionWaivers(s.data);
      case 'Trades': return sectionTrades(s.data);
      case 'SpotlightTeam': return sectionSpotlight(s.data);
      case 'Forecast': return sectionForecast(s.data);
      case 'FinalWord': return sectionFinal(s.data);
      // Special episode sections
      case 'PowerRankings': return sectionPowerRankings(s.data);
      case 'SeasonPreview': return sectionSeasonPreview(s.data);
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
      // New LLM-powered sections
      case 'BotDebates': html = sectionBotDebates(s.data); break;
      case 'HotTakes': html = sectionHotTakes(s.data); break;
      case 'WeeklyAwards': html = sectionWeeklyAwards(s.data); break;
      case 'WhatIf': html = sectionWhatIf(s.data); break;
      case 'DynastyAnalysis': html = sectionDynastyAnalysis(s.data); break;
      case 'RivalryWatch': html = sectionRivalryWatch(s.data); break;
      case 'PlayoffOdds': html = sectionPlayoffOdds(s.data); break;
      case 'NarrativeCallbacks': html = sectionNarrativeCallbacks(s.data); break;
    }
    return { type: s.type, html };
  });

  return { meta, htmlSections };
}

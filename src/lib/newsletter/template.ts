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
  DraftPreviewSection,
  DraftGradesSection,
  MockDraftSection,
} from './types';
import { TEAM_COLORS } from '../constants/team-colors';
import { getTeamLogoPath } from '../utils/team-utils';

// ============ League Brand ============

const LEAGUE_LOGO = '/assets/teams/East v West Logos/Official East v. West Logo.png';
const DRAFT_LOGO_2026 = '/draft-logos/2026-draft-logo.png';

function leagueBadge(size: number = 48, episodeType?: string): string {
  const src = (episodeType === 'pre_draft' || episodeType === 'post_draft') ? DRAFT_LOGO_2026 : LEAGUE_LOGO;
  return `<img src="${src}" alt="East v. West" style="width:${size}px;height:${size}px;object-fit:contain;display:block;" onerror="this.style.display='none'" />`;
}

// ============ Team Color Helpers ============

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Returns '#fff' or '#0d0d0d' depending on the perceived luminance of the background hex.
// Used so text remains readable when a team's primary color is the card background.
function textOnBg(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0d0d0d' : '#ffffff';
}

// Normalize team name for color/logo lookup: collapse smart quotes to ASCII apostrophe and trim.
// Sleeper can return team names with Unicode apostrophes (’) while our constants use ASCII (').
function normalizeTeamKey(name: string): string {
  return name
    .replace(/[‘’‚‛′‵`]/g, "'") // smart/back single quotes → ASCII
    .replace(/[“”„‟″‶]/g, '"')        // smart double quotes → ASCII
    .trim();
}

// Pre-built lookups so we iterate TEAM_COLORS once at module init
// 1. Normalized: smart-quote → ASCII (handles Sleeper Unicode apostrophes)
// 2. Lowercase: fully case-insensitive fallback (handles capitalisation diffs)
const TEAM_COLORS_NORMALIZED = new Map<string, (typeof TEAM_COLORS)[string]>(
  Object.entries(TEAM_COLORS).map(([k, v]) => [normalizeTeamKey(k), v])
);
const TEAM_COLORS_LOWER = new Map<string, (typeof TEAM_COLORS)[string]>(
  Object.entries(TEAM_COLORS).map(([k, v]) => [normalizeTeamKey(k).toLowerCase(), v])
);

function getTeamColorEntry(teamName: string): (typeof TEAM_COLORS)[string] | undefined {
  return (
    TEAM_COLORS[teamName]                                          // 1. exact
    ?? TEAM_COLORS_NORMALIZED.get(normalizeTeamKey(teamName))     // 2. quote-normalized
    ?? TEAM_COLORS_LOWER.get(normalizeTeamKey(teamName).toLowerCase()) // 3. case-insensitive
  );
}

function getTeamColor(teamName: string, type: 'primary' | 'secondary' | 'tertiary' = 'primary'): string {
  const colors = getTeamColorEntry(teamName);
  if (!colors) return type === 'primary' ? '#3b5b8b' : type === 'secondary' ? '#ba1010' : '#9ca3af';
  if (type === 'tertiary') return colors.tertiary ?? colors.secondary;
  return type === 'primary' ? colors.primary : colors.secondary;
}

function teamBadge(teamName: string, size: 'sm' | 'md' | 'lg' | 'xl' = 'md'): string {
  const primary = getTeamColor(teamName, 'primary');
  const sizes = { sm: '28px', md: '44px', lg: '72px', xl: '96px' };
  const logoPath = getTeamLogoPath(teamName);
  const initials = teamName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${sizes[size]};height:${sizes[size]};border-radius:50%;background:${primary};overflow:hidden;flex-shrink:0;"><img src="${logoPath}" alt="${esc(initials)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.style.color='#fff';this.parentElement.style.fontWeight='700';this.parentElement.innerHTML='${initials}'"/></span>`;
}

function teamNameStyled(teamName: string): string {
  const primary = getTeamColor(teamName, 'primary');
  return `<span style="font-weight:600;color:${primary};">${esc(teamName)}</span>`;
}

function matchupVsBlock(team1: string, team2: string, score1?: number, score2?: number): string {
  const t1Primary = getTeamColor(team1, 'primary');
  const t1Tertiary = getTeamColor(team1, 'tertiary');
  const t2Primary = getTeamColor(team2, 'primary');
  const t2Tertiary = getTeamColor(team2, 'tertiary');
  const winner = score1 !== undefined && score2 !== undefined ? (score1 > score2 ? team1 : team2) : null;

  return `
  <div style="border-radius:10px;overflow:hidden;margin:0 0 24px;display:flex;align-items:stretch;">
    <div style="flex:1;background:${t1Primary};padding:24px 20px;text-align:right;border-right:4px solid ${t1Tertiary};">
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">${teamBadge(team1, 'lg')}</div>
      <div style="font-family:'Georgia',serif;font-weight:700;font-size:16px;color:${winner === team1 ? '#fff' : 'rgba(255,255,255,0.6)'};line-height:1.2;">${esc(team1)}</div>
      ${score1 !== undefined ? `<div style="font-size:32px;font-weight:800;color:${winner === team1 ? '#fff' : 'rgba(255,255,255,0.4)'};margin-top:6px;letter-spacing:-1px;font-family:'Georgia',serif;">${score1.toFixed(1)}</div>` : ''}
      ${winner === team1 ? `<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#4ade80;margin-top:4px;text-transform:uppercase;">WIN</div>` : ''}
    </div>
    <div style="width:48px;text-align:center;flex-shrink:0;background:#0d0d0d;display:flex;align-items:center;justify-content:center;">
      <div style="font-weight:900;color:rgba(255,255,255,0.25);font-size:11px;letter-spacing:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">VS</div>
    </div>
    <div style="flex:1;background:${t2Primary};padding:24px 20px;text-align:left;border-left:4px solid ${t2Tertiary};">
      <div style="display:flex;justify-content:flex-start;margin-bottom:10px;">${teamBadge(team2, 'lg')}</div>
      <div style="font-family:'Georgia',serif;font-weight:700;font-size:16px;color:${winner === team2 ? '#fff' : 'rgba(255,255,255,0.6)'};line-height:1.2;">${esc(team2)}</div>
      ${score2 !== undefined ? `<div style="font-size:32px;font-weight:800;color:${winner === team2 ? '#fff' : 'rgba(255,255,255,0.4)'};margin-top:6px;letter-spacing:-1px;font-family:'Georgia',serif;">${score2.toFixed(1)}</div>` : ''}
      ${winner === team2 ? `<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#4ade80;margin-top:4px;text-transform:uppercase;">WIN</div>` : ''}
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
  <div style="margin:80px 0 36px;background:#0d0d0d;border-radius:6px;overflow:hidden;">
    <div style="height:4px;background:linear-gradient(90deg,#be161e,#9a1218);"></div>
    <div style="padding:28px 40px 26px;display:flex;align-items:flex-start;gap:18px;">
      <div style="flex-shrink:0;margin-top:2px;opacity:0.7;">${leagueBadge(32)}</div>
      <div style="flex:1;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#be161e;margin-bottom:10px;">East v. West</div>
        <h2 style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:30px;font-weight:700;line-height:1.1;color:#ffffff;letter-spacing:-0.5px;">${esc(title)}</h2>
        ${subtitle ? `<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);font-style:italic;letter-spacing:0.2px;">${esc(subtitle)}</p>` : ''}
      </div>
    </div>
  </div>`;
}

function authorByline(name: string, role: string): string {
  const isEntertainer = role === 'entertainer';
  const avatarBg = isEntertainer ? 'linear-gradient(135deg, #be161e, #9a1218)' : 'linear-gradient(135deg, #0b5f98, #084e7e)';
  const roleLabel = isEntertainer ? 'Staff Columnist' : 'Senior Analyst';
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #e5e7eb;">
    <div style="width:44px;height:44px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${name.charAt(0).toUpperCase()}</div>
    <div>
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:700;font-size:14px;color:#0d0d0d;line-height:1.2;">${esc(name)}</div>
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#6b7280;letter-spacing:0.3px;">${roleLabel}</div>
    </div>
  </div>`;
}

function dualPerspective(entertainerText: string, analystText: string): string {
  return `
  <div style="display:grid;gap:20px;margin:28px 0;">
    <div style="padding:28px 36px;border-left:4px solid #be161e;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      ${authorByline('Mason Reed', 'entertainer')}
      <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:17px;line-height:1.85;color:#374151;">${esc(entertainerText)}</p>
    </div>
    <div style="padding:28px 36px;border-left:4px solid #0b5f98;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      ${authorByline('Trent Weston', 'analyst')}
      <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:17px;line-height:1.85;color:#374151;">${esc(analystText)}</p>
    </div>
  </div>`;
}

// Render dialogue as a back-and-forth conversation with multiple blobs
function conversationalDialogue(dialogue: Array<{ speaker: 'entertainer' | 'analyst'; text: string }>): string {
  if (!dialogue?.length) return '';

  return `
  <div style="display:grid;gap:16px;margin:28px 0;">
    ${dialogue.map((turn) => {
      const isEntertainer = turn.speaker === 'entertainer';
      const borderColor = isEntertainer ? '#be161e' : '#0b5f98';
      const name = isEntertainer ? 'Mason Reed' : 'Trent Weston';
      const role = isEntertainer ? 'entertainer' : 'analyst';
      return `
      <div style="padding:26px 36px;border-left:4px solid ${borderColor};background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        ${authorByline(name, role)}
        <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:17px;line-height:1.85;color:#374151;">${esc(turn.text)}</p>
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
  <article style="margin-bottom:48px;">
    ${sectionHeader(headerTitle, subtitle)}

    <div style="padding:32px 40px;border-left:4px solid #be161e;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.07);margin-bottom:20px;">
      ${authorByline('Mason Reed', 'entertainer')}
      <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:19px;line-height:1.9;color:#1f2937;font-style:italic;">"${esc(d.bot1_text)}"</p>
    </div>

    <div style="padding:32px 40px;border-left:4px solid #0b5f98;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.07);">
      ${authorByline('Trent Weston', 'analyst')}
      <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:18px;line-height:1.9;color:#374151;">${esc(d.bot2_text)}</p>
    </div>
  </article>`;
}

function sectionCallbacks(cb: CallbacksSection | null): string {
  if (!cb) return '';

  const hasGrades = (cb.forecast_picks || []).some(x => x.entertainer_correct !== undefined || x.analyst_correct !== undefined);

  const picks = (cb.forecast_picks || []).map(x => {
    const label = (x.team1 && x.team2)
      ? `${esc(x.team1)} vs ${esc(x.team2)}`
      : `Matchup #${esc(x.matchup_id)}`;

    const entGrade = x.entertainer_correct !== undefined
      ? (x.entertainer_correct ? `<span style="color:#16a34a;font-weight:600;">✓</span>` : `<span style="color:#dc2626;font-weight:600;">✗</span>`)
      : '';
    const anaGrade = x.analyst_correct !== undefined
      ? (x.analyst_correct ? `<span style="color:#16a34a;font-weight:600;">✓</span>` : `<span style="color:#dc2626;font-weight:600;">✗</span>`)
      : '';

    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e5e7eb;">
      <span style="font-weight:500;">${label}</span>
      <span style="color:#6b7280;font-size:14px;">🎭 ${esc(x.entertainer_pick || '—')}${entGrade} · 📊 ${esc(x.analyst_pick || '—')}${anaGrade}</span>
    </div>`;
  }).join('');

  // Tally scores if graded
  const gradeSummary = hasGrades ? (() => {
    const entW = (cb.forecast_picks || []).filter(x => x.entertainer_correct === true).length;
    const entL = (cb.forecast_picks || []).filter(x => x.entertainer_correct === false).length;
    const anaW = (cb.forecast_picks || []).filter(x => x.analyst_correct === true).length;
    const anaL = (cb.forecast_picks || []).filter(x => x.analyst_correct === false).length;
    return `<div style="display:flex;gap:24px;margin-top:12px;padding-top:12px;border-top:2px solid #e5e7eb;font-size:13px;">
      <span>🎭 Mason Reed: <strong style="color:${entW >= entL ? '#16a34a' : '#dc2626'}">${entW}-${entL}</strong></span>
      <span>📊 Westy: <strong style="color:${anaW >= anaL ? '#16a34a' : '#dc2626'}">${anaW}-${anaL}</strong></span>
    </div>`;
  })() : '';

  return `
  <article>
    ${sectionHeader('LOOKING BACK', 'How did our predictions hold up?')}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px 28px;margin-bottom:24px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#9ca3af;letter-spacing:0.5px;margin-bottom:14px;">FILED: ${esc(cb.saved_at || '')}</div>
      ${cb.spotlight_team ? `<div style="margin-bottom:18px;font-family:'Georgia','Times New Roman',serif;font-size:16px;color:#374151;"><strong style="color:#0d0d0d;">Last week's spotlight:</strong> ${esc(cb.spotlight_team)}</div>` : ''}
      ${picks || '<div style="font-family:\'Georgia\',serif;color:#6b7280;font-style:italic;">No predictions to review.</div>'}
      ${gradeSummary}
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
    let labelBadgeBg: string;
    let labelBadgeColor: string;
    if (isChampMatch) {
      matchLabel = bracketLabel || 'Championship';
      labelBadgeBg = 'linear-gradient(90deg,#92400e,#b45309)';
      labelBadgeColor = '#fff';
      cardStyle = 'border:2px solid #f59e0b;';
    } else if (isThirdPlace) {
      matchLabel = bracketLabel || '3rd Place Game';
      labelBadgeBg = 'linear-gradient(90deg,#78350f,#a16207)';
      labelBadgeColor = '#fff';
      cardStyle = 'border:1px solid #d97706;';
    } else if (isToiletBowl) {
      matchLabel = bracketLabel || 'Toilet Bowl';
      labelBadgeBg = '#6b7280';
      labelBadgeColor = '#fff';
      cardStyle = 'border:1px solid #d1d5db;';
    } else if (bracketLabel) {
      matchLabel = bracketLabel;
      labelBadgeBg = '#0b5f98';
      labelBadgeColor = '#fff';
      cardStyle = 'border:1px solid #cbd5e1;';
    } else {
      matchLabel = isPlayoffs ? `Playoff Matchup ${x.matchup_id}` : `Matchup ${x.matchup_id}`;
      labelBadgeBg = '#374151';
      labelBadgeColor = '#fff';
      cardStyle = 'border:1px solid #e5e7eb;';
    }

    // Extract team names and scores from recap data if available
    const winner = x.winner || '';
    const loser = x.loser || '';
    const winnerScore = x.winner_score;
    const loserScore = x.loser_score;

    // Team-color gradient stripe: a 4px accent bar at the top of each card showing team colors.
    // This ensures team identity is visible even for teams with very dark primary colors.
    const stripeHtml = (winner && loser && !isChampMatch && !isThirdPlace && !isToiletBowl)
      ? `<div style="height:4px;background:linear-gradient(90deg,${getTeamColor(winner,'primary')} 0%,${getTeamColor(winner,'primary')} 49%,${getTeamColor(loser,'primary')} 51%,${getTeamColor(loser,'primary')} 100%);"></div>`
      : '';

    // Use conversational dialogue if available (multi-turn), otherwise fall back to dual perspective
    const dialogueHtml = x.dialogue && x.dialogue.length > 0
      ? conversationalDialogue(x.dialogue)
      : dualPerspective(x.bot1, x.bot2);

    // Top performers chips
    const playerChips = (players: Array<{ name: string; points: number }> | undefined, side: 'winner' | 'loser') => {
      if (!players?.length) return '';
      const color = side === 'winner' ? '#059669' : '#6b7280';
      return players.slice(0, 3).map(pl => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:3px;gap:12px;">
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(pl.name)}</span>
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:${color};flex-shrink:0;">${pl.points.toFixed(1)}</span>
        </div>`).join('');
    };

    const hasPlayers = x.winner_top_players?.length || x.loser_top_players?.length;
    const performersRow = hasPlayers ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 20px 16px;">
        <div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#059669;margin-bottom:6px;">Top Performers</div>
          <div style="display:flex;flex-direction:column;gap:4px;">${playerChips(x.winner_top_players, 'winner')}</div>
        </div>
        <div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280;margin-bottom:6px;">Top Performers</div>
          <div style="display:flex;flex-direction:column;gap:4px;">${playerChips(x.loser_top_players, 'loser')}</div>
        </div>
      </div>` : '';

    return `
    <div style="${cardStyle}background:#fafafa;border-radius:6px;overflow:hidden;margin-bottom:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      ${stripeHtml}
      <div style="background:${labelBadgeBg};padding:10px 20px;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${labelBadgeColor};">${esc(matchLabel)}</span>
      </div>
      <div style="padding:20px 20px 4px;">
        ${winner && loser ? matchupVsBlock(winner, loser, winnerScore, loserScore) : ''}
      </div>
      ${performersRow}
      <div style="padding:0 20px 20px;">
        ${dialogueHtml}
      </div>
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
    const coverageBg = x.coverage_level === 'high' ? '#be161e' : x.coverage_level === 'moderate' ? '#374151' : '#6b7280';
    const coverageLabel = x.coverage_level === 'high' ? 'HOT' : x.coverage_level === 'moderate' ? 'NOTABLE' : 'PICKUP';

    const teamLogo = x.team ? `<div style="flex-shrink:0;">${teamBadge(x.team, 'md')}</div>` : '';
    const faabBadge = x.faab_spent != null
      ? `<span style="display:inline-flex;align-items:center;background:#059669;color:#fff;padding:4px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.5px;border-radius:2px;margin-left:12px;">$${x.faab_spent} FAAB</span>`
      : '';

    const playerLine = x.player
      ? `<div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:20px;color:#fff;line-height:1.15;">${esc(x.player)}${faabBadge}</div>`
      : '';
    const teamLine = x.team
      ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.55);margin-top:4px;">→ ${esc(x.team)}</div>`
      : '';

    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:28px;box-shadow:0 2px 8px rgba(0,0,0,0.07);overflow:hidden;">
      <div style="background:#0d0d0d;padding:18px 24px;">
        <div style="display:flex;align-items:center;gap:16px;">
          ${teamLogo}
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="background:${coverageBg};color:#fff;padding:3px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;border-radius:2px;">${coverageLabel}</span>
            </div>
            ${playerLine}
            ${teamLine}
          </div>
        </div>
        ${x.reasons?.length ? `<div style="margin-top:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.4);letter-spacing:0.2px;">${esc(x.reasons.join(' · '))}</div>` : ''}
      </div>
      <div style="padding:4px 0;">
        ${dualPerspective(x.bot1, x.bot2)}
      </div>
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
      ? Object.entries(x.teams).map(([team, rec]) => {
          const tPrimary = getTeamColor(team, 'primary');
          const tSecondary = getTeamColor(team, 'secondary');
          const tFg = textOnBg(tPrimary);
          return `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;margin:10px 0;overflow:hidden;">
            <div style="background:${tPrimary};border-bottom:2px solid ${tSecondary};padding:10px 14px;display:flex;align-items:center;gap:8px;">
              ${teamBadge(team, 'sm')}
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:700;color:${tFg};font-size:14px;">${esc(team)}</div>
            </div>
            <div style="padding:10px 14px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:#059669;margin-bottom:2px;">Receives: ${esc((rec.gets || []).join(', ') || '—')}</div>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:#be161e;">Sends: ${esc((rec.gives || []).join(', ') || '—')}</div>
            </div>
          </div>`;
        }).join('')
      : '';

    const teamAnalysis = Object.entries(x.analysis || {}).map(([team, a]) => {
      const gradeColor = (g: string) => g.startsWith('A') ? '#059669' : g.startsWith('B') ? '#0b5f98' : g.startsWith('C') ? '#92400e' : '#be161e';
      const entGrade = a.entertainer_grade || a.grade;
      const anaGrade = a.analyst_grade || a.grade;
      return `
      <div style="margin:20px 0;padding-top:20px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${teamBadge(team, 'sm')}
            <span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:16px;color:${getTeamColor(team, 'primary')};">${esc(team)}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;color:#be161e;letter-spacing:0.5px;text-transform:uppercase;">Mason</span>
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:${gradeColor(entGrade)};color:#fff;padding:4px 12px;font-weight:700;font-size:13px;letter-spacing:0.5px;">${esc(entGrade)}</span>
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;color:#0b5f98;letter-spacing:0.5px;text-transform:uppercase;margin-left:4px;">Westy</span>
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:${gradeColor(anaGrade)};color:#fff;padding:4px 12px;font-weight:700;font-size:13px;letter-spacing:0.5px;">${esc(anaGrade)}</span>
          </div>
        </div>
        ${dualPerspective(a.entertainer_paragraph, a.analyst_paragraph)}
      </div>`;
    }).join('');

    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:28px;box-shadow:0 2px 8px rgba(0,0,0,0.07);overflow:hidden;">
      <div style="background:#0d0d0d;padding:18px 28px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#be161e;margin-bottom:8px;">Trade Report</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:20px;color:#fff;line-height:1.2;">${esc(x.context || 'Trade')}</div>
      </div>
      <div style="padding:24px 28px;">
        <div style="margin-bottom:8px;">${teamMoves}</div>
        ${teamAnalysis}
      </div>
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader('TRADE ANALYSIS', 'Breaking down this week\'s deals')}
    ${items}
  </article>`;
}

function sectionSpotlight(d: SpotlightSection): string {
  const spotPrimary = getTeamColor(d.team, 'primary');
  const spotSecondary = getTeamColor(d.team, 'secondary');
  const spotTertiary = getTeamColor(d.team, 'tertiary');
  return `
  <article>
    ${sectionHeader('TEAM OF THE WEEK', 'Spotlight performance')}
    <div style="background:${spotPrimary};border-radius:8px;padding:32px 36px;margin-bottom:4px;display:flex;align-items:center;gap:24px;border-left:8px solid ${spotTertiary};border-right:4px solid ${spotSecondary};">
      <div style="flex-shrink:0;">${teamBadge(d.team, 'xl')}</div>
      <div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:8px;">Team of the Week</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:34px;color:#fff;letter-spacing:-0.5px;line-height:1.1;">${esc(d.team)}</div>
      </div>
    </div>
    ${dualPerspective(d.bot1, d.bot2)}
  </article>`;
}

function sectionForecast(d: ForecastData): string {
  const recordsLine = d.records
    ? `<div style="display:flex;gap:0;margin-bottom:28px;border:1px solid #e5e7eb;overflow:hidden;border-radius:4px;">
         <div style="flex:1;padding:16px 20px;border-right:1px solid #e5e7eb;text-align:center;">
           <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#be161e;margin-bottom:6px;">Mason Reed</div>
           <div style="font-family:'Georgia','Times New Roman',serif;font-size:28px;font-weight:700;color:#0d0d0d;">${esc(String(d.records.entertainer?.w || 0))}-${esc(String(d.records.entertainer?.l || 0))}</div>
         </div>
         <div style="flex:1;padding:16px 20px;text-align:center;">
           <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0b5f98;margin-bottom:6px;">Westy</div>
           <div style="font-family:'Georgia','Times New Roman',serif;font-size:28px;font-weight:700;color:#0d0d0d;">${esc(String(d.records.analyst?.w || 0))}-${esc(String(d.records.analyst?.l || 0))}</div>
         </div>
       </div>`
    : '';

  const rows = (d.picks || []).map(p => {
    const fp1 = getTeamColor(p.team1, 'primary');
    const fp1t = getTeamColor(p.team1, 'tertiary');
    const fp2 = getTeamColor(p.team2, 'primary');
    const fp2t = getTeamColor(p.team2, 'tertiary');
    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="display:flex;align-items:stretch;">
        <div style="flex:1;background:${fp1};padding:12px 16px;display:flex;align-items:center;gap:8px;border-right:3px solid ${fp1t};">
          ${teamBadge(p.team1,'sm')}<span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:14px;color:#fff;">${esc(p.team1)}</span>
        </div>
        <div style="background:#0d0d0d;padding:0 12px;display:flex;align-items:center;">
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:2px;">VS</span>
        </div>
        <div style="flex:1;background:${fp2};padding:12px 16px;display:flex;align-items:center;justify-content:flex-end;gap:8px;border-left:3px solid ${fp2t};">
          <span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:14px;color:#fff;">${esc(p.team2)}</span>${teamBadge(p.team2,'sm')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
        <div style="padding:16px 18px;border-right:1px solid #e5e7eb;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;margin-bottom:8px;">Mason Reed</div>
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(p.bot1_pick || '—')}</div>
          ${p.confidence_bot1 ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#6b7280;margin-top:4px;">${esc(p.confidence_bot1)}</div>` : ''}
          ${p.upset_bot1 ? `<span style="display:inline-block;margin-top:6px;background:#be161e;color:#fff;padding:2px 10px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">UPSET PICK</span>` : ''}
          ${p.note_bot1 ? `<p style="margin:10px 0 0;font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.65;color:#4b5563;font-style:italic;">${esc(p.note_bot1)}</p>` : ''}
        </div>
        <div style="padding:16px 18px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0b5f98;margin-bottom:8px;">Westy</div>
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(p.bot2_pick || '—')}</div>
          ${p.confidence_bot2 ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#6b7280;margin-top:4px;">${esc(p.confidence_bot2)}</div>` : ''}
          ${p.upset_bot2 ? `<span style="display:inline-block;margin-top:6px;background:#0b5f98;color:#fff;padding:2px 10px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">UPSET PICK</span>` : ''}
          ${p.note_bot2 ? `<p style="margin:10px 0 0;font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.65;color:#4b5563;font-style:italic;">${esc(p.note_bot2)}</p>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  const extras = d.bot1_matchup_of_the_week || d.bot2_matchup_of_the_week ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:20px 24px;margin-top:24px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d0d0d;margin-bottom:14px;">Matchup of the Week</div>
      ${d.bot1_matchup_of_the_week ? `<div style="font-family:'Georgia','Times New Roman',serif;font-size:15px;color:#374151;margin-bottom:10px;"><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;color:#be161e;letter-spacing:0.5px;text-transform:uppercase;margin-right:8px;">Mason</span>${esc(d.bot1_matchup_of_the_week)}</div>` : ''}
      ${d.bot2_matchup_of_the_week ? `<div style="font-family:'Georgia','Times New Roman',serif;font-size:15px;color:#374151;"><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;color:#0b5f98;letter-spacing:0.5px;text-transform:uppercase;margin-right:8px;">Westy</span>${esc(d.bot2_matchup_of_the_week)}</div>` : ''}
    </div>` : '';

  const introDialogue = d.intro_dialogue?.length
    ? conversationalDialogue(d.intro_dialogue)
    : '';

  return `
  <article>
    ${sectionHeader("NEXT WEEK'S FORECAST", 'Who will come out on top?')}
    ${introDialogue}
    ${recordsLine}
    ${rows || '<div style="font-family:\'Georgia\',serif;color:#6b7280;font-style:italic;padding:20px 0;">No upcoming matchups found.</div>'}
    ${extras}
  </article>`;
}

function sectionFinal(d: FinalWordSection): string {
  return `
  <article>
    ${sectionHeader('THE FINAL WORD', 'Closing thoughts')}
    <div style="padding:32px 40px;border-left:4px solid #be161e;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.07);margin-bottom:20px;">
      ${authorByline('Mason Reed', 'entertainer')}
      <blockquote style="margin:0;padding:0;border:none;">
        <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:18px;line-height:1.9;color:#374151;font-style:italic;">${esc(d.bot1)}</p>
      </blockquote>
    </div>
    <div style="padding:32px 40px;border-left:4px solid #0b5f98;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.07);">
      ${authorByline('Trent Weston', 'analyst')}
      <blockquote style="margin:0;padding:0;border:none;">
        <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:18px;line-height:1.9;color:#374151;">${esc(d.bot2)}</p>
      </blockquote>
    </div>
  </article>`;
}

// ============ New LLM-Powered Section Renderers ============

function sectionBotDebates(debates: BotDebate[]): string {
  if (!debates || debates.length === 0) return '';

  const debateCards = debates.map(d => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:24px;box-shadow:0 2px 6px rgba(0,0,0,0.07);">
      <div style="background:#0d0d0d;padding:14px 24px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#be161e;margin-bottom:4px;">The Great Debate</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:19px;color:#fff;">${esc(d.team1)} vs. ${esc(d.team2)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
        <div style="padding:20px 22px;border-right:1px solid #e5e7eb;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;margin-bottom:6px;">Mason Reed</div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:#0d0d0d;margin-bottom:10px;">${esc(d.entertainer_position)}</div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.75;color:#374151;">${esc(d.entertainer_argument)}</p>
        </div>
        <div style="padding:20px 22px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0b5f98;margin-bottom:6px;">Westy</div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:#0d0d0d;margin-bottom:10px;">${esc(d.analyst_position)}</div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.75;color:#374151;">${esc(d.analyst_argument)}</p>
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

  const boldnessColor = { mild: '#0b5f98', spicy: '#be161e', nuclear: '#0d0d0d' };
  const boldnessBg = { mild: '#eff6ff', spicy: '#fff1f2', nuclear: '#0d0d0d' };
  const boldnessTextColor = { mild: '#374151', spicy: '#374151', nuclear: '#e5e7eb' };
  const boldnessAccent = { mild: '#0b5f98', spicy: '#be161e', nuclear: '#be161e' };

  const takeCards = takes.map(t => {
    const isNuclear = t.boldness === 'nuclear';
    const bg = boldnessBg[t.boldness];
    const borderColor = boldnessColor[t.boldness];
    const textColor = boldnessTextColor[t.boldness];
    const accentColor = boldnessAccent[t.boldness];
    const botLabel = t.bot === 'entertainer' ? 'Mason Reed' : 'Trent Weston';
    const boldnessLabel = t.boldness.toUpperCase();
    return `
    <div style="background:${bg};border-left:5px solid ${borderColor};padding:24px 28px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${accentColor};">${botLabel}</span>
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${isNuclear ? '#be161e' : '#6b7280'};background:${isNuclear ? 'rgba(190,22,30,0.15)' : '#e5e7eb'};padding:2px 10px;">${boldnessLabel}</span>
      </div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${accentColor};margin-bottom:8px;">${esc(t.subject)}</div>
      <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:17px;line-height:1.8;font-style:italic;color:${textColor};">"${esc(t.take)}"</p>
      ${t.followUp ? `<div style="margin-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:#6b7280;border-top:1px solid ${isNuclear ? 'rgba(255,255,255,0.15)' : '#e5e7eb'};padding-top:10px;">Update: ${esc(t.followUp)}</div>` : ''}
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader('HOT TAKES', "Bold predictions we'll grade later")}
    ${takeCards}
  </article>`;
}

function sectionWeeklyAwards(awards: WeeklyAwards): string {
  if (!awards) return '';

  return `
  <article>
    ${sectionHeader('WEEKLY AWARDS', "This week's winners and losers")}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid #059669;padding:20px 22px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#059669;margin-bottom:10px;">MVP of the Week</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:20px;color:#0d0d0d;margin-bottom:4px;">${esc(awards.mvp.team)}</div>
        ${awards.mvp.points ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#059669;margin-bottom:14px;">${awards.mvp.points.toFixed(1)} pts</div>` : '<div style="margin-bottom:14px;"></div>'}
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;color:#374151;line-height:1.6;margin-bottom:6px;">${esc(awards.mvp.entertainer_take)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;color:#374151;line-height:1.6;">${esc(awards.mvp.analyst_take)}</div>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid #be161e;padding:20px 22px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#be161e;margin-bottom:10px;">Bust of the Week</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:20px;color:#0d0d0d;margin-bottom:4px;">${esc(awards.bust.team)}</div>
        ${awards.bust.points ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#be161e;margin-bottom:14px;">${awards.bust.points.toFixed(1)} pts</div>` : '<div style="margin-bottom:14px;"></div>'}
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;color:#374151;line-height:1.6;margin-bottom:6px;">${esc(awards.bust.entertainer_take)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;color:#374151;line-height:1.6;">${esc(awards.bust.analyst_take)}</div>
      </div>
    </div>

    ${awards.biggest_blowout ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #0d0d0d;padding:16px 20px;margin-bottom:12px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d0d0d;margin-bottom:6px;">Biggest Blowout</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;margin-bottom:4px;">${esc(awards.biggest_blowout.winner)} def. ${esc(awards.biggest_blowout.loser)} (+${awards.biggest_blowout.margin.toFixed(1)})</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;color:#6b7280;font-style:italic;">${esc(awards.biggest_blowout.commentary)}</div>
    </div>` : ''}

    ${awards.nail_biter ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #0b5f98;padding:16px 20px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0b5f98;margin-bottom:6px;">Nail-Biter</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;margin-bottom:4px;">${esc(awards.nail_biter.winner)} def. ${esc(awards.nail_biter.loser)} (+${awards.nail_biter.margin.toFixed(1)})</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;color:#6b7280;font-style:italic;">${esc(awards.nail_biter.commentary)}</div>
    </div>` : ''}
  </article>`;
}

function sectionWhatIf(scenarios: WhatIfScenario[]): string {
  if (!scenarios || scenarios.length === 0) return '';

  const scenarioCards = scenarios.map(s => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid #374151;padding:18px 22px;margin-bottom:14px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#9ca3af;margin-bottom:6px;">${esc(s.winner)} def. ${esc(s.loser)} by ${s.margin.toFixed(1)}</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:16px;color:#0d0d0d;margin-bottom:6px;">${esc(s.scenario)}</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:15px;color:#059669;font-style:italic;">${esc(s.outcome_change)}</div>
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('WHAT IF...', 'Alternative timelines for close games')}
    ${scenarioCards}
  </article>`;
}

function sectionDynastyAnalysis(analyses: DynastyAnalysis[]): string {
  if (!analyses || analyses.length === 0) return '';

  const analysisCards = analyses.map(a => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="background:#0d0d0d;padding:16px 24px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">Dynasty Deep Dive</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:18px;color:#fff;">${a.teams.join(' vs. ')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e5e7eb;">
        <div style="padding:14px 20px;border-right:1px solid #e5e7eb;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Short-term</div>
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#059669;">${esc(a.short_term_winner)}</div>
        </div>
        <div style="padding:14px 20px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Long-term</div>
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0b5f98;">${esc(a.long_term_winner)}</div>
        </div>
      </div>
      <div style="padding:4px 0;">
        ${dualPerspective(a.entertainer_dynasty_take, a.analyst_dynasty_take)}
      </div>
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
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:24px;box-shadow:0 2px 6px rgba(0,0,0,0.07);">
      <div style="background:linear-gradient(160deg,#0d0d0d 0%,#1a1a2e 100%);padding:22px 28px;text-align:center;">
        ${r.rivalry_name ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#be161e;margin-bottom:8px;">${esc(r.rivalry_name)}</div>` : ''}
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:22px;color:#fff;line-height:1.2;">${esc(r.team1)} vs. ${esc(r.team2)}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.5);margin-top:6px;">All-time: ${r.all_time_record.team1_wins}–${r.all_time_record.team2_wins}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
        <div style="padding:20px 22px;border-right:1px solid #e5e7eb;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;margin-bottom:8px;">The Hype</div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.75;color:#374151;">${esc(r.entertainer_hype)}</p>
        </div>
        <div style="padding:20px 22px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0b5f98;margin-bottom:8px;">The Breakdown</div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.75;color:#374151;">${esc(r.analyst_breakdown)}</p>
        </div>
      </div>
    </div>
  `).join('');

  return `
  <article>
    ${sectionHeader('RIVALRY WATCH', 'When history meets the present')}
    ${rivalryCards}
  </article>`;
}

function sectionPlayoffOdds(odds: PlayoffOddsSection): string {
  if (!odds) return '';

  return `
  <article>
    ${sectionHeader('PLAYOFF PICTURE', "Who's in, who's out, who's sweating")}

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-bottom:24px;border:1px solid #e5e7eb;overflow:hidden;border-radius:4px;">
      <div style="padding:16px 18px;border-right:1px solid #e5e7eb;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#059669;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #059669;">Clinched</div>
        ${odds.clinched.length > 0
          ? odds.clinched.map(t => `<div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:14px;color:#0d0d0d;margin-bottom:4px;">${esc(t)}</div>`).join('')
          : '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;color:#9ca3af;font-size:13px;font-style:italic;">None yet</div>'}
      </div>
      <div style="padding:16px 18px;border-right:1px solid #e5e7eb;background:#fffbf0;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#92400e;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #f59e0b;">On the Bubble</div>
        ${odds.bubble_teams.length > 0
          ? odds.bubble_teams.map(t => `<div style="margin-bottom:8px;"><div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:14px;color:#0d0d0d;">${esc(t.team)} <span style="font-weight:400;font-size:12px;color:#6b7280;">${t.wins}-${t.losses}</span></div><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#92400e;">${esc(t.scenario)}</div></div>`).join('')
          : '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;color:#9ca3af;font-size:13px;font-style:italic;">TBD</div>'}
      </div>
      <div style="padding:16px 18px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #be161e;">Eliminated</div>
        ${odds.eliminated.length > 0
          ? odds.eliminated.map(t => `<div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:14px;color:#6b7280;margin-bottom:4px;text-decoration:line-through;">${esc(t)}</div>`).join('')
          : '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;color:#9ca3af;font-size:13px;font-style:italic;">None yet</div>'}
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
    <div style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid #374151;padding:18px 22px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#374151;">${typeEmoji[c.type]} ${typeLabel[c.type]}</span>
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#9ca3af;">Week ${c.original_week}</span>
      </div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;color:#9ca3af;font-style:italic;margin-bottom:8px;">Filed: "${esc(c.original_statement)}"</div>
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:700;font-size:13px;color:#0d0d0d;margin-bottom:6px;">${esc(c.current_status)}</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.7;color:#374151;font-style:italic;">"${esc(c.bot_reaction)}"</div>
    </div>
  `;
  }).join('');

  return `
  <article>
    ${sectionHeader('RECEIPTS', 'Following up on past predictions')}
    ${callbackCards}
  </article>`;
}

// ============ Special Episode Section Renderers ============

function sectionPowerRankings(d: PowerRankingsSection): string {
  const rankings = (d.rankings || []).map(r => {
    const rankBg = r.rank === 1 ? 'linear-gradient(135deg,#f59e0b,#d97706)' : r.rank === 2 ? 'linear-gradient(135deg,#9ca3af,#6b7280)' : r.rank === 3 ? 'linear-gradient(135deg,#c2810c,#a16207)' : r.rank <= 6 ? '#0b5f98' : '#e5e7eb';
    const rankTextColor = r.rank <= 6 ? '#fff' : '#374151';
    const isLast = r.rank === (d.rankings?.length || 0);

    // Trend arrow
    const trendHtml = r.trend === 'up'
      ? `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:#059669;margin-left:8px;">▲${r.trendAmount ? r.trendAmount : ''}</span>`
      : r.trend === 'down'
      ? `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:#be161e;margin-left:8px;">▼${r.trendAmount ? r.trendAmount : ''}</span>`
      : `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#9ca3af;margin-left:8px;">—</span>`;

    const rowAccent = hexToRgba(getTeamColor(r.team, 'primary'), 0.18);
    return `
    <div style="display:flex;align-items:flex-start;gap:16px;padding:18px 22px;background:${rowAccent};border:1px solid #e5e7eb;border-bottom:none;${isLast ? 'border-bottom:1px solid #e5e7eb;' : ''}">
      <div style="width:38px;height:38px;background:${rankBg};color:${rankTextColor};display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;font-size:16px;flex-shrink:0;border-radius:2px;">${r.rank}</div>
      <div style="flex-shrink:0;margin-top:1px;">${teamBadge(r.team, 'sm')}</div>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;margin-bottom:6px;">
          <span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:16px;color:${getTeamColor(r.team, 'primary')};">${esc(r.team)}</span>
          ${trendHtml}
          ${r.record ? `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#9ca3af;margin-left:10px;">${esc(r.record)}</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;margin-bottom:3px;">Mason</div>
            <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.55;color:#4b5563;font-style:italic;">${esc(r.bot1_blurb)}</div>
          </div>
          <div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0b5f98;margin-bottom:3px;">Westy</div>
            <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.55;color:#4b5563;font-style:italic;">${esc(r.bot2_blurb)}</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  <article>
    ${sectionHeader('PRESEASON POWER RANKINGS', "Who's poised for glory?")}
    ${dualPerspective(d.bot1_intro, d.bot2_intro)}
    <div style="margin-top:28px;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
      <div style="background:#0d0d0d;padding:12px 20px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Power Rankings</div>
      </div>
      ${rankings}
    </div>
  </article>`;
}

function sectionSeasonPreview(d: SeasonPreviewSection): string {
  const teamPreviewCard = (team: string, reason: string, accent: string) => `
    <div style="padding:14px 18px;background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${accent};margin-bottom:8px;display:flex;align-items:flex-start;gap:12px;">
      <div style="flex-shrink:0;margin-top:2px;">${teamBadge(team,'sm')}</div>
      <div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:${getTeamColor(team,'primary')};margin-bottom:3px;">${esc(team)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;color:#374151;line-height:1.6;">${esc(reason)}</div>
      </div>
    </div>`;

  const contenders = (d.contenders || []).map(c => teamPreviewCard(c.team, c.reason, '#059669')).join('');
  const sleepers   = (d.sleepers   || []).map(s => teamPreviewCard(s.team, s.reason, '#f59e0b')).join('');
  const busts      = (d.bustCandidates || []).map(b => teamPreviewCard(b.team, b.reason, '#be161e')).join('');

  const predictions1 = (d.boldPredictions?.bot1 || []).map(p => `<li style="font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.7;color:#374151;margin-bottom:8px;">${esc(p)}</li>`).join('');
  const predictions2 = (d.boldPredictions?.bot2 || []).map(p => `<li style="font-family:'Georgia','Times New Roman',serif;font-size:15px;line-height:1.7;color:#374151;margin-bottom:8px;">${esc(p)}</li>`).join('');

  const subHeading = (label: string, accent: string) => `<h3 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${accent};margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid ${accent};">${label}</h3>`;

  return `
  <article>
    ${sectionHeader('SEASON PREVIEW', 'Your complete guide to the upcoming season')}

    <div style="margin-bottom:36px;">
      ${subHeading('Championship Contenders', '#059669')}
      ${contenders || '<div style="font-family:\'Georgia\',serif;color:#9ca3af;font-style:italic;">No contenders identified.</div>'}
    </div>

    <div style="margin-bottom:36px;">
      ${subHeading('Sleeper Teams', '#92400e')}
      ${sleepers || '<div style="font-family:\'Georgia\',serif;color:#9ca3af;font-style:italic;">No sleepers identified.</div>'}
    </div>

    <div style="margin-bottom:36px;">
      ${subHeading('Bust Watch', '#be161e')}
      ${busts || '<div style="font-family:\'Georgia\',serif;color:#9ca3af;font-style:italic;">No bust candidates identified.</div>'}
    </div>

    <div style="margin-bottom:36px;">
      ${subHeading('Bold Predictions', '#374151')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e5e7eb;overflow:hidden;border-radius:4px;">
        <div style="padding:18px 20px;border-right:1px solid #e5e7eb;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#be161e;margin-bottom:12px;">Mason Reed</div>
          <ul style="margin:0;padding-left:18px;">${predictions1}</ul>
        </div>
        <div style="padding:18px 20px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0b5f98;margin-bottom:12px;">Trent Weston</div>
          <ul style="margin:0;padding-left:18px;">${predictions2}</ul>
        </div>
      </div>
    </div>

    <div style="background:#0d0d0d;border-radius:4px;padding:28px;text-align:center;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#be161e;margin-bottom:12px;">Championship Picks</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;">Mason</div>
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:18px;color:#fff;">${esc(d.championshipPick?.bot1 || 'TBD')}</div>
        </div>
        <div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;">Westy</div>
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:18px;color:#fff;">${esc(d.championshipPick?.bot2 || 'TBD')}</div>
        </div>
      </div>
    </div>
  </article>`;
}

// ============ Draft Episode Section Renderers ============

function sectionDraftPreview(d: DraftPreviewSection): string {
  const draftOrderHtml = (d.draftOrder || []).map(pick => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border:1px solid #e5e7eb;border-bottom:none;${pick.pick === (d.draftOrder?.length || 0) ? 'border-bottom:1px solid #e5e7eb;' : ''}">
      <div style="width:32px;height:32px;background:${pick.pick <= 3 ? 'linear-gradient(135deg,#7c3aed,#5b21b6)' : pick.pick <= 6 ? '#6b7280' : '#e5e7eb'};color:${pick.pick <= 6 ? '#fff' : '#374151'};display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;font-size:13px;flex-shrink:0;border-radius:2px;">${pick.pick}</div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-weight:600;font-size:15px;color:#0d0d0d;">${esc(pick.team)}</div>
    </div>`).join('');

  const prospectsHtml = (d.topProspects || []).slice(0, 10).map((p, i) => `
    <div style="padding:16px 20px;background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${i < 3 ? '#7c3aed' : i < 6 ? '#0b5f98' : '#6b7280'};margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${i < 3 ? '#7c3aed' : '#6b7280'};background:${i < 3 ? '#f5f3ff' : '#f3f4f6'};padding:2px 8px;border-radius:2px;">${esc(p.position)}</span>
        <span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:16px;color:#0d0d0d;">${esc(p.name)}</span>
      </div>
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;line-height:1.7;color:#374151;font-style:italic;">${esc(p.analysis)}</div>
    </div>`).join('');

  const mockDraftHtml = (d.mockDraft || []).slice(0, 12).map(pick => `
    <div style="display:flex;gap:14px;padding:12px 16px;background:#fff;border-bottom:1px solid #f3f4f6;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;color:#9ca3af;min-width:50px;padding-top:2px;">PICK ${pick.pick}</div>
      <div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(pick.player)}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#6b7280;margin-bottom:4px;">${esc(pick.team)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.6;color:#374151;font-style:italic;">${esc(pick.analysis)}</div>
      </div>
    </div>`).join('');

  return `
  <article>
    ${sectionHeader('DRAFT PREVIEW', 'Everything you need to know before draft day')}
    ${dualPerspective(d.bot1_preview, d.bot2_preview)}
    ${draftOrderHtml ? `
    <div style="margin:32px 0;">
      <h3 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d0d0d;margin:0 0 12px;">DRAFT ORDER</h3>
      <div style="border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">${draftOrderHtml}</div>
    </div>` : ''}
    <div style="margin:32px 0;">
      <h3 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d0d0d;margin:0 0 12px;">TOP PROSPECTS</h3>
      ${prospectsHtml || '<div style="color:#6b7280;padding:16px;">Prospect data unavailable.</div>'}
    </div>
    ${mockDraftHtml ? `
    <div style="margin:32px 0;">
      <h3 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d0d0d;margin:0 0 12px;">MOCK DRAFT — ROUND 1</h3>
      <div style="border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;background:#f9fafb;">${mockDraftHtml}</div>
    </div>` : ''}
  </article>`;
}

function sectionDraftGrades(d: DraftGradesSection): string {
  const gradeColor = (grade: string) => {
    const g = grade.toUpperCase();
    if (g.startsWith('A')) return { bg: '#059669', text: '#fff' };
    if (g.startsWith('B')) return { bg: '#0b5f98', text: '#fff' };
    if (g.startsWith('C')) return { bg: '#f59e0b', text: '#fff' };
    return { bg: '#dc2626', text: '#fff' };
  };

  const gradesHtml = (d.grades || []).map(g => {
    const color = gradeColor(g.grade);
    const picksHtml = g.picks.map(p =>
      `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#6b7280;margin-right:12px;">Rd ${p.round}: ${esc(p.player)} (${esc(p.position)})</span>`
    ).join('');
    const tPrimary = getTeamColor(g.team, 'primary');
    const tSecondary = getTeamColor(g.team, 'secondary');
    const tFg = textOnBg(tPrimary);
    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:4px;margin-bottom:16px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:${tPrimary};border-bottom:3px solid ${tSecondary};">
        <div style="display:flex;align-items:center;gap:10px;">
          ${teamBadge(g.team,'sm')}
          <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:16px;color:${tFg};">${esc(g.team)}</div>
        </div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;font-size:18px;background:${color.bg};color:${color.text};padding:4px 14px;border-radius:4px;">${esc(g.grade)}</div>
      </div>
      ${picksHtml ? `<div style="padding:10px 20px;border-bottom:1px solid #f3f4f6;">${picksHtml}</div>` : ''}
      <div style="padding:16px 20px;">
        ${dualPerspective(g.bot1_analysis, g.bot2_analysis)}
      </div>
    </div>`;
  }).join('');

  const awardsHtml = `
    <div style="display:grid;gap:14px;margin:24px 0;">
      <div style="padding:16px 20px;background:#f0fdf4;border-left:4px solid #059669;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#059669;margin-bottom:6px;">BEST PICK</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(d.bestPick?.team)} — ${esc(d.bestPick?.player)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;color:#374151;font-style:italic;margin-top:4px;">${esc(d.bestPick?.reason)}</div>
      </div>
      <div style="padding:16px 20px;background:#fff7ed;border-left:4px solid #f59e0b;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#92400e;margin-bottom:6px;">STEAL OF THE DRAFT</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(d.stealOfTheDraft?.team)} — ${esc(d.stealOfTheDraft?.player)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;color:#374151;font-style:italic;margin-top:4px;">${esc(d.stealOfTheDraft?.reason)}</div>
      </div>
      <div style="padding:16px 20px;background:#fff1f2;border-left:4px solid #dc2626;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#dc2626;margin-bottom:6px;">WORST PICK</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(d.worstPick?.team)} — ${esc(d.worstPick?.player)}</div>
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;color:#374151;font-style:italic;margin-top:4px;">${esc(d.worstPick?.reason)}</div>
      </div>
    </div>`;

  return `
  <article>
    ${sectionHeader('DRAFT GRADES', "Grading every team's haul")}
    ${awardsHtml}
    <div style="margin:32px 0;">${gradesHtml || '<div style="color:#6b7280;padding:16px;">No draft grades available yet.</div>'}</div>
    ${dualPerspective(d.bot1_summary, d.bot2_summary)}
  </article>`;
}

function sectionMockDraft(d: MockDraftSection): string {
  if (!d?.picks?.length) return '';

  // Group picks by round
  const round1 = d.picks.filter(p => p.round === 1);
  const round2 = d.picks.filter(p => p.round === 2);

  const renderPick = (pick: MockDraftSection['picks'][0]) => {
    const overallLabel = `${pick.round}.${String(pick.slot).padStart(2, '0')}`;
    const isTradedPick = pick.ownerTeam !== pick.originalTeam;
    const teamPrimary   = getTeamColor(pick.ownerTeam, 'primary');
    const teamSecondary = getTeamColor(pick.ownerTeam, 'secondary');
    const fg = textOnBg(teamPrimary); // white for dark teams, near-black for bright teams
    const teamLabel = isTradedPick
      ? `${esc(pick.ownerTeam)} <span style="font-size:11px;color:${fg === '#fff' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'};font-weight:400;">(via ${esc(pick.originalTeam)})</span>`
      : esc(pick.ownerTeam);

    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
      <!-- Pick header — team primary color background -->
      <div style="background:${teamPrimary};padding:14px 22px;display:flex;align-items:center;gap:14px;border-bottom:3px solid ${teamSecondary};">
        <div style="flex-shrink:0;background:rgba(0,0,0,0.35);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;font-size:13px;letter-spacing:0.5px;padding:6px 12px;border-radius:3px;min-width:48px;text-align:center;">
          ${esc(overallLabel)}
        </div>
        <div style="flex-shrink:0;">${teamBadge(pick.ownerTeam,'sm')}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:700;font-size:15px;color:${fg};">${teamLabel}</div>
        <div style="margin-left:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${fg === '#fff' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'};">Pick ${pick.overall}</div>
      </div>
      <!-- Two-column bot takes -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
        <!-- Mason -->
        <div style="padding:18px 22px;border-right:1px solid #e5e7eb;">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#be161e;">Mason</span>
            <span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(pick.mason.player)}</span>
          </div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:14px;line-height:1.7;color:#374151;">${esc(pick.mason.analysis)}</p>
        </div>
        <!-- Westy -->
        <div style="padding:18px 22px;">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#0b5f98;">Westy</span>
            <span style="font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:15px;color:#0d0d0d;">${esc(pick.westy.player)}</span>
          </div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:14px;line-height:1.7;color:#374151;">${esc(pick.westy.analysis)}</p>
        </div>
      </div>
    </div>`;
  };

  // Bot intro blurbs
  const introParagraph = (d.mason_intro || d.westy_intro)
    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px;">
        ${d.mason_intro ? `<div style="padding:16px 20px;border-left:4px solid #be161e;background:#fff8f8;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#be161e;margin-bottom:8px;">MASON REED</div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:14px;line-height:1.7;color:#374151;font-style:italic;">${esc(d.mason_intro)}</p>
        </div>` : ''}
        ${d.westy_intro ? `<div style="padding:16px 20px;border-left:4px solid #0b5f98;background:#f0f7ff;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#0b5f98;margin-bottom:8px;">WESTY</div>
          <p style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:14px;line-height:1.7;color:#374151;font-style:italic;">${esc(d.westy_intro)}</p>
        </div>` : ''}
      </div>`
    : '';

  const roundDivider = round1.length > 0 && round2.length > 0
    ? `<div style="display:flex;align-items:center;gap:16px;margin:32px 0;">
        <div style="flex:1;height:2px;background:#0d0d0d;"></div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#0d0d0d;white-space:nowrap;">Round 2</div>
        <div style="flex:1;height:2px;background:#0d0d0d;"></div>
      </div>`
    : '';

  return `
  <article>
    ${sectionHeader('MOCK DRAFT', 'Rounds 1-2 — pick by pick')}
    ${introParagraph}
    ${round1.length > 0 ? `<div style="margin-bottom:4px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#0d0d0d;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #0d0d0d;">Round 1</div>
      ${round1.map(renderPick).join('')}
    </div>` : ''}
    ${roundDivider}
    ${round2.length > 0 ? round2.map(renderPick).join('') : ''}
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

  const weekBadge = week > 0 && !isSpecialEpisode
    ? `<div style="background:#be161e;padding:7px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:2.5px;color:#fff;text-transform:uppercase;border-radius:2px;flex-shrink:0;">Week ${week}</div>`
    : '';

  const header = `
  <header style="background:${headerBg};color:#fff;padding:0;margin-bottom:56px;border-radius:6px;overflow:hidden;">
    <div style="height:4px;background:linear-gradient(90deg,#be161e,#9a1218);"></div>
    <div style="padding:48px 56px 44px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${leagueBadge(28, episodeType)}
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.4);">East v. West Fantasy Football</div>
        </div>
        ${weekBadge}
      </div>
      <div style="display:flex;align-items:center;gap:28px;">
        <div style="flex:1;">
          <h1 style="margin:0;font-family:'Georgia','Times New Roman',serif;font-size:46px;line-height:1.05;font-weight:700;letter-spacing:-1px;">${headerAccent}${esc(meta.leagueName)}</h1>
          ${isSpecialEpisode && meta.episodeTitle ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:17px;color:rgba(255,255,255,0.7);margin-top:8px;font-weight:400;">${esc(mainTitle)}${subtitle ? ` ${esc(subtitle)}` : ''}</div>` : ''}
        </div>
        <div style="flex-shrink:0;opacity:0.85;">${leagueBadge(96, episodeType)}</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,0.12);margin:24px 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-family:'Georgia','Times New Roman',serif;font-style:italic;font-size:15px;color:rgba(255,255,255,0.5);">Your league, covered every week.</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.35);letter-spacing:0.5px;">${esc(meta.date)}</div>
      </div>
    </div>
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
      case 'DraftPreview': return sectionDraftPreview(s.data);
      case 'DraftGrades': return sectionDraftGrades(s.data);
      case 'MockDraft': return sectionMockDraft(s.data);
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
  body { margin: 0; padding: 0; background: #f0f0f0; font-family: 'Georgia', 'Times New Roman', serif; color: #374151; line-height: 1.8; font-size: 17px; }
  article { margin-bottom: 72px; }
  article + article { border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print {
    body { background: #fff; font-size: 13px; line-height: 1.6; }
    .no-print { display: none !important; }
    article { margin-bottom: 32px; page-break-inside: avoid; }
    div[style*="max-width:1080px"] { padding: 24px 40px !important; }
    /* Keep section headers from orphaning at page bottom */
    div[style*="background:#0d0d0d"] { page-break-after: avoid; }
    /* Avoid breaking inside recap cards */
    div[style*="border-radius:6px"] { page-break-inside: avoid; }
    div[style*="border-radius:4px"] { page-break-inside: avoid; }
    /* Reduce header padding */
    header { padding: 20px !important; margin-bottom: 24px !important; }
    h1 { font-size: 26px !important; }
    h2 { font-size: 18px !important; }
    /* Force black text for score numbers */
    div[style*="font-size:26px"] { color: #000 !important; }
  }
</style>
</head>
<body>
  <div style="max-width:1080px;margin:0 auto;padding:56px 96px;background:#fff;min-height:100vh;">
    ${header}
    ${body}
    <footer style="margin-top:64px;padding-top:28px;border-top:2px solid #0d0d0d;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;">
        ${leagueBadge(40)}
        <div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d0d0d;">${esc(meta.leagueName)}</div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#9ca3af;margin-top:2px;">${esc(meta.date)} &nbsp;&middot;&nbsp; Season ${esc(String(meta.season))}</div>
        </div>
      </div>
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
      case 'PowerRankings': html = sectionPowerRankings(s.data); break;
      case 'SeasonPreview': html = sectionSeasonPreview(s.data); break;
      case 'DraftPreview': html = sectionDraftPreview(s.data); break;
      case 'DraftGrades': html = sectionDraftGrades(s.data); break;
      case 'MockDraft': html = sectionMockDraft(s.data); break;
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

import * as core from './template-core';
export * from './template-core';

import type { Newsletter, ForecastData } from './types';
import { TEAM_COLORS } from '@/lib/constants/team-colors';
import type {
  WeeklyTransactionsSection,
  IndependentPowerRankingsSection,
  IndependentRankingItem,
  LeaguePulseSection,
  StockWatchSection,
  ReceiptDeskSection,
} from './weekly-recap-types';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionHeader(title: string, subtitle?: string): string {
  return `<div style="margin:72px 0 28px;background:#0d0d0d;border-radius:6px;overflow:hidden;border-top:4px solid #be161e;padding:24px 32px;">
    <div style="font:700 10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:3px;text-transform:uppercase;color:#be161e;margin-bottom:8px;">East v. West</div>
    <h2 style="margin:0;font:700 30px Georgia,serif;color:#fff;">${esc(title)}</h2>
    ${subtitle ? `<div style="margin-top:8px;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:rgba(255,255,255,.55);">${esc(subtitle)}</div>` : ''}
  </div>`;
}

function voiceBlock(name: string, text?: string, clancy = false): string {
  if (!text?.trim()) return '';
  const color = clancy ? '#6b7280' : name.startsWith('Mason') ? '#be161e' : '#0b5f98';
  return `<div style="padding:20px 24px;margin:12px 0;background:#fff;border-left:4px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.06);">
    <div style="font:800 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.3px;text-transform:uppercase;color:${color};margin-bottom:10px;">${esc(name)}</div>
    <div style="font:16px/1.75 Georgia,serif;color:#374151;white-space:pre-wrap;">${esc(text)}</div>
  </div>`;
}

function teamColor(team: string): string {
  const direct = TEAM_COLORS[team];
  if (direct?.primary) return direct.primary;
  const key = Object.keys(TEAM_COLORS).find(name => name.toLowerCase() === team.toLowerCase());
  return key ? TEAM_COLORS[key].primary : '#374151';
}

function renderTransactions(data: WeeklyTransactionsSection): string {
  const cutoffLabel = data.cutoffIssueTitle ? `Since ${data.cutoffIssueTitle}` : `Since ${new Date(data.cutoff).toLocaleString()}`;
  const items = data.items.map(item => {
    const major = Boolean(item.mason || item.westy || item.major);
    return `<div style="margin:0 0 18px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <div style="padding:16px 20px;background:${major ? '#111827' : '#f9fafb'};color:${major ? '#fff' : '#111827'};">
        <div style="font:700 10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:${major ? '#fca5a5' : '#6b7280'};">${esc(item.kind.replace('_', ' '))} · ${esc(new Date(item.happenedAt).toLocaleString())}</div>
        <div style="margin-top:5px;font:700 18px Georgia,serif;">${esc(item.headline)}</div>
        <div style="margin-top:7px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${major ? 'rgba(255,255,255,.7)' : '#6b7280'};">${esc(item.detail)}</div>
      </div>
      ${major ? `<div style="padding:4px 0;">${voiceBlock('Mason Reed', item.mason)}${voiceBlock('Westy', item.westy)}</div>` : ''}
    </div>`;
  }).join('');
  return `<article>${sectionHeader('TRANSACTIONS SINCE THE LAST ISSUE', cutoffLabel)}${items || `<div style="padding:18px 22px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font:15px Georgia,serif;color:#4b5563;">${esc(data.note ?? 'No moves to report.')}</div>`}</article>`;
}

function movement(item: IndependentRankingItem): string {
  if (item.movement === 'new') return 'NEW';
  if (item.movement === 'same') return '—';
  return `${item.movement === 'up' ? '▲' : '▼'} ${item.movementAmount}`;
}

function rankingCard(item: IndependentRankingItem, speaker: 'Mason Reed' | 'Westy'): string {
  const color = speaker === 'Mason Reed' ? '#be161e' : '#0b5f98';
  const moveColor = item.movement === 'up' ? '#047857' : item.movement === 'down' ? '#b91c1c' : '#6b7280';
  return `<div style="display:grid;grid-template-columns:70px 1fr;gap:18px;margin:0 0 12px;background:#fff;border:1px solid #e5e7eb;border-left:5px solid ${color};padding:18px 20px;">
    <div>
      <div style="font:800 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${color};text-transform:uppercase;letter-spacing:1px;">${esc(speaker)}</div>
      <div style="font:800 32px Georgia,serif;color:#111827;">#${item.rank}</div>
      <div style="font:700 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${moveColor};">${esc(movement(item))}</div>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="width:9px;height:9px;border-radius:50%;background:${teamColor(item.team)};display:inline-block;"></span>
        <strong style="font:700 20px Georgia,serif;color:#111827;">${esc(item.team)}</strong>
        <span style="font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b7280;">${esc(item.record)} · ${item.pointsFor.toFixed(1)} PF</span>
      </div>
      <div style="font:15px/1.7 Georgia,serif;color:#374151;">${esc(item.blurb)}</div>
    </div>
  </div>`;
}

function renderPowerRankings(data: IndependentPowerRankingsSection): string {
  const interleaved: string[] = [];
  for (let rank = 1; rank <= 12; rank++) {
    const mason = data.masonRankings?.find(item => item.rank === rank);
    const westy = data.westyRankings?.find(item => item.rank === rank);
    if (mason) interleaved.push(rankingCard(mason, 'Mason Reed'));
    if (westy) interleaved.push(rankingCard(westy, 'Westy'));
  }
  return `<article>${sectionHeader('WEEKLY POWER RANKINGS', 'Independent lists, interleaved by rank')}
    ${voiceBlock('Mason Reed', data.bot1_intro)}${voiceBlock('Westy', data.bot2_intro)}
    <div style="margin-top:22px;">${interleaved.join('')}</div>
  </article>`;
}

function renderLeaguePulse(data: LeaguePulseSection): string {
  const rows = data.rows.map(row => `<tr>
    <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;">${row.rank}</td>
    <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${esc(row.team)}</td>
    <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}</td>
    <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${row.pointsFor.toFixed(1)}</td>
  </tr>`).join('');
  const race = data.showPlayoffRace && data.raceNote
    ? `<div style="margin-top:14px;padding:12px 16px;background:#f3f4f6;border-left:4px solid #be161e;font:13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#374151;">${esc(data.raceNote)}</div>`
    : `<div style="margin-top:12px;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b7280;">Early-season mode: standings only. The playoff race is not being forced before it is meaningful. Seven teams qualify and the #1 seed receives the first-round bye.</div>`;
  return `<article>${sectionHeader('LEAGUE PULSE', 'Compact standings and league-state check')}
    <div style="overflow:hidden;border:1px solid #e5e7eb;border-radius:6px;background:#fff;">
      <table style="width:100%;border-collapse:collapse;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#374151;">
        <thead><tr style="background:#111827;color:#fff;"><th style="padding:10px;text-align:left;">#</th><th style="padding:10px;text-align:left;">Team</th><th style="padding:10px;">W-L</th><th style="padding:10px;text-align:right;">PF</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>${race}
  </article>`;
}

function renderStockWatch(data: StockWatchSection): string {
  const items = data.items.map(item => `<div style="margin-bottom:16px;padding:18px 22px;background:#fff;border:1px solid #e5e7eb;border-left:5px solid ${item.direction === 'up' ? '#047857' : '#b91c1c'};">
    <div style="font:800 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1px;text-transform:uppercase;color:${item.direction === 'up' ? '#047857' : '#b91c1c'};">${item.direction === 'up' ? 'STOCK UP' : 'STOCK DOWN'} · ${esc(item.category.replace('_', ' '))}</div>
    <div style="margin-top:5px;font:700 20px Georgia,serif;color:#111827;">${esc(item.subject)}</div>
    <div style="margin-top:6px;font:14px/1.6 Georgia,serif;color:#4b5563;">${esc(item.evidence)}</div>
    ${voiceBlock('Mason Reed', item.mason)}${voiceBlock('Westy', item.westy)}
  </div>`).join('');
  return `<article>${sectionHeader('STOCK WATCH', 'Only where the evidence changed the evaluation')}${items || `<div style="padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;font:14px Georgia,serif;color:#4b5563;">${esc(data.note ?? 'No material stock changes this week.')}</div>`}</article>`;
}

function renderReceiptDesk(data: ReceiptDeskSection): string {
  const items = data.receipts.map(receipt => `<div style="margin-bottom:22px;background:#f9fafb;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;">
    <div style="padding:14px 18px;background:#374151;color:#fff;">
      <div style="font:800 10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#d1d5db;">${esc(receipt.receiptType.replace('_', ' '))} · ${esc(receipt.source.issueTitle ?? `Week ${receipt.source.week}`)}</div>
      <div style="margin-top:6px;font:13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">Source: ${esc(receipt.source.speaker)} · ${receipt.source.season} Week ${receipt.source.week}</div>
    </div>
    <div style="padding:16px 20px;">
      ${voiceBlock('Clancy', receipt.clancy, true)}
      ${voiceBlock('Mason Reed', receipt.masonResponse)}
      ${voiceBlock('Westy', receipt.westyResponse)}
    </div>
  </div>`).join('');
  return `<article>${sectionHeader("CLANCY'S RECEIPT DESK", 'Verified prior record only. Clancy surfaces the receipt; the writers answer for it.')}${items}</article>`;
}

function renderForecast(data: ForecastData): string {
  const picks = (data.picks ?? []) as Array<ForecastData['picks'][number] & { key_question?: string }>;
  const rows = picks.map(pick => `<div style="margin-bottom:18px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <div style="padding:14px 18px;background:#111827;color:#fff;font:700 18px Georgia,serif;">${esc(pick.team1)} vs ${esc(pick.team2)}</div>
    <div style="padding:16px 20px;">
      <div style="font:800 10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:#6b7280;">Key question</div>
      <div style="margin:5px 0 14px;font:15px/1.6 Georgia,serif;color:#374151;">${esc(pick.key_question ?? 'What matters most in this matchup?')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div style="padding:14px;border-left:4px solid #be161e;background:#f9fafb;"><strong style="color:#be161e;">MASON: ${esc(pick.bot1_pick)}</strong><div style="margin-top:6px;font:13px/1.55 Georgia,serif;color:#4b5563;">${esc(pick.note_bot1 ?? '')}</div></div>
        <div style="padding:14px;border-left:4px solid #0b5f98;background:#f9fafb;"><strong style="color:#0b5f98;">WESTY: ${esc(pick.bot2_pick)}</strong><div style="margin-top:6px;font:13px/1.55 Georgia,serif;color:#4b5563;">${esc(pick.note_bot2 ?? '')}</div></div>
      </div>
    </div>
  </div>`).join('');
  return `<article>${sectionHeader('UPCOMING MATCHUP PREVIEWS', `${picks.length} games · every matchup gets a pick`)}${picks}</article>`;
}

function customSectionHtml(section: { type: string; data: unknown }): string | null {
  switch (section.type) {
    case 'WeeklyTransactions': return renderTransactions(section.data as WeeklyTransactionsSection);
    case 'PowerRankings': {
      const data = section.data as IndependentPowerRankingsSection;
      if (data.masonRankings && data.westyRankings) return renderPowerRankings(data);
      return null;
    }
    case 'LeaguePulse': return renderLeaguePulse(section.data as LeaguePulseSection);
    case 'StockWatch': return renderStockWatch(section.data as StockWatchSection);
    case 'ReceiptDesk': return renderReceiptDesk(section.data as ReceiptDeskSection);
    case 'Forecast': return renderForecast(section.data as ForecastData);
    default: return null;
  }
}

export function renderNewsletterData(newsletter: Newsletter): {
  meta: Newsletter['meta'];
  htmlSections: Array<{ type: string; html: string }>;
} {
  if ((newsletter.meta.episodeType ?? 'regular') !== 'regular') return core.renderNewsletterData(newsletter);
  const sections = newsletter.sections as Array<{ type: string; data: unknown }>;
  return {
    meta: newsletter.meta,
    htmlSections: sections.map(section => {
      const custom = customSectionHtml(section);
      if (custom != null) return { type: section.type, html: custom };
      const single = { ...newsletter, sections: [section] as Newsletter['sections'] };
      const base = core.renderNewsletterData(single).htmlSections[0]?.html ?? '';
      return { type: section.type, html: base };
    }),
  };
}

export function renderHtml(newsletter: Newsletter): string {
  if ((newsletter.meta.episodeType ?? 'regular') !== 'regular') return core.renderHtml(newsletter);
  const rendered = renderNewsletterData(newsletter);
  const shell = core.renderHtml({ ...newsletter, sections: [] });
  const body = rendered.htmlSections.map(section => section.html).join('\n');
  const marker = '    <footer style=';
  return shell.includes(marker) ? shell.replace(marker, `${body}\n    <footer style=`) : shell;
}

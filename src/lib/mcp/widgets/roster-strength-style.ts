export const ROSTER_STRENGTH_STYLE = `
  #card{display:none}
  .summary-banner{background:var(--surface);border:1px solid var(--border);border-radius:8px 8px 0 0;border-bottom:none;padding:10px 14px}
  .summary-banner .team-name{font-size:15px;font-weight:700}
  .summary-banner .total{font-size:11px;color:var(--muted);margin-top:2px}
  .summary-banner .tags{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap}
  .tag{border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  .tag.strength{background:rgba(63,185,80,.15);color:var(--good)}
  .tag.weakness{background:rgba(248,81,73,.15);color:var(--bad)}
  .pos-bars{background:var(--surface);border-left:1px solid var(--border);border-right:1px solid var(--border);border-top:1px solid var(--border)}
  .pos-bar-row{padding:8px 14px;border-top:1px solid var(--border)}
  .pos-bar-row:first-child{border-top:none}
  .pos-bar-head{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px}
  .pos-bar-head .pos{font-weight:700}
  .pos-bar-head .val{color:var(--muted)}
  .pos-bar-track{background:var(--badge-bg);border-radius:4px;height:8px;overflow:hidden;margin-bottom:5px}
  .pos-bar-fill{height:100%;border-radius:4px;background:#58a6ff}
  .pos-players{display:flex;flex-wrap:wrap;gap:4px}
  .pos-player-chip{background:var(--badge-bg);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:10px;color:var(--text)}
  .pos-player-chip .nfl{color:var(--muted);margin-left:3px}
`;

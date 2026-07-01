export const DRAFT_BOARD_STYLE = `
  #card{display:none}
  .season-block{background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden}
  .season-block:last-child{margin-bottom:0}
  .season-head{padding:8px 14px;font-size:13px;font-weight:700;background:var(--badge-bg);border-bottom:1px solid var(--border)}
  .round-row{padding:8px 14px}
  .round-row+.round-row{border-top:1px solid var(--border)}
  .round-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px}
  .pick-chips{display:flex;flex-wrap:wrap;gap:5px}
  .pick-chip{background:var(--badge-bg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;color:var(--text)}
  .pick-chip .num{color:var(--muted);margin-right:4px}
  .pick-chip .team{color:#58a6ff;margin-right:4px}
  .pick-chip .pos{color:var(--muted);font-size:10px;margin-left:3px}
`;

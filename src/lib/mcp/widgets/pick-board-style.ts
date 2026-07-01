export const PICK_BOARD_STYLE = `
  #card{display:none}
  .board{background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
  .team-block{padding:10px 14px}
  .team-block+.team-block{border-top:1px solid var(--border)}
  .team-block-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
  .team-block-head .name{font-size:13px;font-weight:700;color:var(--text)}
  .team-block-head .counts{font-size:10px;color:var(--muted)}
  .pick-chips{display:flex;flex-wrap:wrap;gap:5px}
  .pick-chip{background:var(--badge-bg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;color:var(--text)}
  .pick-chip.traded{border-color:#58a6ff;color:#58a6ff}
`;

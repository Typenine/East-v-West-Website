export const TRADE_BLOCK_STYLE = `
  #card{display:none}
  .board{background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
  .team-block{padding:10px 14px}
  .team-block+.team-block{border-top:1px solid var(--border)}
  .team-block-head{font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px}
  .asset-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px}
  .asset-chip{background:var(--badge-bg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;color:var(--text);display:inline-flex;align-items:center;gap:4px}
  .asset-chip .pos{color:var(--muted);font-size:10px}
  .asset-chip.pick{border-color:#58a6ff;color:#58a6ff}
  .asset-chip.faab{border-color:var(--good);color:var(--good)}
  .wants{font-size:11px;color:var(--muted)}
  .wants b{color:var(--text);font-weight:600}
  .empty-block{font-size:11px;color:var(--muted);font-style:italic}
`;

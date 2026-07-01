export const FRANCHISE_CASE_STYLE = `
  #card{display:none}
  .rank-list{background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
  .rank-row{display:flex;align-items:center;gap:10px;padding:8px 14px}
  .rank-row+.rank-row{border-top:1px solid var(--border)}
  .rank-num{font-size:14px;font-weight:800;color:var(--muted);width:18px;text-align:center;flex-shrink:0}
  .rank-logo{width:32px;height:32px;object-fit:contain;background:rgba(255,255,255,.06);border-radius:6px;padding:3px;flex-shrink:0}
  .rank-logo.hidden{display:none}
  .rank-body{flex:1;min-width:0}
  .rank-name{font-size:13px;font-weight:700;color:var(--text)}
  .rank-stats{font-size:10px;color:var(--muted);margin-top:2px}
  .rank-trophies{font-size:12px;white-space:nowrap;text-align:right;flex-shrink:0}
  .rank-trophies .champs{color:#e3b341}
  .rank-trophies .runners{color:var(--muted);font-size:10px;display:block;margin-top:1px}
`;

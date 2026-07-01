export const TEAM_COMPARE_STYLE = `
  #card{display:none}
  .headers{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-radius:8px 8px 0 0;overflow:hidden}
  .team-head{display:flex;align-items:center;gap:8px;padding:10px 12px}
  .team-head img{width:36px;height:36px;object-fit:contain;background:rgba(255,255,255,.1);border-radius:6px;padding:3px;flex-shrink:0}
  .team-head img.hidden{display:none}
  .team-head .name{font-size:13px;font-weight:700;color:#fff;line-height:1.2}
  .cmp-table{background:var(--surface);border-left:1px solid var(--border);border-right:1px solid var(--border)}
  .cmp-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;padding:6px 12px;border-top:1px solid var(--border);font-size:12px}
  .cmp-row:first-child{border-top:none}
  .cmp-val{font-weight:600;color:var(--text)}
  .cmp-val.win{color:var(--good)}
  .cmp-val.left{text-align:left}
  .cmp-val.right{text-align:right}
  .cmp-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;text-align:center;white-space:nowrap}
  .section{background:var(--surface);border-left:1px solid var(--border);border-right:1px solid var(--border);padding:8px 12px;border-top:1px solid var(--border)}
  .section:last-child{border-radius:0 0 8px 8px}
  .section-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px}
  .pos-rooms{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .pos-list .pos-row{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;color:var(--text)}
  .pos-list .pos-row .cnt{color:var(--muted)}
`;

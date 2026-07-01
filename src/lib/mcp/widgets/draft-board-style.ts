export const DRAFT_BOARD_STYLE = `
  .draft-body{padding:14px}
  .season-block{overflow:hidden;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(10,23,40,.96))}
  .season-block+.season-block{margin-top:10px}
  .season-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 13px;border-bottom:1px solid var(--border);background:linear-gradient(90deg,var(--blue-soft),var(--red-soft))}
  .season-title{font-size:14px;font-weight:900;color:var(--text-cool)}
  .season-count{font-size:9px;color:var(--muted)}
  .round-section+.round-section{border-top:1px solid var(--border)}
  .round-label{padding:8px 12px;background:rgba(7,17,31,.45);font-size:9px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .draft-table{min-width:560px}
  .draft-head,.draft-row{display:grid;grid-template-columns:58px minmax(150px,.9fr) minmax(180px,1.1fr);gap:10px;align-items:center;padding:8px 12px}
  .draft-head{font-size:8px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);background:rgba(255,255,255,.018)}
  .draft-row{min-height:50px;border-top:1px solid rgba(158,178,207,.11)}
  .pick-number{display:inline-flex;align-items:center;justify-content:center;width:42px;height:28px;border:1px solid rgba(79,140,255,.3);border-radius:8px;background:var(--blue-soft);color:#a9c4ff;font-size:11px;font-weight:900}
  .draft-team{display:flex;align-items:center;gap:8px;min-width:0}
  .draft-team .team-logo-frame{width:31px;height:31px;border-radius:8px}
  .draft-team-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:750;color:var(--text)}
  .selection{min-width:0}
  .selection-name{font-size:11px;font-weight:800;color:var(--text-cool)}
  .selection-meta{margin-top:2px;font-size:9px;color:var(--muted)}
  .selection.unselected .selection-name{color:var(--muted);font-style:italic;font-weight:600}
  @media (max-width:620px){.draft-body{padding:10px}.season-head{padding:10px}.draft-head,.draft-row{grid-template-columns:52px minmax(140px,.9fr) minmax(170px,1.1fr)}}
`;

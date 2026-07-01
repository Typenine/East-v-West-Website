export const PICK_BOARD_STYLE = `
  .pick-body{padding:14px}
  .year-section{overflow:hidden;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(10,23,40,.96))}
  .year-section+.year-section{margin-top:10px}
  .year-head{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;border-bottom:1px solid var(--border);background:linear-gradient(90deg,var(--blue-soft),var(--red-soft))}
  .year-title{font-size:14px;font-weight:900;color:var(--text-cool)}
  .year-count{font-size:9px;color:var(--muted)}
  .team-pick-row{display:grid;grid-template-columns:minmax(150px,.85fr) minmax(0,1.7fr);gap:12px;align-items:start;padding:10px 12px}
  .team-pick-row+.team-pick-row{border-top:1px solid var(--border)}
  .pick-team{display:flex;align-items:center;gap:8px;min-width:0}
  .pick-team .team-logo-frame{width:34px;height:34px;border-radius:8px}
  .pick-team-name{font-size:10px;font-weight:800;color:var(--text-cool)}
  .pick-team-meta{margin-top:2px;font-size:8px;color:var(--muted)}
  .pick-chips{display:flex;flex-wrap:wrap;gap:6px}
  .pick-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid var(--border);border-radius:7px;background:rgba(7,17,31,.48);font-size:10px;color:var(--text)}
  .pick-chip .round{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:20px;border-radius:6px;background:var(--surface-3);font-size:8px;font-weight:900;color:#b8c9e4}
  .pick-chip.acquired{border-color:rgba(79,140,255,.36);background:var(--blue-soft);color:#b8ceff}
  .pick-chip.acquired .round{background:rgba(79,140,255,.24);color:#c8d8ff}
  .via{font-size:8px;color:var(--muted)}
  @media (max-width:620px){.team-pick-row{grid-template-columns:1fr;gap:8px}.pick-team-meta{display:none}}
`;

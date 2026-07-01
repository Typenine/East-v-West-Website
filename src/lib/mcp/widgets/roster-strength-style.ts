export const ROSTER_STRENGTH_STYLE = `
  .roster-body{padding:14px}
  .roster-hero{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid var(--border);border-radius:11px;background:linear-gradient(135deg,var(--blue-soft),rgba(231,79,95,.08));margin-bottom:10px}
  .roster-hero .team-logo-frame{width:58px;height:58px}
  .roster-team{font-size:18px;font-weight:900;letter-spacing:-.03em;color:var(--text-cool)}
  .roster-sub{margin-top:4px;font-size:9px;color:var(--muted)}
  .total-value{text-align:right}
  .total-value .num{font-size:22px;font-weight:900;color:var(--text-cool)}
  .total-value .label{margin-top:3px;font-size:8px;font-weight:850;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .profile-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
  .tag{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--border);border-radius:999px;font-size:9px;font-weight:800}
  .tag.strength{border-color:rgba(71,201,133,.32);background:var(--good-soft);color:#8ee2b3}
  .tag.weakness{border-color:rgba(255,112,120,.3);background:var(--bad-soft);color:#ff9da3}
  .position-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .position-card{padding:12px;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(10,23,40,.96))}
  .position-head{display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:8px}
  .position-name{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:900;color:var(--text-cool)}
  .position-name .badge{display:flex;align-items:center;justify-content:center;width:32px;height:28px;border-radius:8px;background:var(--blue-soft);color:#a9c3ff;font-size:10px;font-weight:900}
  .position-status{padding:4px 7px;border-radius:999px;font-size:8px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
  .position-status.strong{background:var(--good-soft);color:#8ee2b3}
  .position-status.need{background:var(--bad-soft);color:#ff9da3}
  .position-status.stable{background:rgba(147,163,187,.12);color:var(--muted)}
  .position-value{font-size:10px;color:var(--muted)}
  .position-value strong{font-size:13px;color:var(--text-cool)}
  .strength-track{height:8px;margin:8px 0;border-radius:999px;background:rgba(7,17,31,.7);overflow:hidden}
  .strength-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--blue),#79a8ff)}
  .player-stack{display:grid;gap:5px}
  .player-row{display:flex;justify-content:space-between;gap:8px;padding:6px 7px;border:1px solid rgba(158,178,207,.12);border-radius:7px;background:rgba(7,17,31,.42);font-size:9px}
  .player-row .name{font-weight:750;color:var(--text)}
  .player-row .meta{color:var(--muted)}
  .player-row .value{font-weight:800;color:var(--text-cool)}
  @media (max-width:620px){
    .roster-hero{grid-template-columns:auto 1fr}
    .total-value{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;text-align:left;padding-top:9px;border-top:1px solid var(--border)}
    .position-grid{grid-template-columns:1fr}
  }
`;

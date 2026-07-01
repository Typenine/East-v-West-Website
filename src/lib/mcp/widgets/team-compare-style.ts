export const TEAM_COMPARE_STYLE = `
  .compare-body{padding:14px}
  .matchup-hero{display:grid;grid-template-columns:1fr 54px 1fr;gap:10px;align-items:stretch;margin-bottom:10px}
  .team-side{position:relative;overflow:hidden;display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:center;min-height:104px;padding:14px;border:1px solid var(--border);border-radius:11px;color:#fff}
  .team-side::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,rgba(3,10,20,.02),rgba(3,10,20,.5));pointer-events:none}
  .team-side>*{position:relative;z-index:1}
  .team-side .team-logo-frame{width:58px;height:58px}
  .team-side .name{font-size:17px;font-weight:900;line-height:1.05;letter-spacing:-.025em}
  .team-side .record{margin-top:5px;font-size:10px;color:rgba(255,255,255,.75)}
  .versus{display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
  .metrics-panel{overflow:hidden;margin-bottom:10px}
  .metric-row{display:grid;grid-template-columns:1fr 110px 1fr;gap:10px;align-items:center;padding:9px 12px}
  .metric-row+.metric-row{border-top:1px solid var(--border)}
  .metric-value{padding:6px 8px;border-radius:7px;font-size:12px;font-weight:800;color:var(--text-cool)}
  .metric-value.left{text-align:left}.metric-value.right{text-align:right}
  .metric-value.win{background:var(--good-soft);color:#86e5af}
  .metric-label{text-align:center;color:var(--muted);font-size:8px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
  .room-panel{padding:12px;margin-bottom:10px}
  .room-table{overflow:hidden;border:1px solid var(--border);border-radius:9px}
  .room-row{display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);gap:8px;align-items:start;padding:8px 10px;background:rgba(7,17,31,.34)}
  .room-row+.room-row{border-top:1px solid var(--border)}
  .room-pos{display:flex;align-items:center;justify-content:center;min-height:24px;border-radius:7px;background:var(--blue-soft);color:#9ebdff;font-size:9px;font-weight:900}
  .room-players{display:flex;flex-wrap:wrap;gap:4px}
  .room-players.right{justify-content:flex-end}
  .player-pill{padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:rgba(21,38,64,.75);color:var(--text);font-size:9px}
  .reserve-panel{padding:12px}
  @media (max-width:620px){
    .matchup-hero{grid-template-columns:1fr 34px 1fr;gap:6px}
    .team-side{grid-template-columns:1fr;text-align:center;justify-items:center;min-height:128px;padding:11px}
    .team-side .team-logo-frame{width:48px;height:48px}
    .team-side .name{font-size:14px}
    .metric-row{grid-template-columns:1fr 80px 1fr;gap:6px;padding:8px}
    .metric-value{font-size:10px}
    .room-row{grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr);padding:7px}
  }
`;

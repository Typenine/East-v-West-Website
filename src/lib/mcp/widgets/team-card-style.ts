export const TEAM_CARD_STYLE = `
  .team-hero{
    position:relative;
    display:grid;
    grid-template-columns:auto 1fr auto;
    align-items:center;
    gap:14px;
    min-height:118px;
    padding:18px;
    overflow:hidden;
  }
  .team-hero::after{
    content:'';
    position:absolute;
    inset:0;
    background:linear-gradient(90deg,rgba(4,10,20,.05),rgba(4,10,20,.46));
    pointer-events:none;
  }
  .team-hero>*{position:relative;z-index:1}
  .team-hero .team-logo-frame{width:74px;height:74px;border-radius:14px}
  .team-identity{min-width:0}
  .team-identity .league-line{font-size:9px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.7)}
  .team-identity h1{margin-top:3px;font-size:24px;line-height:1.05;font-weight:900;letter-spacing:-.035em;color:#fff}
  .team-identity .subline{margin-top:6px;font-size:10px;color:rgba(255,255,255,.72)}
  .record-lockup{text-align:right}
  .record-lockup .record{font-size:24px;font-weight:900;line-height:1;color:#fff}
  .record-lockup .season{margin-top:5px;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.7)}
  .team-card-body{padding:14px}
  .stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}
  .stat-tile{padding:11px 10px;border:1px solid var(--border);border-radius:10px;background:linear-gradient(180deg,var(--surface-2),rgba(14,28,47,.95));text-align:center}
  .stat-tile .value{font-size:18px;font-weight:850;color:var(--text-cool);letter-spacing:-.02em}
  .stat-tile .label{margin-top:3px;font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .team-card-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(210px,.8fr);gap:10px;align-items:start}
  .roster-panel,.side-panel{padding:12px}
  .side-stack{display:grid;gap:10px}
  .roster-section+.roster-section{margin-top:12px;padding-top:11px;border-top:1px solid var(--border)}
  .roster-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .roster-section-title strong{font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:var(--text-cool)}
  .roster-section-title span{font-size:9px;color:var(--muted)}
  .pos-group{display:grid;grid-template-columns:34px 1fr;gap:8px;align-items:start;padding:6px 0}
  .pos-group+.pos-group{border-top:1px solid rgba(158,178,207,.1)}
  .pos-label{display:inline-flex;align-items:center;justify-content:center;min-height:24px;border:1px solid rgba(79,140,255,.3);border-radius:7px;background:var(--blue-soft);color:#9bbcff;font-size:9px;font-weight:900;letter-spacing:.06em}
  .player-list{display:flex;flex-wrap:wrap;gap:5px}
  .player-chip{display:inline-flex;align-items:center;gap:5px;min-height:24px;padding:3px 7px;border:1px solid var(--border);border-radius:7px;background:rgba(7,17,31,.5);color:var(--text);font-size:10px}
  .player-chip .nfl{color:var(--muted);font-size:9px}
  .status-dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
  .s-out{background:var(--bad);box-shadow:0 0 0 3px var(--bad-soft)}
  .s-q{background:var(--warn);box-shadow:0 0 0 3px var(--warn-soft)}
  .s-ir{background:var(--gold);box-shadow:0 0 0 3px var(--gold-soft)}
  .s-other{background:var(--muted)}
  .trophy-list{display:flex;flex-wrap:wrap;gap:6px}
  .trophy-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid rgba(232,185,87,.35);border-radius:8px;background:var(--gold-soft);color:#f4cd7a;font-size:10px;font-weight:750}
  .trophy-badge svg{width:13px;height:13px;fill:currentColor}
  .reserve-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
  .reserve-tile{padding:10px;border:1px solid var(--border);border-radius:9px;background:rgba(7,17,31,.45)}
  .reserve-tile .num{font-size:19px;font-weight:850;color:var(--text-cool)}
  .reserve-tile .type{margin-top:2px;font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .empty-note{font-size:10px;color:var(--muted)}
  @media (max-width:720px){
    .team-card-grid{grid-template-columns:1fr}
    .side-stack{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media (max-width:520px){
    .team-hero{grid-template-columns:auto 1fr;min-height:104px;padding:14px;gap:11px}
    .team-hero .team-logo-frame{width:60px;height:60px}
    .team-identity h1{font-size:19px}
    .record-lockup{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;text-align:left;padding-top:10px;border-top:1px solid rgba(255,255,255,.16)}
    .record-lockup .record{font-size:20px}
    .stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    .side-stack{grid-template-columns:1fr}
    .pos-group{grid-template-columns:30px 1fr}
  }
`;

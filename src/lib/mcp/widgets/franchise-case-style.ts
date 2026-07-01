export const FRANCHISE_CASE_STYLE = `
  .franchise-body{padding:14px}
  .podium{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;align-items:end;margin-bottom:10px}
  .podium-card{position:relative;overflow:hidden;padding:13px 10px 11px;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(11,24,42,.96));text-align:center}
  .podium-card.first{min-height:170px;border-color:rgba(232,185,87,.42);background:linear-gradient(180deg,rgba(232,185,87,.12),rgba(11,24,42,.98))}
  .podium-card.second{min-height:154px;border-color:rgba(194,204,218,.34)}
  .podium-card.third{min-height:146px;border-color:rgba(196,126,83,.34)}
  .rank-crown{position:absolute;top:7px;left:8px;display:flex;align-items:center;justify-content:center;width:23px;height:23px;border-radius:7px;background:rgba(7,17,31,.55);font-size:9px;font-weight:900;color:var(--muted)}
  .podium-card.first .rank-crown{color:var(--gold);background:var(--gold-soft)}
  .podium-card .team-logo-frame{width:58px;height:58px;margin:13px auto 8px}
  .podium-name{font-size:11px;font-weight:850;line-height:1.15;color:var(--text-cool)}
  .podium-record{margin-top:5px;font-size:9px;color:var(--muted)}
  .trophy-count{display:inline-flex;align-items:center;gap:5px;margin-top:9px;padding:4px 7px;border-radius:7px;background:var(--gold-soft);color:#f4cc76;font-size:10px;font-weight:850}
  .trophy-count svg{width:13px;height:13px;fill:currentColor}
  .runner-up{margin-top:5px;font-size:8px;color:var(--silver)}
  .rank-list{overflow:hidden;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(10,23,40,.96))}
  .rank-row{display:grid;grid-template-columns:28px auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 11px}
  .rank-row+.rank-row{border-top:1px solid var(--border)}
  .rank-num{font-size:11px;font-weight:900;color:var(--muted);text-align:center}
  .rank-row .team-logo-frame{width:34px;height:34px;border-radius:8px}
  .rank-name{font-size:10px;font-weight:800;color:var(--text-cool)}
  .rank-stats{margin-top:2px;font-size:8px;color:var(--muted)}
  .rank-achievements{text-align:right}
  .rank-achievements .titles{font-size:10px;font-weight:850;color:var(--gold)}
  .rank-achievements .seconds{margin-top:2px;font-size:8px;color:var(--silver)}
  @media (max-width:620px){
    .podium{grid-template-columns:1fr}
    .podium-card,.podium-card.first,.podium-card.second,.podium-card.third{min-height:0;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;text-align:left}
    .podium-card .team-logo-frame{width:46px;height:46px;margin:0}
    .rank-crown{position:static}
    .trophy-count{margin-top:0}
  }
`;

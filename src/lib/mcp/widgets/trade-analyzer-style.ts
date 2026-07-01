export const TRADE_ANALYZER_STYLE = `
  .trade-body{padding:14px}
  .verdict-card{padding:14px;border:1px solid var(--border);border-radius:11px;background:linear-gradient(135deg,rgba(79,140,255,.13),rgba(231,79,95,.1));text-align:center}
  .verdict-card .eyebrow{font-size:9px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .verdict-card .verdict{margin-top:4px;font-size:22px;font-weight:900;letter-spacing:-.035em;color:var(--text-cool)}
  .verdict-card .sub{margin-top:4px;font-size:10px;color:var(--muted)}
  .balance-wrap{margin:12px 0;padding:11px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(7,17,31,.45)}
  .balance-labels{display:flex;justify-content:space-between;margin-bottom:7px;font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .balance-track{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,var(--blue) 0%,rgba(238,244,255,.8) 50%,var(--red) 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
  .balance-track::after{content:'';position:absolute;left:50%;top:-4px;width:1px;height:18px;background:rgba(255,255,255,.7)}
  .balance-marker{position:absolute;top:50%;width:18px;height:18px;border:3px solid var(--text-cool);border-radius:50%;background:var(--surface);box-shadow:0 3px 10px rgba(0,0,0,.45);transform:translate(-50%,-50%)}
  .trade-sides{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .trade-side{overflow:hidden;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(12,25,43,.96))}
  .trade-side.side-a{border-top:3px solid var(--blue)}
  .trade-side.side-b{border-top:3px solid var(--red)}
  .side-summary{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start;padding:12px;border-bottom:1px solid var(--border)}
  .side-label{font-size:9px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .side-total{margin-top:3px;font-size:22px;font-weight:900;line-height:1;color:var(--text-cool)}
  .side-sub{margin-top:5px;font-size:9px;color:var(--muted)}
  .grade-badge{display:flex;align-items:center;justify-content:center;min-width:42px;height:42px;border:1px solid var(--border);border-radius:10px;background:rgba(7,17,31,.58);font-size:18px;font-weight:900}
  .grade-A{color:var(--good)}.grade-B{color:#79a9ff}.grade-C{color:var(--warn)}.grade-D{color:#ff956f}.grade-F{color:var(--bad)}.grade-none{color:var(--muted)}
  .asset-list{padding:6px 12px 10px}
  .asset-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 0}
  .asset-row+.asset-row{border-top:1px solid rgba(158,178,207,.12)}
  .asset-name{font-size:11px;font-weight:750;color:var(--text)}
  .asset-meta{margin-top:2px;font-size:9px;color:var(--muted)}
  .asset-value{text-align:right;font-size:11px;font-weight:800;color:var(--text-cool)}
  .trend-up{color:var(--good)}.trend-down{color:var(--bad)}
  .analysis-notes{display:grid;gap:7px;margin-top:10px}
  .note-card{padding:9px 11px;border:1px solid var(--border);border-radius:9px;background:rgba(7,17,31,.45);font-size:10px;color:var(--muted)}
  .counter-card{border-color:rgba(243,170,78,.3);background:var(--warn-soft);color:#f4bf77}
  .unmatched{margin-top:10px;padding:9px 11px;border:1px solid rgba(255,112,120,.3);border-radius:9px;background:var(--bad-soft);font-size:10px;color:#ff9da2}
  @media (max-width:560px){
    .trade-sides{grid-template-columns:1fr}
    .verdict-card .verdict{font-size:19px}
  }
`;

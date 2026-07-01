export const TRADE_BLOCK_STYLE = `
  .trade-block-body{padding:14px}
  .summary-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(7,17,31,.45)}
  .summary-bar strong{font-size:11px;color:var(--text-cool)}
  .summary-bar span{font-size:9px;color:var(--muted)}
  .team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .team-card{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:11px;background:linear-gradient(180deg,var(--surface-2),rgba(11,24,42,.96))}
  .team-card::before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:var(--team-accent,var(--blue))}
  .team-card-head{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:13px 12px 10px}
  .team-card-head .team-logo-frame{width:42px;height:42px}
  .team-name{font-size:13px;font-weight:850;line-height:1.1;color:var(--text-cool)}
  .team-count{margin-top:3px;font-size:9px;color:var(--muted)}
  .updated{font-size:8px;color:var(--muted);text-align:right}
  .card-section{padding:10px 12px;border-top:1px solid var(--border)}
  .asset-chips{display:flex;flex-wrap:wrap;gap:6px}
  .asset-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid var(--border);border-radius:7px;background:rgba(7,17,31,.5);font-size:10px;color:var(--text)}
  .asset-chip .asset-type{font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .asset-chip.pick{border-color:rgba(79,140,255,.34);background:var(--blue-soft);color:#b5ccff}
  .asset-chip.faab{border-color:rgba(71,201,133,.34);background:var(--good-soft);color:#91e6b6}
  .asset-chip.player .asset-type{color:#9fb4d3}
  .wants-box{display:grid;gap:5px;padding:9px 10px;border:1px solid rgba(243,170,78,.25);border-radius:8px;background:var(--warn-soft)}
  .wants-line{font-size:10px;color:#efc486}
  .wants-line strong{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#f4b764;margin-right:5px}
  .empty-block{font-size:10px;color:var(--muted);font-style:italic}
  @media (max-width:620px){.team-grid{grid-template-columns:1fr}}
`;

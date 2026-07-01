export const TRADE_ANALYZER_STYLE = `
  #card{display:none}
  .verdict-banner{padding:10px 14px;border-radius:8px 8px 0 0;text-align:center;background:var(--surface);border:1px solid var(--border);border-bottom:none}
  .verdict-banner .verdict{font-size:16px;font-weight:700}
  .verdict-banner .sub{font-size:11px;color:var(--muted);margin-top:2px}
  .sides{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-left:1px solid var(--border);border-right:1px solid var(--border)}
  .side{background:var(--surface);padding:10px 12px}
  .side-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
  .side-head .label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  .side-head .grade{font-size:16px;font-weight:800}
  .grade-A{color:var(--good)}.grade-B{color:#58a6ff}.grade-C{color:var(--warn)}.grade-D{color:#ff9d5c}.grade-F{color:var(--bad)}.grade-none{color:var(--muted)}
  .value-bar-track{background:var(--badge-bg);border-radius:4px;height:8px;overflow:hidden;margin-bottom:8px}
  .value-bar-fill{height:100%;border-radius:4px}
  .value-bar-fill.a{background:#58a6ff}.value-bar-fill.b{background:#f0883e}
  .value-total{font-size:15px;font-weight:700;margin-bottom:2px}
  .value-sub{font-size:10px;color:var(--muted);margin-bottom:8px}
  .asset-row{display:flex;justify-content:space-between;gap:6px;padding:3px 0;border-top:1px solid var(--border);font-size:11px}
  .asset-row:first-of-type{border-top:none}
  .asset-name{color:var(--text)}
  .asset-meta{color:var(--muted);font-size:10px}
  .asset-val{color:var(--text);font-weight:600;white-space:nowrap}
  .notes{background:var(--surface);border-left:1px solid var(--border);border-right:1px solid var(--border);border-top:1px solid var(--border);padding:8px 14px;font-size:11px;color:var(--muted)}
  .notes .note{margin-bottom:3px}
  .notes .counter{color:var(--warn);margin-top:4px}
  .unmatched{background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;padding:8px 14px;font-size:11px;color:var(--bad)}
`;

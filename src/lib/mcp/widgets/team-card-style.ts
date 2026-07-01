export const TEAM_CARD_STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--primary:#3b5b8b;--secondary:#ba1010;--badge-bg:#21262d;--ir:#e3b341;--out:#f85149;--q:#d29922}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);font-size:13px;line-height:1.5;padding:12px;min-height:100vh}
  #state-loading,#state-error,#state-empty{display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:14px;text-align:center}
  #state-error{color:#f85149} #card{display:none}
  .card-header{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:8px 8px 0 0;background:linear-gradient(135deg,var(--primary) 0%,var(--secondary) 100%)}
  .card-header img{width:52px;height:52px;object-fit:contain;background:rgba(255,255,255,.1);border-radius:6px;padding:4px;flex-shrink:0}
  .card-header img.hidden{display:none}
  .header-text h1{font-size:17px;font-weight:700;color:#fff;line-height:1.2}
  .header-text .subtitle{font-size:11px;color:rgba(255,255,255,.75);margin-top:2px}
  .stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:1px;background:var(--border);border-left:1px solid var(--border);border-right:1px solid var(--border)}
  .stat-box{background:var(--surface);padding:8px 10px;text-align:center}
  .stat-box .val{font-size:18px;font-weight:700;color:var(--text)}
  .stat-box .lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:1px}
  .section{background:var(--surface);border-left:1px solid var(--border);border-right:1px solid var(--border);padding:10px 14px}
  .section+.section{border-top:1px solid var(--border)}
  .section:last-child{border-radius:0 0 8px 8px;border-bottom:1px solid var(--border)}
  .section-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:7px}
  .champ-list{display:flex;flex-wrap:wrap;gap:4px}
  .champ-badge{background:var(--badge-bg);border:1px solid #bf9944;color:#bf9944;border-radius:4px;font-size:11px;font-weight:600;padding:2px 7px}
  .pos-group{margin-bottom:8px}.pos-group:last-child{margin-bottom:0}
  .pos-label{display:inline-block;font-size:10px;font-weight:700;background:var(--badge-bg);border:1px solid var(--border);border-radius:3px;padding:1px 5px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
  .player-list{display:flex;flex-wrap:wrap;gap:4px}
  .player-chip{background:var(--badge-bg);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text);display:inline-flex;align-items:center;gap:4px}
  .player-chip .nfl{color:var(--muted);font-size:10px}
  .status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}.s-out{background:var(--out)}.s-q{background:var(--q)}.s-ir{background:var(--ir)}.s-other{background:var(--muted)}
  .slot-counts{display:flex;gap:10px}.slot-pill{background:var(--badge-bg);border:1px solid var(--border);border-radius:4px;padding:3px 9px;font-size:12px}.slot-pill .num{font-weight:700}.slot-pill .type{color:var(--muted);margin-left:4px;font-size:11px}
  .freshness{border-top:1px solid var(--border);padding:6px 14px;font-size:10px;color:var(--muted);text-align:right;background:var(--surface);border-radius:0 0 8px 8px}
`;

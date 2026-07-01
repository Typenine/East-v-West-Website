export const WIDGET_BASE_STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--badge-bg:#21262d;--good:#3fb950;--bad:#f85149;--warn:#d29922}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);font-size:13px;line-height:1.5;padding:12px;min-height:100vh}
  #state-loading,#state-error,#state-empty{display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:14px;text-align:center}
  #state-error{color:var(--bad)}
  .freshness{border-top:1px solid var(--border);padding:6px 14px;font-size:10px;color:var(--muted);text-align:right;background:var(--surface);border-radius:0 0 8px 8px}
`;

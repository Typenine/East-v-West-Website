export const WIDGET_BASE_STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    color-scheme:dark;
    --bg:#07111f;
    --bg-soft:#0b1728;
    --surface:#101d30;
    --surface-2:#152640;
    --surface-3:#1b3150;
    --border:rgba(158,178,207,.18);
    --border-strong:rgba(158,178,207,.34);
    --text:#f7f2e8;
    --text-cool:#eef4ff;
    --muted:#93a3bb;
    --blue:#4f8cff;
    --blue-soft:rgba(79,140,255,.16);
    --red:#e74f5f;
    --red-soft:rgba(231,79,95,.16);
    --gold:#e8b957;
    --gold-soft:rgba(232,185,87,.15);
    --silver:#c2ccda;
    --good:#47c985;
    --good-soft:rgba(71,201,133,.15);
    --bad:#ff7078;
    --bad-soft:rgba(255,112,120,.15);
    --warn:#f3aa4e;
    --warn-soft:rgba(243,170,78,.15);
    --shadow:0 18px 48px rgba(0,0,0,.32);
  }
  html{background:var(--bg)}
  body{
    min-height:100vh;
    padding:12px;
    overflow-x:hidden;
    background:
      radial-gradient(circle at 8% 0%,rgba(79,140,255,.13),transparent 30%),
      radial-gradient(circle at 92% 4%,rgba(231,79,95,.11),transparent 28%),
      linear-gradient(180deg,var(--bg-soft),var(--bg));
    color:var(--text);
    font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    font-size:13px;
    line-height:1.45;
  }
  button,input,select,textarea{font:inherit}
  #state-loading,#state-error,#state-empty{
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:160px;
    padding:24px;
    color:var(--muted);
    font-size:13px;
    text-align:center;
    border:1px solid var(--border);
    border-radius:14px;
    background:rgba(16,29,48,.72);
    box-shadow:var(--shadow);
  }
  #state-loading::before{
    content:'';
    width:14px;
    height:14px;
    margin-right:9px;
    border:2px solid rgba(147,163,187,.35);
    border-top-color:var(--blue);
    border-radius:50%;
    animation:widget-spin .8s linear infinite;
  }
  #state-error{color:var(--bad);border-color:rgba(255,112,120,.3)}
  #card{display:none}
  .widget-shell{
    position:relative;
    overflow:hidden;
    border:1px solid var(--border-strong);
    border-radius:14px;
    background:linear-gradient(180deg,rgba(16,29,48,.98),rgba(8,19,34,.98));
    box-shadow:var(--shadow);
  }
  .widget-shell::before{
    content:'';
    position:absolute;
    inset:0 0 auto;
    height:3px;
    background:linear-gradient(90deg,var(--blue) 0 47%,rgba(255,255,255,.9) 47% 53%,var(--red) 53% 100%);
    z-index:2;
  }
  .widget-topline{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:16px;
    padding:18px 18px 14px;
    border-bottom:1px solid var(--border);
    background:linear-gradient(180deg,rgba(255,255,255,.025),transparent);
  }
  .league-lockup{display:flex;align-items:center;gap:10px;min-width:0}
  .league-mark{
    display:grid;
    grid-template-columns:1fr 1fr;
    width:28px;
    height:28px;
    overflow:hidden;
    border:1px solid rgba(255,255,255,.18);
    border-radius:8px;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.16);
    flex:0 0 auto;
  }
  .league-mark span:first-child{background:linear-gradient(135deg,#6ea1ff,var(--blue))}
  .league-mark span:last-child{background:linear-gradient(135deg,var(--red),#bd3042)}
  .widget-eyebrow{
    color:var(--muted);
    font-size:9px;
    font-weight:800;
    letter-spacing:.16em;
    text-transform:uppercase;
  }
  .widget-title{
    margin-top:2px;
    color:var(--text-cool);
    font-size:17px;
    font-weight:850;
    line-height:1.12;
    letter-spacing:-.02em;
  }
  .widget-subtitle{margin-top:4px;color:var(--muted);font-size:10px}
  .status-pill{
    display:inline-flex;
    align-items:center;
    gap:6px;
    flex:0 0 auto;
    padding:5px 8px;
    border:1px solid var(--border);
    border-radius:999px;
    background:rgba(255,255,255,.035);
    color:var(--muted);
    font-size:9px;
    font-weight:750;
    letter-spacing:.08em;
    text-transform:uppercase;
  }
  .status-pill .pulse{
    width:6px;
    height:6px;
    border-radius:50%;
    background:var(--good);
    box-shadow:0 0 0 4px rgba(71,201,133,.12);
  }
  .widget-body{padding:14px}
  .panel{
    border:1px solid var(--border);
    border-radius:11px;
    background:linear-gradient(180deg,rgba(21,38,64,.92),rgba(13,27,46,.92));
  }
  .section-heading{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    margin-bottom:8px;
  }
  .section-kicker{
    color:var(--muted);
    font-size:9px;
    font-weight:800;
    letter-spacing:.12em;
    text-transform:uppercase;
  }
  .section-meta{color:var(--muted);font-size:9px}
  .team-logo-frame{
    display:flex;
    align-items:center;
    justify-content:center;
    overflow:hidden;
    border:1px solid rgba(255,255,255,.16);
    border-radius:10px;
    background:rgba(255,255,255,.08);
    box-shadow:inset 0 0 18px rgba(255,255,255,.035);
  }
  .team-logo-frame img{width:100%;height:100%;object-fit:contain;padding:5px}
  img.hidden{display:none!important}
  .freshness{
    padding:8px 14px 10px;
    color:var(--muted);
    font-size:9px;
    text-align:right;
    border-top:1px solid var(--border);
    background:rgba(7,17,31,.5);
  }
  .muted{color:var(--muted)}
  .scroll-x{overflow-x:auto;scrollbar-width:thin}
  @keyframes widget-spin{to{transform:rotate(360deg)}}
  @media (max-width:620px){
    body{padding:8px}
    .widget-shell{border-radius:12px}
    .widget-topline{padding:16px 14px 12px;gap:10px}
    .widget-title{font-size:15px}
    .widget-subtitle{display:none}
    .status-pill{padding:4px 7px}
    .widget-body{padding:10px}
  }
  @media (prefers-reduced-motion:reduce){
    *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}
  }
`;

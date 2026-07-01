/**
 * East v. West Team Card — ChatGPT Apps SDK Widget
 *
 * Self-contained inline HTML served as text/html;profile=mcp-app via
 * the MCP resources/read endpoint. Runs inside a sandboxed ChatGPT iframe.
 *
 * Requirements:
 * - Zero external dependencies (no fetch, no CDN, no Tailwind).
 * - All data arrives via postMessage (ui/notifications/tool-result).
 * - Graceful loading, empty, and error states.
 * - structuredContent shape matches handleGetTeam() output exactly.
 * - No write actions, no secrets, no private data.
 *
 * Versioning: bump the URI suffix in mcp-public/route.ts when making
 * breaking markup changes (e.g. team-card-v1 → team-card-v2).
 */

// Team colors baked in so the widget has no dependency on team-colors.ts.
// These mirror TEAM_COLORS in src/lib/constants/team-colors.ts exactly.
const TEAM_COLOR_MAP: Record<string, { primary: string; secondary: string }> = {
  'Belleview Badgers':        { primary: '#006747', secondary: '#1E3052' },
  'Belltown Raptors':         { primary: '#753bbd', secondary: '#ba0c2f' },
  "Minshew's Maniacs":        { primary: '#A60F2D', secondary: '#4D4D4D' },
  'Double Trouble':           { primary: '#120a11', secondary: '#351b4b' },
  'Mt. Lebanon Cake Eaters':  { primary: '#023351', secondary: '#DCAC24' },
  'The Lone Ginger':          { primary: '#d56920', secondary: '#13110d' },
  'bop pop':                  { primary: '#fedb35', secondary: '#f88618' },
  'Red Pandas':               { primary: '#c90a00', secondary: '#000000' },
  'BeerNeverBrokeMyHeart':    { primary: '#0E1A27', secondary: '#F4E3C3' },
  'Elemental Heroes':         { primary: '#83e1e2', secondary: '#fd6e6e' },
  'Detroit Dawgs':            { primary: '#5a341f', secondary: '#da2127' },
  'Bimg Bamg Boomg':          { primary: '#712D7C', secondary: '#9BC46D' },
};

// Logo filenames mirror getTeamLogoPath() in team-utils.ts.
const LOGO_MAP: Record<string, string> = {
  'Belleview Badgers':        'Belleview Badgers Primary Logo.png',
  'Belltown Raptors':         'Belltown Raptors logo.png',
  "Minshew's Maniacs":        "Minshew's Maniacs Logo.png",
  'Double Trouble':           'Double Trouble logo.png',
  'Mt. Lebanon Cake Eaters':  'Cake Eaters Logo Final Version (1).png',
  'The Lone Ginger':          'Lone Ginger Logo.png',
  'bop pop':                  'bop pop logo.png',
  'Red Pandas':               'Red Pandas Primary Logo (2).png',
  'BeerNeverBrokeMyHeart':    'Beer Never Broke My Heart Logo.png',
  'Elemental Heroes':         'Elemental Heroes Logo.png',
  'Detroit Dawgs':            'Detroit Dawgs Logo.png',
  'Bimg Bamg Boomg':          'Bimg Bamg Boomg Logo .png',
};

const BASE_URL = 'https://east-v-west-website.vercel.app';

// Inline the color map and logo map as JSON so the widget script can use them.
const COLOR_MAP_JSON = JSON.stringify(TEAM_COLOR_MAP);
const LOGO_MAP_JSON = JSON.stringify(LOGO_MAP);

export const TEAM_CARD_WIDGET_URI = 'ui://widget/team-card-v1.html';

export const TEAM_CARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Team Card</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0d1117;--surface:#161b22;--border:#30363d;
    --text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;
    --primary:#3b5b8b;--secondary:#ba1010;
    --badge-bg:#21262d;--badge-text:#e6edf3;
    --ir:#e3b341;--out:#f85149;--q:#d29922;
  }
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    background:var(--bg);color:var(--text);
    font-size:13px;line-height:1.5;
    padding:12px;min-height:100vh;
  }
  #state-loading,#state-error,#state-empty{
    display:flex;align-items:center;justify-content:center;
    min-height:120px;color:var(--muted);font-size:14px;text-align:center;
  }
  #state-error{color:#f85149}
  #card{display:none}

  /* Header */
  .card-header{
    display:flex;align-items:center;gap:12px;
    padding:12px 14px;border-radius:8px 8px 0 0;
    background:linear-gradient(135deg,var(--primary) 0%,var(--secondary) 100%);
  }
  .card-header img{
    width:52px;height:52px;object-fit:contain;
    background:rgba(255,255,255,.1);border-radius:6px;padding:4px;
    flex-shrink:0;
  }
  .card-header img.hidden{display:none}
  .header-text h1{font-size:17px;font-weight:700;color:#fff;line-height:1.2}
  .header-text .subtitle{font-size:11px;color:rgba(255,255,255,.75);margin-top:2px}

  /* Stats row */
  .stats-row{
    display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));
    gap:1px;background:var(--border);
    border-left:1px solid var(--border);border-right:1px solid var(--border);
  }
  .stat-box{
    background:var(--surface);padding:8px 10px;text-align:center;
  }
  .stat-box .val{font-size:18px;font-weight:700;color:var(--text)}
  .stat-box .lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:1px}

  /* Sections */
  .section{
    background:var(--surface);
    border-left:1px solid var(--border);border-right:1px solid var(--border);
    padding:10px 14px;
  }
  .section+.section{border-top:1px solid var(--border)}
  .section:last-child{border-radius:0 0 8px 8px;border-bottom:1px solid var(--border)}
  .section-title{
    font-size:10px;font-weight:600;text-transform:uppercase;
    letter-spacing:.08em;color:var(--muted);margin-bottom:7px;
  }

  /* Championships */
  .champ-list{display:flex;flex-wrap:wrap;gap:4px}
  .champ-badge{
    background:var(--badge-bg);border:1px solid #bf9944;
    color:#bf9944;border-radius:4px;
    font-size:11px;font-weight:600;padding:2px 7px;
  }
  .no-data{color:var(--muted);font-size:12px;font-style:italic}

  /* Roster */
  .pos-group{margin-bottom:8px}
  .pos-group:last-child{margin-bottom:0}
  .pos-label{
    display:inline-block;font-size:10px;font-weight:700;
    background:var(--badge-bg);border:1px solid var(--border);
    border-radius:3px;padding:1px 5px;color:var(--muted);
    margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;
  }
  .player-list{display:flex;flex-wrap:wrap;gap:4px}
  .player-chip{
    background:var(--badge-bg);border:1px solid var(--border);
    border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text);
    display:inline-flex;align-items:center;gap:4px;
  }
  .player-chip .nfl{color:var(--muted);font-size:10px}
  .status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
  .s-out{background:var(--out)}
  .s-q{background:var(--q)}
  .s-ir{background:var(--ir)}
  .s-other{background:var(--muted)}

  /* IR / Taxi counts */
  .slot-counts{display:flex;gap:10px}
  .slot-pill{
    background:var(--badge-bg);border:1px solid var(--border);
    border-radius:4px;padding:3px 9px;font-size:12px;
  }
  .slot-pill .num{font-weight:700}
  .slot-pill .type{color:var(--muted);margin-left:4px;font-size:11px}

  /* Freshness */
  .freshness{
    border-top:1px solid var(--border);padding:6px 14px;
    font-size:10px;color:var(--muted);text-align:right;
    background:var(--surface);border-radius:0 0 8px 8px;
  }
</style>
</head>
<body>
<div id="state-loading">Loading team data\u2026</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No team data available.</div>
<div id="card"></div>

<script>
(function(){
  var COLOR_MAP = ${COLOR_MAP_JSON};
  var LOGO_FILE_MAP = ${LOGO_MAP_JSON};
  var BASE = '${BASE_URL}';

  function logoSrc(name){
    var f = LOGO_FILE_MAP[name] || (name+'.png');
    return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f);
  }

  function teamColors(name){
    return COLOR_MAP[name] || {primary:'#3b5b8b',secondary:'#ba1010'};
  }

  function isLight(hex){
    var h=hex.replace('#','');
    var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    return (r*299+g*587+b*114)/1000>128;
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  var STATUS_SEVERITY = {
    'Out':1,'IR':1,'PUP-P':1,'NFI-R':1,'Sus':1,
    'Doubtful':2,'Questionable':3,'Limited':3,'DNP':3
  };

  function statusDotClass(status){
    if(!status||status==='Active'||status==='ACT') return null;
    var sev=STATUS_SEVERITY[status];
    if(sev===1) return 's-out';
    if(sev===2) return 's-out';
    if(sev===3) return 's-q';
    return 's-other';
  }

  function statusLabel(s){
    if(!s||s==='Active'||s==='ACT') return '';
    return s;
  }

  var POS_ORDER=['QB','RB','WR','TE','K','DST','DL','LB','DB','FLEX','SUPER_FLEX','BN'];

  function groupByPos(players){
    var g={};
    players.forEach(function(p){
      var pos=p.position||'?';
      if(!g[pos]) g[pos]=[];
      g[pos].push(p);
    });
    return g;
  }

  function renderRosterSection(title, players, showInjury){
    if(!players||!players.length) return '';
    var grouped=groupByPos(players);
    var keys=Object.keys(grouped).sort(function(a,b){
      var ai=POS_ORDER.indexOf(a),bi=POS_ORDER.indexOf(b);
      if(ai===-1&&bi===-1) return a.localeCompare(b);
      if(ai===-1) return 1; if(bi===-1) return -1;
      return ai-bi;
    });
    var rows=keys.map(function(pos){
      var chips=grouped[pos].map(function(p){
        var dot='';
        if(showInjury&&p.status&&p.status!=='Active'&&p.status!=='ACT'){
          var cls=statusDotClass(p.status)||'s-other';
          dot='<span class="status-dot '+cls+'" title="'+esc(p.status)+'"></span>';
        }
        var nfl=p.nflTeam?'<span class="nfl">'+esc(p.nflTeam)+'</span>':'';
        return '<span class="player-chip">'+dot+esc(p.name)+nfl+'</span>';
      }).join('');
      return '<div class="pos-group"><span class="pos-label">'+esc(pos)+'</span><div class="player-list">'+chips+'</div></div>';
    }).join('');
    return '<div class="section"><div class="section-title">'+esc(title)+'</div>'+rows+'</div>';
  }

  function render(data){
    var team=data&&data.team;
    var roster=data&&data.roster;
    var meta=data&&data.meta;

    if(!team){
      document.getElementById('state-loading').style.display='none';
      document.getElementById('state-empty').style.display='flex';
      return;
    }

    var name=team.name||'Unknown';
    var colors=teamColors(name);
    var primary=colors.primary,secondary=colors.secondary;
    var headerTextColor=isLight(primary)?'#000':'#fff';
    var headerSubColor=isLight(primary)?'rgba(0,0,0,.6)':'rgba(255,255,255,.75)';

    // Record
    var cr=team.currentRecord||{};
    var season=cr.season||'';
    var wins=cr.wins!=null?cr.wins:'—';
    var losses=cr.losses!=null?cr.losses:'—';
    var ties=cr.ties!=null&&cr.ties>0?' / '+cr.ties+'T':'';
    var pf=cr.pf!=null?Number(cr.pf).toFixed(1):'—';
    var pa=cr.pa!=null?Number(cr.pa).toFixed(1):'—';

    // All-time
    var at=team.allTimeStats&&team.allTimeStats.regularSeason;
    var atStr=at?(at.wins+'-'+at.losses):null;

    // Championships
    var champCount=team.championships||0;
    var champHistory=(team.championshipHistory||[]).filter(function(c){return c.finish.startsWith('1st')});
    var champSection='';
    if(champCount>0){
      var badges=champHistory.map(function(c){
        return '<span class="champ-badge">\uD83C\uDFC6 '+esc(c.year)+'</span>';
      }).join('');
      champSection='<div class="section"><div class="section-title">Championships ('+champCount+')</div><div class="champ-list">'+badges+'</div></div>';
    }

    // Slot counts
    var irCount=(roster&&roster.ir&&roster.ir.length)||0;
    var taxiCount=(roster&&roster.taxi&&roster.taxi.length)||0;
    var slotSection='';
    if(irCount>0||taxiCount>0){
      var pills='';
      if(irCount>0) pills+='<span class="slot-pill"><span class="num">'+irCount+'</span><span class="type">IR</span></span>';
      if(taxiCount>0) pills+='<span class="slot-pill"><span class="num">'+taxiCount+'</span><span class="type">Taxi</span></span>';
      slotSection='<div class="section"><div class="section-title">Reserve Slots</div><div class="slot-counts">'+pills+'</div></div>';
    }

    // Active roster
    var activeSection=renderRosterSection(
      'Active Roster ('+(roster&&roster.active?roster.active.length:0)+')',
      roster&&roster.active?roster.active:[],
      true
    );

    // IR roster
    var irSection=renderRosterSection(
      'IR / Reserve ('+irCount+')',
      roster&&roster.ir?roster.ir:[],
      true
    );

    // Taxi
    var taxiSection=renderRosterSection(
      'Taxi Squad ('+taxiCount+')',
      roster&&roster.taxi?roster.taxi:[],
      false
    );

    // Freshness
    var fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    var freshnessHtml=fetchedAt?'<div class="freshness">Live from Sleeper \u00B7 '+esc(fetchedAt)+'</div>':'';

    // Stats grid
    var statsHtml='<div class="stats-row">'
      +'<div class="stat-box"><div class="val">'+wins+'-'+losses+ties+'</div><div class="lbl">'+esc(season)+' Record</div></div>'
      +'<div class="stat-box"><div class="val">'+pf+'</div><div class="lbl">Points For</div></div>'
      +'<div class="stat-box"><div class="val">'+pa+'</div><div class="lbl">Points Against</div></div>'
      +(atStr?'<div class="stat-box"><div class="val">'+esc(atStr)+'</div><div class="lbl">All-Time</div></div>':'')
      +(champCount?'<div class="stat-box"><div class="val">\uD83C\uDFC6 '+champCount+'</div><div class="lbl">Title'+(champCount>1?'s':'')+'</div></div>':'')
      +'</div>';

    var html=
      '<div class="card-header" style="background:linear-gradient(135deg,'+primary+' 0%,'+secondary+' 100%)">'
      +'  <img id="team-logo" src="'+esc(logoSrc(name))+'" alt="'+esc(name)+' logo" onerror="this.classList.add(\\'hidden\\')">'
      +'  <div class="header-text">'
      +'    <h1 style="color:'+headerTextColor+'">'+esc(name)+'</h1>'
      +'    <div class="subtitle" style="color:'+headerSubColor+'">East v. West Dynasty</div>'
      +'  </div>'
      +'</div>'
      +statsHtml
      +champSection
      +activeSection
      +slotSection
      +irSection
      +taxiSection
      +freshnessHtml;

    var card=document.getElementById('card');
    card.innerHTML=html;
    card.style.display='block';
    document.getElementById('state-loading').style.display='none';
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object') return null;
    console.log('[team-card] msg:',msg.type||msg.method||'(raw)');
    // Pattern 1: MCP JSON-RPC notification (ui/notifications/tool-result)
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){
      var p=msg.params||{};
      var d1=p.structuredContent||(p.team&&p.roster?p:null);
      if(d1) return d1;
    }
    // Pattern 2: OpenAI Apps SDK tool_result / mcp_tool_result envelope
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){
      var r=msg.result||msg;
      if(r.structuredContent&&r.structuredContent.team) return r.structuredContent;
      if(r.team&&r.roster) return r;
    }
    // Pattern 3: OpenAI Apps SDK app_action set_data
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.team) return msg.data;
    // Pattern 4: Direct structuredContent envelope
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.team) return msg.structuredContent;
    // Pattern 5: MCP result wrapper { result: { structuredContent: {...} } }
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.team) return msg.result.structuredContent;
    // Pattern 6: Raw team data at top level
    if(msg.team&&msg.roster) return msg;
    // Pattern 7: Nested under data key
    if(msg.data&&msg.data.team&&msg.data.roster) return msg.data;
    // Pattern 8: params wrapper
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.team) return msg.params.structuredContent;
    return null;
  }

  function handleMessage(event){
    // Accept messages from parent or top frame — handles nested iframe structures in ChatGPT
    if(event.source&&event.source!==window.parent&&event.source!==window.top) return;
    var data=tryExtractData(event.data);
    if(data===null) return;
    console.log('[team-card] rendering:',data&&data.team&&data.team.name);
    try{ render(data); }
    catch(e){
      console.error('[team-card] render error:',e);
      document.getElementById('state-loading').style.display='none';
      var el=document.getElementById('state-error');
      el.textContent='Widget error: '+String(e);
      el.style.display='flex';
    }
  }

  window.addEventListener('message',handleMessage);

  // Signal readiness to host frame so it knows the widget is mounted
  try{ window.parent.postMessage({type:'widget_ready',widget:'team-card-v1'},'*'); }catch(e){}

  // Timeout fallback — if no data arrives in 12s show empty state
  setTimeout(function(){
    if(document.getElementById('card').style.display==='none'
      &&document.getElementById('state-error').style.display==='none'){
      document.getElementById('state-loading').style.display='none';
      document.getElementById('state-empty').style.display='flex';
    }
  },12000);
})();
</script>
</body>
</html>`;

export const TEAM_CARD_RESOURCE = {
  uri: TEAM_CARD_WIDGET_URI,
  name: 'East v. West Team Card',
  mimeType: 'text/html;profile=mcp-app' as const,
};

import { TEAM_CARD_WIDGET_URI } from './team-card-contract';
import { BASE_URL, COLOR_MAP_JSON, LOGO_MAP_JSON } from './team-card-assets';
import { TEAM_CARD_STYLE } from './team-card-style';

export const TEAM_CARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Team Card</title>
<style>${TEAM_CARD_STYLE}</style>
</head>
<body>
<div id="state-loading">Loading team data\u2026</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No team data available.</div>
<div id="card"></div>
<script>
(function(){
  var COLOR_MAP=${COLOR_MAP_JSON};
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;

  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function teamColors(name){return COLOR_MAP[name]||{primary:'#3b5b8b',secondary:'#ba1010'}}
  function isLight(hex){var h=hex.replace('#','');var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return(r*299+g*587+b*114)/1000>128}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

  var STATUS_SEVERITY={'Out':1,'IR':1,'PUP-P':1,'NFI-R':1,'Sus':1,'Doubtful':2,'Questionable':3,'Limited':3,'DNP':3};
  function statusDotClass(status){if(!status||status==='Active'||status==='ACT')return null;var sev=STATUS_SEVERITY[status];if(sev===1||sev===2)return's-out';if(sev===3)return's-q';return's-other'}
  var POS_ORDER=['QB','RB','WR','TE','K','DST','DL','LB','DB','FLEX','SUPER_FLEX','BN'];

  function groupByPos(players){var g={};players.forEach(function(p){var pos=p.position||'?';if(!g[pos])g[pos]=[];g[pos].push(p)});return g}
  function renderRosterSection(title,players,showInjury){
    if(!players||!players.length)return'';
    var grouped=groupByPos(players);
    var keys=Object.keys(grouped).sort(function(a,b){var ai=POS_ORDER.indexOf(a),bi=POS_ORDER.indexOf(b);if(ai===-1&&bi===-1)return a.localeCompare(b);if(ai===-1)return 1;if(bi===-1)return-1;return ai-bi});
    var rows=keys.map(function(pos){
      var chips=grouped[pos].map(function(p){
        var dot='';
        if(showInjury&&p.status&&p.status!=='Active'&&p.status!=='ACT'){var cls=statusDotClass(p.status)||'s-other';dot='<span class="status-dot '+cls+'" title="'+esc(p.status)+'"></span>'}
        var nfl=p.nflTeam?'<span class="nfl">'+esc(p.nflTeam)+'</span>':'';
        return'<span class="player-chip">'+dot+esc(p.name)+nfl+'</span>';
      }).join('');
      return'<div class="pos-group"><span class="pos-label">'+esc(pos)+'</span><div class="player-list">'+chips+'</div></div>';
    }).join('');
    return'<div class="section"><div class="section-title">'+esc(title)+'</div>'+rows+'</div>';
  }

  function render(data){
    var team=data&&data.team,roster=data&&data.roster,meta=data&&data.meta;
    if(!team){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var name=team.name||'Unknown',colors=teamColors(name),primary=colors.primary,secondary=colors.secondary;
    var headerTextColor=isLight(primary)?'#000':'#fff',headerSubColor=isLight(primary)?'rgba(0,0,0,.6)':'rgba(255,255,255,.75)';
    var cr=team.currentRecord||{},season=cr.season||'',wins=cr.wins!=null?cr.wins:'—',losses=cr.losses!=null?cr.losses:'—';
    var ties=cr.ties!=null&&cr.ties>0?' / '+cr.ties+'T':'',pf=cr.pf!=null?Number(cr.pf).toFixed(1):'—',pa=cr.pa!=null?Number(cr.pa).toFixed(1):'—';
    var at=team.allTimeStats&&team.allTimeStats.regularSeason,atStr=at?(at.wins+'-'+at.losses):null;
    var champCount=team.championships||0;
    var champHistory=(team.championshipHistory||[]).filter(function(c){return typeof c.finish==='string'&&c.finish.indexOf('1st')===0});
    var champSection='';
    if(champCount>0){var badges=champHistory.map(function(c){return'<span class="champ-badge">\uD83C\uDFC6 '+esc(c.year)+'</span>'}).join('');champSection='<div class="section"><div class="section-title">Championships ('+champCount+')</div><div class="champ-list">'+badges+'</div></div>'}
    var irCount=(roster&&roster.ir&&roster.ir.length)||0,taxiCount=(roster&&roster.taxi&&roster.taxi.length)||0,slotSection='';
    if(irCount>0||taxiCount>0){var pills='';if(irCount>0)pills+='<span class="slot-pill"><span class="num">'+irCount+'</span><span class="type">IR</span></span>';if(taxiCount>0)pills+='<span class="slot-pill"><span class="num">'+taxiCount+'</span><span class="type">Taxi</span></span>';slotSection='<div class="section"><div class="section-title">Reserve Slots</div><div class="slot-counts">'+pills+'</div></div>'}
    var activeSection=renderRosterSection('Active Roster ('+(roster&&roster.active?roster.active.length:0)+')',roster&&roster.active?roster.active:[],true);
    var irSection=renderRosterSection('IR / Reserve ('+irCount+')',roster&&roster.ir?roster.ir:[],true);
    var taxiSection=renderRosterSection('Taxi Squad ('+taxiCount+')',roster&&roster.taxi?roster.taxi:[],false);
    var fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    var freshnessHtml=fetchedAt?'<div class="freshness">Live from Sleeper \u00B7 '+esc(fetchedAt)+'</div>':'';
    var statsHtml='<div class="stats-row">'
      +'<div class="stat-box"><div class="val">'+wins+'-'+losses+ties+'</div><div class="lbl">'+esc(season)+' Record</div></div>'
      +'<div class="stat-box"><div class="val">'+pf+'</div><div class="lbl">Points For</div></div>'
      +'<div class="stat-box"><div class="val">'+pa+'</div><div class="lbl">Points Against</div></div>'
      +(atStr?'<div class="stat-box"><div class="val">'+esc(atStr)+'</div><div class="lbl">All-Time</div></div>':'')
      +(champCount?'<div class="stat-box"><div class="val">\uD83C\uDFC6 '+champCount+'</div><div class="lbl">Title'+(champCount>1?'s':'')+'</div></div>':'')+'</div>';
    var html='<div class="card-header" style="background:linear-gradient(135deg,'+primary+' 0%,'+secondary+' 100%)">'
      +'<img id="team-logo" src="'+esc(logoSrc(name))+'" alt="'+esc(name)+' logo" onerror="this.classList.add(\\'hidden\\')">'
      +'<div class="header-text"><h1 style="color:'+headerTextColor+'">'+esc(name)+'</h1><div class="subtitle" style="color:'+headerSubColor+'">East v. West Dynasty</div></div></div>'
      +statsHtml+champSection+activeSection+slotSection+irSection+taxiSection+freshnessHtml;
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||(p.team&&p.roster?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.team)return r.structuredContent;if(r.team&&r.roster)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.team)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.team)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.team)return msg.result.structuredContent;
    if(msg.team&&msg.roster)return msg;
    if(msg.data&&msg.data.team&&msg.data.roster)return msg.data;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.team)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){
    console.error('[team-card] render error:',error);
    document.getElementById('state-loading').style.display='none';
    var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex';
  }

  function renderCandidate(candidate){
    var data=tryExtractData(candidate)||candidate;
    if(!data||typeof data!=='object'||!data.team)return false;
    try{render(data);return true}catch(error){showRenderError(error);return false}
  }

  function handleMessage(event){
    if(event.source&&event.source!==window.parent&&event.source!==window.top)return;
    var data=tryExtractData(event.data);if(data!==null)renderCandidate(data);
  }

  function initializeFromOpenAI(){
    try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[team-card] window.openai fallback unavailable:',error)}
  }

  function handleOpenAIGlobals(event){
    try{
      var detail=event&&event.detail;
      var globals=detail&&detail.globals?detail.globals:detail;
      if(!globals||typeof globals!=='object')return;
      var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;
      renderCandidate(candidate);
    }catch(error){console.warn('[team-card] openai:set_globals handling failed:',error)}
  }

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'team-card-v3'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const TEAM_CARD_RESOURCE = {
  uri: TEAM_CARD_WIDGET_URI,
  name: 'East v. West Team Card',
  mimeType: 'text/html;profile=mcp-app' as const,
};

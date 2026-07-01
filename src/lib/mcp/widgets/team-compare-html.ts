import { TEAM_COMPARE_WIDGET_URI } from './team-compare-contract';
import { BASE_URL, COLOR_MAP_JSON, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { TEAM_COMPARE_STYLE } from './team-compare-style';

export const TEAM_COMPARE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Team Compare</title>
<style>${WIDGET_BASE_STYLE}${TEAM_COMPARE_STYLE}</style>
</head>
<body>
<div id="state-loading">Comparing teams…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No comparison data available.</div>
<div id="card"></div>
<script>
(function(){
  var COLOR_MAP=${COLOR_MAP_JSON};
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;
  var POS_ORDER=['QB','RB','WR','TE','K','DST','DL','LB','DB','FLEX','SUPER_FLEX','BN'];

  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function teamColors(name){return COLOR_MAP[name]||{primary:'#315f9e',secondary:'#b52f45'}}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Team Comparison</div><div class="widget-subtitle">Head-to-head franchise and roster snapshot</div></div></div><span class="status-pill"><span class="pulse"></span>Live</span></div>'}

  function metricRow(label,v1,v2,text1,text2,higherWins){
    var win1='',win2='';
    if(higherWins!==null&&v1!==v2){if(higherWins?v1>v2:v1<v2)win1=' win';else win2=' win'}
    return'<div class="metric-row"><div class="metric-value left'+win1+'">'+esc(text1)+'</div><div class="metric-label">'+esc(label)+'</div><div class="metric-value right'+win2+'">'+esc(text2)+'</div></div>';
  }

  function renderTeam(team){
    var c=teamColors(team.teamName),s=team.currentSeason;
    var rec=s.wins+'-'+s.losses+(s.ties?'-'+s.ties+'T':'');
    return'<div class="team-side" style="background:linear-gradient(130deg,'+c.primary+','+c.secondary+')"><span class="team-logo-frame"><img src="'+esc(logoSrc(team.teamName))+'" alt="'+esc(team.teamName)+' logo" onerror="this.classList.add(\'hidden\')"></span><div><div class="name">'+esc(team.teamName)+'</div><div class="record">'+esc(s.season)+' · '+rec+' · '+Number(s.pf||0).toFixed(1)+' PF</div></div></div>';
  }

  function playerPills(players,side){
    if(!players||!players.length)return'<span class="player-pill muted">None</span>';
    return players.map(function(p){return'<span class="player-pill">'+esc(p)+'</span>'}).join('');
  }

  function renderRooms(team1,team2){
    var room1=team1.positionRooms||{},room2=team2.positionRooms||{};
    var keys=Object.keys(Object.assign({},room1,room2)).sort(function(a,b){var ai=POS_ORDER.indexOf(a),bi=POS_ORDER.indexOf(b);if(ai===-1&&bi===-1)return a.localeCompare(b);if(ai===-1)return 1;if(bi===-1)return-1;return ai-bi});
    if(!keys.length)return'<div class="muted">No position-room data available.</div>';
    return'<div class="room-table">'+keys.map(function(pos){return'<div class="room-row"><div class="room-players">'+playerPills(room1[pos]||[],'left')+'</div><div class="room-pos">'+esc(pos)+'</div><div class="room-players right">'+playerPills(room2[pos]||[],'right')+'</div></div>'}).join('')+'</div>';
  }

  function render(data){
    var d=data&&data.data,team1=d&&d.team1,team2=d&&d.team2;
    if(!team1||!team2){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var s1=team1.currentSeason,s2=team2.currentSeason;
    var rec1=s1.wins+'-'+s1.losses+(s1.ties?'-'+s1.ties+'T':''),rec2=s2.wins+'-'+s2.losses+(s2.ties?'-'+s2.ties+'T':'');
    var at1=team1.allTimeStats&&team1.allTimeStats.regularSeason,at2=team2.allTimeStats&&team2.allTimeStats.regularSeason;
    var metrics='<div class="panel metrics-panel">'
      +metricRow('Current record',s1.wins,s2.wins,rec1,rec2,true)
      +metricRow('Points for',s1.pf,s2.pf,Number(s1.pf||0).toFixed(1),Number(s2.pf||0).toFixed(1),true)
      +metricRow('Points against',s1.pa,s2.pa,Number(s1.pa||0).toFixed(1),Number(s2.pa||0).toFixed(1),false)
      +metricRow('All-time wins',at1?at1.wins:0,at2?at2.wins:0,at1?(at1.wins+'-'+at1.losses):'—',at2?(at2.wins+'-'+at2.losses):'—',true)
      +metricRow('Championships',team1.championships,team2.championships,String(team1.championships),String(team2.championships),true)
      +'</div>';
    var rooms='<div class="panel room-panel"><div class="section-heading"><span class="section-kicker">Roster Rooms</span><span class="section-meta">Players by position</span></div>'+renderRooms(team1,team2)+'</div>';
    var ir1=(team1.roster&&team1.roster.ir&&team1.roster.ir.length)||0,taxi1=(team1.roster&&team1.roster.taxi&&team1.roster.taxi.length)||0;
    var ir2=(team2.roster&&team2.roster.ir&&team2.roster.ir.length)||0,taxi2=(team2.roster&&team2.roster.taxi&&team2.roster.taxi.length)||0;
    var reserves='<div class="panel reserve-panel"><div class="section-heading"><span class="section-kicker">Reserve Slots</span><span class="section-meta">IR and taxi usage</span></div>'+metricRow('IR',ir1,ir2,String(ir1),String(ir2),null)+metricRow('Taxi',taxi1,taxi2,String(taxi1),String(taxi2),null)+'</div>';
    var fetchedAt=d&&d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">Live from Sleeper · '+esc(fetchedAt)+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="compare-body"><div class="matchup-hero">'+renderTeam(team1)+'<div class="versus">VS</div>'+renderTeam(team2)+'</div>'+metrics+rooms+reserves+'</div>'+freshness+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.team1)?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.team1)return r.structuredContent;if(r.data&&r.data.team1)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.team1)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.team1)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.team1)return msg.result.structuredContent;
    if(msg.data&&msg.data.team1&&msg.data.team2)return msg;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.team1)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){console.error('[team-compare] render error:',error);document.getElementById('state-loading').style.display='none';var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex'}
  function renderCandidate(candidate){var data=tryExtractData(candidate)||candidate;if(!data||typeof data!=='object'||!data.data||!data.data.team1)return false;try{render(data);return true}catch(error){showRenderError(error);return false}}
  function handleMessage(event){if(event.source&&event.source!==window.parent&&event.source!==window.top)return;var data=tryExtractData(event.data);if(data!==null)renderCandidate(data)}
  function initializeFromOpenAI(){try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[team-compare] window.openai fallback unavailable:',error)}}
  function handleOpenAIGlobals(event){try{var detail=event&&event.detail;var globals=detail&&detail.globals?detail.globals:detail;if(!globals||typeof globals!=='object')return;var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;renderCandidate(candidate)}catch(error){console.warn('[team-compare] openai:set_globals handling failed:',error)}}

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'team-compare-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const TEAM_COMPARE_RESOURCE = {
  uri: TEAM_COMPARE_WIDGET_URI,
  name: 'East v. West Team Compare',
  mimeType: 'text/html;profile=mcp-app' as const,
};

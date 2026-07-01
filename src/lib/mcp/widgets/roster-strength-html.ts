import { ROSTER_STRENGTH_WIDGET_URI } from './roster-strength-contract';
import { BASE_URL, COLOR_MAP_JSON, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { ROSTER_STRENGTH_STYLE } from './roster-strength-style';

export const ROSTER_STRENGTH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Roster Strength</title>
<style>${WIDGET_BASE_STYLE}${ROSTER_STRENGTH_STYLE}</style>
</head>
<body>
<div id="state-loading">Analyzing roster…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No roster analysis available.</div>
<div id="card"></div>
<script>
(function(){
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var COLOR_MAP=${COLOR_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;
  var POS_ORDER=['QB','RB','WR','TE'];
  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function teamColor(name){var c=COLOR_MAP[name]||{primary:'#4f8cff'};return c.primary}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function fmtNum(n){return Math.round(n||0).toLocaleString()}
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Roster Strength</div><div class="widget-subtitle">Dynasty value by position with strengths and needs</div></div></div><span class="status-pill"><span class="pulse"></span>Live values</span></div>'}
  function statusFor(pos,d){if((d.strengths||[]).indexOf(pos)!==-1)return{label:'Strength',cls:'strong'};if((d.weaknesses||[]).indexOf(pos)!==-1)return{label:'Need',cls:'need'};return{label:'Stable',cls:'stable'}}
  function renderPlayers(players){
    if(!players||!players.length)return'<div class="player-row"><span class="meta">No active values</span></div>';
    return players.slice(0,5).map(function(p){var meta=(p.nflTeam?esc(p.nflTeam):'FA')+(p.rank?' · #'+p.rank:'');return'<div class="player-row"><div><span class="name">'+esc(p.name)+'</span><span class="meta"> · '+meta+'</span></div><span class="value">'+(p.value==null?'—':fmtNum(p.value))+'</span></div>'}).join('');
  }
  function renderPosition(pos,summary,players,maxValue,d){
    var pct=maxValue>0?Math.max(4,Math.round((summary.totalValue/maxValue)*100)):0,status=statusFor(pos,d);
    return'<div class="position-card"><div class="position-head"><div><div class="position-name"><span class="badge">'+pos+'</span>'+summary.count+' players</div><div class="position-value"><strong>'+fmtNum(summary.totalValue)+'</strong> total value</div></div><span class="position-status '+status.cls+'">'+status.label+'</span></div><div class="strength-track"><div class="strength-fill" style="width:'+pct+'%;background:linear-gradient(90deg,'+esc(teamColor(d.teamName))+',#79a8ff)"></div></div><div class="player-stack">'+renderPlayers(players)+'</div></div>';
  }
  function render(data){
    var d=data&&data.data;
    if(!d||!d.positionSummary){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var maxValue=POS_ORDER.reduce(function(m,pos){var s=d.positionSummary[pos];return s&&s.totalValue>m?s.totalValue:m},1);
    var hero='<div class="roster-hero"><span class="team-logo-frame"><img src="'+esc(logoSrc(d.teamName))+'" alt="'+esc(d.teamName)+' logo" onerror="this.classList.add(\'hidden\')"></span><div><div class="roster-team">'+esc(d.teamName)+'</div><div class="roster-sub">Position-by-position dynasty portfolio</div></div><div class="total-value"><div class="num">'+fmtNum(d.totalDynastyValue)+'</div><div class="label">Total dynasty value</div></div></div>';
    var tags='<div class="profile-tags">'+(d.strengths||[]).map(function(p){return'<span class="tag strength">'+esc(p)+' strength</span>'}).join('')+(d.weaknesses||[]).map(function(p){return'<span class="tag weakness">'+esc(p)+' need</span>'}).join('')+'</div>';
    var cards='<div class="position-grid">'+POS_ORDER.map(function(pos){var summary=d.positionSummary[pos]||{count:0,totalValue:0,topPlayer:null};var players=(d.positions&&d.positions[pos])||[];return renderPosition(pos,summary,players,maxValue,d)}).join('')+'</div>';
    var fetchedAt=d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">'+esc(d.source||'')+' · '+esc(fetchedAt)+(d.valuesAvailable?'':' · Some values unavailable')+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="roster-body">'+hero+tags+cards+'</div>'+freshness+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }
  function tryExtractData(msg){if(!msg||typeof msg!=='object')return null;if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.positionSummary)?p:null);if(d1)return d1}if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.positionSummary)return r.structuredContent;if(r.data&&r.data.positionSummary)return r}if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.positionSummary)return msg.data;if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.positionSummary)return msg.structuredContent;if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.positionSummary)return msg.result.structuredContent;if(msg.data&&msg.data.positionSummary)return msg;if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.positionSummary)return msg.params.structuredContent;return null}
  function showRenderError(error){console.error('[roster-strength] render error:',error);document.getElementById('state-loading').style.display='none';var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex'}
  function renderCandidate(candidate){var data=tryExtractData(candidate)||candidate;if(!data||typeof data!=='object'||!data.data||!data.data.positionSummary)return false;try{render(data);return true}catch(error){showRenderError(error);return false}}
  function handleMessage(event){if(event.source&&event.source!==window.parent&&event.source!==window.top)return;var data=tryExtractData(event.data);if(data!==null)renderCandidate(data)}
  function initializeFromOpenAI(){try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[roster-strength] window.openai fallback unavailable:',error)}}
  function handleOpenAIGlobals(event){try{var detail=event&&event.detail;var globals=detail&&detail.globals?detail.globals:detail;if(!globals||typeof globals!=='object')return;var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;renderCandidate(candidate)}catch(error){console.warn('[roster-strength] openai:set_globals handling failed:',error)}}
  window.addEventListener('message',handleMessage);window.addEventListener('openai:set_globals',handleOpenAIGlobals);initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'roster-strength-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const ROSTER_STRENGTH_RESOURCE = { uri: ROSTER_STRENGTH_WIDGET_URI, name: 'East v. West Roster Strength', mimeType: 'text/html;profile=mcp-app' as const };

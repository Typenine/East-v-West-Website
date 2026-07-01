import { ROSTER_STRENGTH_WIDGET_URI } from './roster-strength-contract';
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
  var hasRendered=false;
  var POS_ORDER=['QB','RB','WR','TE'];

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function fmtNum(n){return Math.round(n||0).toLocaleString()}

  function renderPlayers(players){
    if(!players||!players.length)return'<span class="pos-player-chip">No players</span>';
    return players.map(function(p){
      var nfl=p.nflTeam?'<span class="nfl">'+esc(p.nflTeam)+'</span>':'';
      return'<span class="pos-player-chip">'+esc(p.name)+nfl+'</span>';
    }).join('');
  }

  function renderPosBar(pos,summary,players,maxVal){
    var pct=maxVal>0?Math.max(4,Math.round((summary.totalValue/maxVal)*100)):0;
    return'<div class="pos-bar-row"><div class="pos-bar-head"><span class="pos">'+esc(pos)+' ('+summary.count+')</span><span class="val">'+fmtNum(summary.totalValue)+'</span></div>'
      +'<div class="pos-bar-track"><div class="pos-bar-fill" style="width:'+pct+'%"></div></div>'
      +'<div class="pos-players">'+renderPlayers(players)+'</div></div>';
  }

  function render(data){
    var d=data&&data.data;
    if(!d||!d.positionSummary){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var maxVal=POS_ORDER.reduce(function(m,pos){var s=d.positionSummary[pos];return s&&s.totalValue>m?s.totalValue:m},1);
    var strengthTags=(d.strengths||[]).map(function(p){return'<span class="tag strength">'+esc(p)+' strength</span>'}).join('');
    var weaknessTags=(d.weaknesses||[]).map(function(p){return'<span class="tag weakness">'+esc(p)+' weakness</span>'}).join('');
    var banner='<div class="summary-banner"><div class="team-name">'+esc(d.teamName)+'</div>'
      +'<div class="total">Total Dynasty Value: '+fmtNum(d.totalDynastyValue)+(d.valuesAvailable?'':' (values partially unavailable)')+'</div>'
      +'<div class="tags">'+strengthTags+weaknessTags+'</div></div>';
    var barsHtml='<div class="pos-bars">'+POS_ORDER.map(function(pos){
      var summary=d.positionSummary[pos]||{count:0,totalValue:0,topPlayer:null};
      var players=(d.positions&&d.positions[pos])||[];
      return renderPosBar(pos,summary,players,maxVal);
    }).join('')+'</div>';
    var fetchedAt=d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    var freshnessHtml=fetchedAt?'<div class="freshness">'+esc(fetchedAt)+'</div>':'';
    var html=banner+barsHtml+freshnessHtml;
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.positionSummary)?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.positionSummary)return r.structuredContent;if(r.data&&r.data.positionSummary)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.positionSummary)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.positionSummary)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.positionSummary)return msg.result.structuredContent;
    if(msg.data&&msg.data.positionSummary)return msg;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.positionSummary)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){
    console.error('[roster-strength] render error:',error);
    document.getElementById('state-loading').style.display='none';
    var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex';
  }

  function renderCandidate(candidate){
    var data=tryExtractData(candidate)||candidate;
    if(!data||typeof data!=='object'||!data.data||!data.data.positionSummary)return false;
    try{render(data);return true}catch(error){showRenderError(error);return false}
  }

  function handleMessage(event){
    if(event.source&&event.source!==window.parent&&event.source!==window.top)return;
    var data=tryExtractData(event.data);if(data!==null)renderCandidate(data);
  }

  function initializeFromOpenAI(){
    try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[roster-strength] window.openai fallback unavailable:',error)}
  }

  function handleOpenAIGlobals(event){
    try{
      var detail=event&&event.detail;
      var globals=detail&&detail.globals?detail.globals:detail;
      if(!globals||typeof globals!=='object')return;
      var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;
      renderCandidate(candidate);
    }catch(error){console.warn('[roster-strength] openai:set_globals handling failed:',error)}
  }

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'roster-strength-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const ROSTER_STRENGTH_RESOURCE = {
  uri: ROSTER_STRENGTH_WIDGET_URI,
  name: 'East v. West Roster Strength',
  mimeType: 'text/html;profile=mcp-app' as const,
};

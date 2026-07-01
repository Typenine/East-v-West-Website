import { FRANCHISE_CASE_WIDGET_URI } from './franchise-case-contract';
import { BASE_URL, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { FRANCHISE_CASE_STYLE } from './franchise-case-style';

export const FRANCHISE_CASE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Franchise Trophy Case</title>
<style>${WIDGET_BASE_STYLE}${FRANCHISE_CASE_STYLE}</style>
</head>
<body>
<div id="state-loading">Loading franchise records…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No franchise data available.</div>
<div id="card"></div>
<script>
(function(){
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;

  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

  function renderRow(f,idx){
    var reg=f.regularSeason,plo=f.playoffs;
    var recordStr=reg.wins+'-'+reg.losses+(reg.ties?'-'+reg.ties:'')+' ('+reg.winPct.toFixed(1)+'%)';
    var ploStr=(plo.wins+plo.losses)>0?' · Playoffs '+plo.wins+'-'+plo.losses:'';
    var trophies=f.championships>0?'<span class="champs">'+'🏆'.repeat(Math.min(f.championships,5))+(f.championships>5?' ×'+f.championships:'')+'</span>':'<span class="champs" style="color:var(--muted)">—</span>';
    var runners=f.runnerUps>0?'<span class="runners">'+f.runnerUps+' runner-up'+(f.runnerUps>1?'s':'')+'</span>':'';
    return'<div class="rank-row"><div class="rank-num">'+(idx+1)+'</div>'
      +'<img class="rank-logo" src="'+esc(logoSrc(f.team))+'" alt="'+esc(f.team)+' logo" onerror="this.classList.add(\'hidden\')">'
      +'<div class="rank-body"><div class="rank-name">'+esc(f.team)+'</div><div class="rank-stats">'+recordStr+ploStr+'</div></div>'
      +'<div class="rank-trophies">'+trophies+runners+'</div></div>';
  }

  function render(data){
    var franchises=data&&data.franchises;
    if(!franchises||!franchises.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var html='<div class="rank-list">'+franchises.map(renderRow).join('')+'</div>';
    var meta=data.meta,fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    if(fetchedAt)html+='<div class="freshness">'+esc(fetchedAt)+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||(p.franchises?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.franchises)return r.structuredContent;if(r.franchises)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.franchises)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.franchises)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.franchises)return msg.result.structuredContent;
    if(msg.franchises)return msg;
    if(msg.data&&msg.data.franchises)return msg.data;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.franchises)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){
    console.error('[franchise-case] render error:',error);
    document.getElementById('state-loading').style.display='none';
    var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex';
  }

  function renderCandidate(candidate){
    var data=tryExtractData(candidate)||candidate;
    if(!data||typeof data!=='object'||!data.franchises)return false;
    try{render(data);return true}catch(error){showRenderError(error);return false}
  }

  function handleMessage(event){
    if(event.source&&event.source!==window.parent&&event.source!==window.top)return;
    var data=tryExtractData(event.data);if(data!==null)renderCandidate(data);
  }

  function initializeFromOpenAI(){
    try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[franchise-case] window.openai fallback unavailable:',error)}
  }

  function handleOpenAIGlobals(event){
    try{
      var detail=event&&event.detail;
      var globals=detail&&detail.globals?detail.globals:detail;
      if(!globals||typeof globals!=='object')return;
      var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;
      renderCandidate(candidate);
    }catch(error){console.warn('[franchise-case] openai:set_globals handling failed:',error)}
  }

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'franchise-case-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const FRANCHISE_CASE_RESOURCE = {
  uri: FRANCHISE_CASE_WIDGET_URI,
  name: 'East v. West Franchise Trophy Case',
  mimeType: 'text/html;profile=mcp-app' as const,
};

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
  function trophyIcon(){return'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3h3v3c0 3.31-2.69 6-6 6h-1v3h4v3H7v-3h4v-3h-1c-3.31 0-6-2.69-6-6V6h3V3Zm10 5v4.83A4 4 0 0 0 18 9V8h-1ZM6 8v1a4 4 0 0 0 1 2.65V8H6Z"/></svg>'}
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Franchise Trophy Case</div><div class="widget-subtitle">All-time records, playoff success and championships</div></div></div><span class="status-pill">League history</span></div>'}
  function podiumClass(idx){return idx===0?'first':idx===1?'second':'third'}
  function renderPodium(f,idx){
    var reg=f.regularSeason,record=reg.wins+'-'+reg.losses+(reg.ties?'-'+reg.ties+'T':'');
    return'<div class="podium-card '+podiumClass(idx)+'"><div class="rank-crown">#'+(idx+1)+'</div><span class="team-logo-frame"><img src="'+esc(logoSrc(f.team))+'" alt="'+esc(f.team)+' logo" onerror="this.classList.add(\'hidden\')"></span><div><div class="podium-name">'+esc(f.team)+'</div><div class="podium-record">'+record+' · '+Number(reg.winPct||0).toFixed(1)+'%</div><div class="runner-up">'+f.runnerUps+' runner-up'+(f.runnerUps===1?'':'s')+'</div></div><div class="trophy-count">'+trophyIcon()+f.championships+'</div></div>';
  }
  function renderRow(f,idx){
    var reg=f.regularSeason,record=reg.wins+'-'+reg.losses+(reg.ties?'-'+reg.ties+'T':'');
    return'<div class="rank-row"><div class="rank-num">'+(idx+1)+'</div><span class="team-logo-frame"><img src="'+esc(logoSrc(f.team))+'" alt="'+esc(f.team)+' logo" onerror="this.classList.add(\'hidden\')"></span><div><div class="rank-name">'+esc(f.team)+'</div><div class="rank-stats">'+record+' · '+Number(reg.winPct||0).toFixed(1)+'% · Playoffs '+f.playoffs.wins+'-'+f.playoffs.losses+'</div></div><div class="rank-achievements"><div class="titles">'+f.championships+' title'+(f.championships===1?'':'s')+'</div><div class="seconds">'+f.runnerUps+' runner-up'+(f.runnerUps===1?'':'s')+'</div></div></div>';
  }
  function render(data){
    var franchises=data&&data.franchises;
    if(!franchises||!franchises.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var top=franchises.slice(0,3),rest=franchises.slice(3);
    var podium='<div class="podium">'+top.map(renderPodium).join('')+'</div>';
    var list=rest.length?'<div class="rank-list">'+rest.map(function(f,i){return renderRow(f,i+3)}).join('')+'</div>':'';
    var meta=data.meta,fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">Franchise history · '+esc(fetchedAt)+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="franchise-body">'+podium+list+'</div>'+freshness+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }
  function tryExtractData(msg){if(!msg||typeof msg!=='object')return null;if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||(p.franchises?p:null);if(d1)return d1}if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.franchises)return r.structuredContent;if(r.franchises)return r}if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.franchises)return msg.data;if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.franchises)return msg.structuredContent;if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.franchises)return msg.result.structuredContent;if(msg.franchises)return msg;if(msg.data&&msg.data.franchises)return msg.data;if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.franchises)return msg.params.structuredContent;return null}
  function showRenderError(error){console.error('[franchise-case] render error:',error);document.getElementById('state-loading').style.display='none';var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex'}
  function renderCandidate(candidate){var data=tryExtractData(candidate)||candidate;if(!data||typeof data!=='object'||!data.franchises)return false;try{render(data);return true}catch(error){showRenderError(error);return false}}
  function handleMessage(event){if(event.source&&event.source!==window.parent&&event.source!==window.top)return;var data=tryExtractData(event.data);if(data!==null)renderCandidate(data)}
  function initializeFromOpenAI(){try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[franchise-case] window.openai fallback unavailable:',error)}}
  function handleOpenAIGlobals(event){try{var detail=event&&event.detail;var globals=detail&&detail.globals?detail.globals:detail;if(!globals||typeof globals!=='object')return;var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;renderCandidate(candidate)}catch(error){console.warn('[franchise-case] openai:set_globals handling failed:',error)}}
  window.addEventListener('message',handleMessage);window.addEventListener('openai:set_globals',handleOpenAIGlobals);initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'franchise-case-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const FRANCHISE_CASE_RESOURCE = { uri: FRANCHISE_CASE_WIDGET_URI, name: 'East v. West Franchise Trophy Case', mimeType: 'text/html;profile=mcp-app' as const };

import { DRAFT_BOARD_WIDGET_URI } from './draft-board-contract';
import { BASE_URL, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { DRAFT_BOARD_STYLE } from './draft-board-style';

export const DRAFT_BOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Draft Board</title>
<style>${WIDGET_BASE_STYLE}${DRAFT_BOARD_STYLE}</style>
</head>
<body>
<div id="state-loading">Loading draft board…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No draft history available.</div>
<div id="card"></div>
<script>
(function(){
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;
  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Draft Board</div><div class="widget-subtitle">Round-by-round league draft results</div></div></div><span class="status-pill">Archive</span></div>'}
  function groupByRound(picks){var g={};picks.forEach(function(p){var r=p.round;if(!g[r])g[r]=[];g[r].push(p)});return g}
  function renderPick(p){
    var selected=!!p.player;
    return'<div class="draft-row"><div><span class="pick-number">'+p.round+'.'+String(p.pick).padStart(2,'0')+'</span></div><div class="draft-team"><span class="team-logo-frame"><img src="'+esc(logoSrc(p.team))+'" alt="'+esc(p.team)+' logo" onerror="this.classList.add(\'hidden\')"></span><span class="draft-team-name">'+esc(p.team)+'</span></div><div class="selection'+(selected?'':' unselected')+'"><div class="selection-name">'+(selected?esc(p.player):'Unselected')+'</div><div class="selection-meta">'+(p.position?esc(p.position):'Awaiting selection')+'</div></div></div>';
  }
  function renderSeason(season,picks){
    var grouped=groupByRound(picks),rounds=Object.keys(grouped).map(Number).sort(function(a,b){return a-b});
    var body=rounds.map(function(round){
      var sorted=grouped[round].slice().sort(function(a,b){return a.pick-b.pick});
      return'<div class="round-section"><div class="round-label">Round '+round+'</div><div class="scroll-x"><div class="draft-table"><div class="draft-head"><span>Pick</span><span>Team</span><span>Selection</span></div>'+sorted.map(renderPick).join('')+'</div></div></div>';
    }).join('');
    return'<div class="season-block"><div class="season-head"><div class="season-title">'+esc(season)+' Draft</div><div class="season-count">'+picks.length+' selections</div></div>'+body+'</div>';
  }
  function render(data){
    var historicalPicks=data&&data.historicalPicks,seasons=historicalPicks?Object.keys(historicalPicks).sort(function(a,b){return b.localeCompare(a)}):[];
    if(!seasons.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var boards=seasons.map(function(season){return renderSeason(season,historicalPicks[season])}).join('');
    var meta=data.meta,fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">Draft history · '+esc(fetchedAt)+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="draft-body">'+boards+'</div>'+freshness+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }
  function tryExtractData(msg){if(!msg||typeof msg!=='object')return null;if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||(p.historicalPicks?p:null);if(d1)return d1}if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.historicalPicks)return r.structuredContent;if(r.historicalPicks)return r}if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.historicalPicks)return msg.data;if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.historicalPicks)return msg.structuredContent;if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.historicalPicks)return msg.result.structuredContent;if(msg.historicalPicks)return msg;if(msg.data&&msg.data.historicalPicks)return msg.data;if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.historicalPicks)return msg.params.structuredContent;return null}
  function showRenderError(error){console.error('[draft-board] render error:',error);document.getElementById('state-loading').style.display='none';var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex'}
  function renderCandidate(candidate){var data=tryExtractData(candidate)||candidate;if(!data||typeof data!=='object'||!data.historicalPicks)return false;try{render(data);return true}catch(error){showRenderError(error);return false}}
  function handleMessage(event){if(event.source&&event.source!==window.parent&&event.source!==window.top)return;var data=tryExtractData(event.data);if(data!==null)renderCandidate(data)}
  function initializeFromOpenAI(){try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[draft-board] window.openai fallback unavailable:',error)}}
  function handleOpenAIGlobals(event){try{var detail=event&&event.detail;var globals=detail&&detail.globals?detail.globals:detail;if(!globals||typeof globals!=='object')return;var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;renderCandidate(candidate)}catch(error){console.warn('[draft-board] openai:set_globals handling failed:',error)}}
  window.addEventListener('message',handleMessage);window.addEventListener('openai:set_globals',handleOpenAIGlobals);initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'draft-board-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const DRAFT_BOARD_RESOURCE = { uri: DRAFT_BOARD_WIDGET_URI, name: 'East v. West Draft Board', mimeType: 'text/html;profile=mcp-app' as const };

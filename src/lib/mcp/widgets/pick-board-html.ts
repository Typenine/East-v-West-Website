import { PICK_BOARD_WIDGET_URI } from './pick-board-contract';
import { BASE_URL, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { PICK_BOARD_STYLE } from './pick-board-style';

export const PICK_BOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Future Pick Board</title>
<style>${WIDGET_BASE_STYLE}${PICK_BOARD_STYLE}</style>
</head>
<body>
<div id="state-loading">Loading future pick board…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No future pick data available.</div>
<div id="card"></div>
<script>
(function(){
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;
  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Future Pick Board</div><div class="widget-subtitle">Draft capital organized by season and franchise</div></div></div><span class="status-pill">Dynasty assets</span></div>'}
  function roundLabel(round){if(round===1)return'1st';if(round===2)return'2nd';if(round===3)return'3rd';return round+'th'}
  function pickChip(p){var via=p.traded&&p.originalTeam!==p.currentOwner?'<span class="via">via '+esc(p.originalTeam)+'</span>':'';return'<span class="pick-chip'+(p.traded?' acquired':'')+'"><span class="round">'+roundLabel(p.round)+'</span><span>'+esc(p.display)+'</span>'+via+'</span>'}
  function groupByYear(board){
    var years={};
    board.forEach(function(team){(team.picks||[]).forEach(function(p){if(!years[p.season])years[p.season]=[];var entry=years[p.season].find(function(x){return x.teamName===team.teamName});if(!entry){entry={teamName:team.teamName,rosterId:team.rosterId,picks:[]};years[p.season].push(entry)}entry.picks.push(p)})});
    return years;
  }
  function renderYear(year,teams){
    teams.sort(function(a,b){return a.teamName.localeCompare(b.teamName)});
    var total=teams.reduce(function(sum,t){return sum+t.picks.length},0);
    var rows=teams.map(function(t){
      var firsts=t.picks.filter(function(p){return p.round===1}).length;
      return'<div class="team-pick-row"><div class="pick-team"><span class="team-logo-frame"><img src="'+esc(logoSrc(t.teamName))+'" alt="'+esc(t.teamName)+' logo" onerror="this.classList.add(\'hidden\')"></span><div><div class="pick-team-name">'+esc(t.teamName)+'</div><div class="pick-team-meta">'+t.picks.length+' picks · '+firsts+' first-round</div></div></div><div class="pick-chips">'+t.picks.sort(function(a,b){return a.round-b.round}).map(pickChip).join('')+'</div></div>';
    }).join('');
    return'<div class="year-section"><div class="year-head"><div class="year-title">'+esc(year)+' Picks</div><div class="year-count">'+total+' total assets</div></div>'+rows+'</div>';
  }
  function render(data){
    var d=data&&data.data,board=d&&d.board;
    if(!d||!board||!board.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var grouped=groupByYear(board),years=Object.keys(grouped).sort();
    if(!years.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var sections=years.map(function(year){return renderYear(year,grouped[year])}).join('');
    var fetchedAt=d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">'+esc(d.leagueNote||'')+' · '+esc(fetchedAt)+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="pick-body">'+sections+'</div>'+freshness+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }
  function tryExtractData(msg){if(!msg||typeof msg!=='object')return null;if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.board)?p:null);if(d1)return d1}if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.board)return r.structuredContent;if(r.data&&r.data.board)return r}if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.board)return msg.data;if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.board)return msg.structuredContent;if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.board)return msg.result.structuredContent;if(msg.data&&msg.data.board)return msg;if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.board)return msg.params.structuredContent;return null}
  function showRenderError(error){console.error('[pick-board] render error:',error);document.getElementById('state-loading').style.display='none';var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex'}
  function renderCandidate(candidate){var data=tryExtractData(candidate)||candidate;if(!data||typeof data!=='object'||!data.data)return false;try{render(data);return true}catch(error){showRenderError(error);return false}}
  function handleMessage(event){if(event.source&&event.source!==window.parent&&event.source!==window.top)return;var data=tryExtractData(event.data);if(data!==null)renderCandidate(data)}
  function initializeFromOpenAI(){try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[pick-board] window.openai fallback unavailable:',error)}}
  function handleOpenAIGlobals(event){try{var detail=event&&event.detail;var globals=detail&&detail.globals?detail.globals:detail;if(!globals||typeof globals!=='object')return;var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;renderCandidate(candidate)}catch(error){console.warn('[pick-board] openai:set_globals handling failed:',error)}}
  window.addEventListener('message',handleMessage);window.addEventListener('openai:set_globals',handleOpenAIGlobals);initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'pick-board-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const PICK_BOARD_RESOURCE = { uri: PICK_BOARD_WIDGET_URI, name: 'East v. West Future Pick Board', mimeType: 'text/html;profile=mcp-app' as const };

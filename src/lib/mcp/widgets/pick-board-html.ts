import { PICK_BOARD_WIDGET_URI } from './pick-board-contract';
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
  var hasRendered=false;

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

  function renderTeam(t){
    var head='<div class="team-block-head"><span class="name">'+esc(t.teamName)+'</span><span class="counts">'+t.totalPicks+' picks · '+t.firstRoundPicks+' 1sts'+(t.tradedPicksOwned?' · '+t.tradedPicksOwned+' traded-in':'')+'</span></div>';
    var chips=(t.picks||[]).map(function(p){
      var cls=p.traded?'pick-chip traded':'pick-chip';
      return'<span class="'+cls+'">'+esc(p.display)+'</span>';
    }).join('');
    if(!chips)chips='<span class="pick-chip">No picks</span>';
    return'<div class="team-block">'+head+'<div class="pick-chips">'+chips+'</div></div>';
  }

  function render(data){
    var d=data&&data.data,board=d&&d.board;
    if(!d||!board||!board.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var html='<div class="board">'+board.map(renderTeam).join('')+'</div>';
    var fetchedAt=d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    if(fetchedAt)html+='<div class="freshness">'+esc(fetchedAt)+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.board)?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.board)return r.structuredContent;if(r.data&&r.data.board)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.board)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.board)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.board)return msg.result.structuredContent;
    if(msg.data&&msg.data.board)return msg;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.board)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){
    console.error('[pick-board] render error:',error);
    document.getElementById('state-loading').style.display='none';
    var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex';
  }

  function renderCandidate(candidate){
    var data=tryExtractData(candidate)||candidate;
    if(!data||typeof data!=='object'||!data.data)return false;
    try{render(data);return true}catch(error){showRenderError(error);return false}
  }

  function handleMessage(event){
    if(event.source&&event.source!==window.parent&&event.source!==window.top)return;
    var data=tryExtractData(event.data);if(data!==null)renderCandidate(data);
  }

  function initializeFromOpenAI(){
    try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[pick-board] window.openai fallback unavailable:',error)}
  }

  function handleOpenAIGlobals(event){
    try{
      var detail=event&&event.detail;
      var globals=detail&&detail.globals?detail.globals:detail;
      if(!globals||typeof globals!=='object')return;
      var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;
      renderCandidate(candidate);
    }catch(error){console.warn('[pick-board] openai:set_globals handling failed:',error)}
  }

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'pick-board-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const PICK_BOARD_RESOURCE = {
  uri: PICK_BOARD_WIDGET_URI,
  name: 'East v. West Future Pick Board',
  mimeType: 'text/html;profile=mcp-app' as const,
};

import { TRADE_BLOCK_WIDGET_URI } from './trade-block-contract';
import { BASE_URL, COLOR_MAP_JSON, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { TRADE_BLOCK_STYLE } from './trade-block-style';

export const TRADE_BLOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Trade Block</title>
<style>${WIDGET_BASE_STYLE}${TRADE_BLOCK_STYLE}</style>
</head>
<body>
<div id="state-loading">Loading trade block…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No teams currently have assets on the trade block.</div>
<div id="card"></div>
<script>
(function(){
  var COLOR_MAP=${COLOR_MAP_JSON};
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;

  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function teamColor(name){var c=COLOR_MAP[name]||{primary:'#4f8cff'};return c.primary}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Trade Block</div><div class="widget-subtitle">Available players, picks and FAAB by franchise</div></div></div><span class="status-pill"><span class="pulse"></span>Current</span></div>'}

  function renderAsset(a){
    if(a.type==='player'){
      var pos=a.position?esc(a.position):'?';
      var nfl=a.nflTeam?' · '+esc(a.nflTeam):'';
      var inj=a.injuryStatus?' · '+esc(a.injuryStatus):'';
      return'<span class="asset-chip player"><span class="asset-type">'+pos+'</span>'+esc(a.name)+nfl+inj+'</span>';
    }
    if(a.type==='pick')return'<span class="asset-chip pick"><span class="asset-type">Pick</span>'+esc(a.display)+'</span>';
    return'<span class="asset-chip faab"><span class="asset-type">FAAB</span>'+esc(a.display)+'</span>';
  }

  function renderTeamCard(t){
    var assets=t.assets&&t.assets.length?t.assets.map(renderAsset).join(''):'<div class="empty-block">No assets listed.</div>';
    var wants='';
    if(t.wants||t.wantedPositions&&t.wantedPositions.length){
      wants='<div class="card-section"><div class="wants-box">';
      if(t.wants)wants+='<div class="wants-line"><strong>Wants</strong>'+esc(t.wants)+'</div>';
      if(t.wantedPositions&&t.wantedPositions.length)wants+='<div class="wants-line"><strong>Positions</strong>'+esc(t.wantedPositions.join(', '))+'</div>';
      wants+='</div></div>';
    }
    var updated=t.updatedAt?new Date(t.updatedAt).toLocaleDateString():'';
    return'<div class="team-card" style="--team-accent:'+esc(teamColor(t.team))+'"><div class="team-card-head"><span class="team-logo-frame"><img src="'+esc(logoSrc(t.team))+'" alt="'+esc(t.team)+' logo" onerror="this.classList.add(\'hidden\')"></span><div><div class="team-name">'+esc(t.team)+'</div><div class="team-count">'+t.assetCount+' asset'+(t.assetCount===1?'':'s')+' available</div></div><div class="updated">'+(updated?'Updated '+esc(updated):'')+'</div></div><div class="card-section"><div class="section-heading"><span class="section-kicker">Available</span></div><div class="asset-chips">'+assets+'</div></div>'+wants+'</div>';
  }

  function render(data){
    var d=data&&data.data,teams=d&&d.teams;
    if(!d||!teams||!teams.length){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var summary='<div class="summary-bar"><strong>'+d.teamsWithAssets+' team'+(d.teamsWithAssets===1?'':'s')+' actively shopping</strong><span>'+(d.teamFilter?'Filtered to '+esc(d.teamFilter):'League-wide board')+'</span></div>';
    var board='<div class="team-grid">'+teams.map(renderTeamCard).join('')+'</div>';
    var fetchedAt=d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">Trade block data · '+esc(fetchedAt)+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="trade-block-body">'+summary+board+'</div>'+freshness+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.teams)?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.teams)return r.structuredContent;if(r.data&&r.data.teams)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.teams)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.teams)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.teams)return msg.result.structuredContent;
    if(msg.data&&msg.data.teams)return msg;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.teams)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){console.error('[trade-block] render error:',error);document.getElementById('state-loading').style.display='none';var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex'}
  function renderCandidate(candidate){var data=tryExtractData(candidate)||candidate;if(!data||typeof data!=='object'||!data.data)return false;try{render(data);return true}catch(error){showRenderError(error);return false}}
  function handleMessage(event){if(event.source&&event.source!==window.parent&&event.source!==window.top)return;var data=tryExtractData(event.data);if(data!==null)renderCandidate(data)}
  function initializeFromOpenAI(){try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[trade-block] window.openai fallback unavailable:',error)}}
  function handleOpenAIGlobals(event){try{var detail=event&&event.detail;var globals=detail&&detail.globals?detail.globals:detail;if(!globals||typeof globals!=='object')return;var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;renderCandidate(candidate)}catch(error){console.warn('[trade-block] openai:set_globals handling failed:',error)}}

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'trade-block-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const TRADE_BLOCK_RESOURCE = {
  uri: TRADE_BLOCK_WIDGET_URI,
  name: 'East v. West Trade Block',
  mimeType: 'text/html;profile=mcp-app' as const,
};

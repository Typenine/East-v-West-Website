import { TRADE_ANALYZER_WIDGET_URI } from './trade-analyzer-contract';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { TRADE_ANALYZER_STYLE } from './trade-analyzer-style';

export const TRADE_ANALYZER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Trade Analyzer</title>
<style>${WIDGET_BASE_STYLE}${TRADE_ANALYZER_STYLE}</style>
</head>
<body>
<div id="state-loading">Analyzing trade…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No trade data available.</div>
<div id="card"></div>
<script>
(function(){
  var hasRendered=false;

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function fmtNum(n){return Math.round(n||0).toLocaleString()}
  function gradeClass(g){if(!g||g==='—')return'grade-none';return'grade-'+g.charAt(0)}

  function renderAssets(assets){
    if(!assets||!assets.length)return'<div class="asset-row"><span class="asset-meta">No assets</span></div>';
    return assets.map(function(a){
      var trend=a.trend>100?' ↑':a.trend<-100?' ↓':'';
      var posLabel=a.isPick?'PICK':(a.position||'?');
      var meta=esc(posLabel)+(a.nflTeam?' · '+esc(a.nflTeam):'');
      return'<div class="asset-row"><div><div class="asset-name">'+esc(a.name)+'</div><div class="asset-meta">'+meta+'</div></div><div class="asset-val">'+fmtNum(a.value)+trend+'</div></div>';
    }).join('');
  }

  function renderSide(label,side,barClass,maxVal){
    var pct=maxVal>0?Math.max(4,Math.round((side.effectiveTotal/maxVal)*100)):0;
    return'<div class="side"><div class="side-head"><span class="label">'+esc(label)+'</span><span class="grade '+gradeClass(side.grade)+'">'+esc(side.grade)+'</span></div>'
      +'<div class="value-total">'+fmtNum(side.effectiveTotal)+'</div>'
      +'<div class="value-sub">Raw '+fmtNum(side.rawTotal)+' · '+esc(side.posSummary||'—')+'</div>'
      +'<div class="value-bar-track"><div class="value-bar-fill '+barClass+'" style="width:'+pct+'%"></div></div>'
      +renderAssets(side.assets)+'</div>';
  }

  function render(data){
    var analysis=data&&data.analysis,sideA=data&&data.sideA,sideB=data&&data.sideB,unmatched=(data&&data.unmatched)||{},meta=data&&data.meta;
    if(!analysis||!sideA||!sideB){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var maxVal=Math.max(sideA.effectiveTotal,sideB.effectiveTotal,1);
    var winnerText=analysis.winner?'Side '+analysis.winner+' wins by ~'+fmtNum(analysis.diff)+' pts':'Fair trade';
    var html='<div class="verdict-banner"><div class="verdict">'+esc(analysis.verdict)+'</div><div class="sub">'+esc(winnerText)+'</div></div>'
      +'<div class="sides">'+renderSide('Side A',sideA,'a',maxVal)+renderSide('Side B',sideB,'b',maxVal)+'</div>';
    if((analysis.notes&&analysis.notes.length)||analysis.counterHint){
      var notesHtml='<div class="notes">';
      (analysis.notes||[]).forEach(function(n){notesHtml+='<div class="note">'+esc(n)+'</div>'});
      if(analysis.counterHint)notesHtml+='<div class="counter">'+esc(analysis.counterHint)+'</div>';
      notesHtml+='</div>';
      html+=notesHtml;
    }
    var allUnmatched=[].concat(unmatched.sideA||[],unmatched.sideB||[]);
    if(allUnmatched.length)html+='<div class="unmatched">Could not find values for: '+esc(allUnmatched.join(', '))+'</div>';
    var fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    if(fetchedAt)html+='<div class="freshness">'+esc(meta.valueSources||'')+' · '+esc(fetchedAt)+'</div>';
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||(p.analysis&&p.sideA?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.analysis)return r.structuredContent;if(r.analysis&&r.sideA)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.analysis)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.analysis)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.analysis)return msg.result.structuredContent;
    if(msg.analysis&&msg.sideA)return msg;
    if(msg.data&&msg.data.analysis&&msg.data.sideA)return msg.data;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.analysis)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){
    console.error('[trade-analyzer] render error:',error);
    document.getElementById('state-loading').style.display='none';
    var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex';
  }

  function renderCandidate(candidate){
    var data=tryExtractData(candidate)||candidate;
    if(!data||typeof data!=='object'||!data.analysis)return false;
    try{render(data);return true}catch(error){showRenderError(error);return false}
  }

  function handleMessage(event){
    if(event.source&&event.source!==window.parent&&event.source!==window.top)return;
    var data=tryExtractData(event.data);if(data!==null)renderCandidate(data);
  }

  function initializeFromOpenAI(){
    try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[trade-analyzer] window.openai fallback unavailable:',error)}
  }

  function handleOpenAIGlobals(event){
    try{
      var detail=event&&event.detail;
      var globals=detail&&detail.globals?detail.globals:detail;
      if(!globals||typeof globals!=='object')return;
      var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;
      renderCandidate(candidate);
    }catch(error){console.warn('[trade-analyzer] openai:set_globals handling failed:',error)}
  }

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'trade-analyzer-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const TRADE_ANALYZER_RESOURCE = {
  uri: TRADE_ANALYZER_WIDGET_URI,
  name: 'East v. West Trade Analyzer',
  mimeType: 'text/html;profile=mcp-app' as const,
};

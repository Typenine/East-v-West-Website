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
  function shellHeader(){return'<div class="widget-topline"><div class="league-lockup"><span class="league-mark"><span></span><span></span></span><div><div class="widget-eyebrow">East v. West</div><div class="widget-title">Trade Analyzer</div><div class="widget-subtitle">Dynasty value comparison and deal balance</div></div></div><span class="status-pill"><span class="pulse"></span>Live values</span></div>'}

  function renderAssets(assets){
    if(!assets||!assets.length)return'<div class="asset-row"><div class="asset-meta">No assets</div></div>';
    return assets.map(function(a){
      var trend=a.trend>100?'<span class="trend-up">▲</span>':a.trend<-100?'<span class="trend-down">▼</span>':'';
      var posLabel=a.isPick?'PICK':(a.position||'?');
      var meta=esc(posLabel)+(a.nflTeam?' · '+esc(a.nflTeam):'');
      return'<div class="asset-row"><div><div class="asset-name">'+esc(a.name)+'</div><div class="asset-meta">'+meta+'</div></div><div class="asset-value">'+fmtNum(a.value)+' '+trend+'</div></div>';
    }).join('');
  }

  function renderSide(label,side,cls){
    return'<div class="trade-side '+cls+'"><div class="side-summary"><div><div class="side-label">'+esc(label)+'</div><div class="side-total">'+fmtNum(side.effectiveTotal)+'</div><div class="side-sub">Raw '+fmtNum(side.rawTotal)+' · '+esc(side.posSummary||'—')+'</div></div><div class="grade-badge '+gradeClass(side.grade)+'">'+esc(side.grade)+'</div></div><div class="asset-list">'+renderAssets(side.assets)+'</div></div>';
  }

  function render(data){
    var analysis=data&&data.analysis,sideA=data&&data.sideA,sideB=data&&data.sideB,unmatched=(data&&data.unmatched)||{},meta=data&&data.meta;
    if(!analysis||!sideA||!sideB){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var total=Math.max(1,sideA.effectiveTotal+sideB.effectiveTotal);
    var marker=Math.max(8,Math.min(92,(sideB.effectiveTotal/total)*100));
    var winnerText=analysis.winner?'Side '+analysis.winner+' leads by approximately '+fmtNum(analysis.diff)+' value points':'Values are effectively even';
    var verdict='<div class="verdict-card"><div class="eyebrow">Trade Verdict</div><div class="verdict">'+esc(analysis.verdict)+'</div><div class="sub">'+esc(winnerText)+'</div></div>';
    var balance='<div class="balance-wrap"><div class="balance-labels"><span>Side A advantage</span><span>Fair range</span><span>Side B advantage</span></div><div class="balance-track"><span class="balance-marker" style="left:'+marker+'%"></span></div></div>';
    var sides='<div class="trade-sides">'+renderSide('Side A',sideA,'side-a')+renderSide('Side B',sideB,'side-b')+'</div>';
    var notes='';
    if((analysis.notes&&analysis.notes.length)||analysis.counterHint){
      notes='<div class="analysis-notes">';
      (analysis.notes||[]).forEach(function(n){notes+='<div class="note-card">'+esc(n)+'</div>'});
      if(analysis.counterHint)notes+='<div class="note-card counter-card">Counter idea: '+esc(analysis.counterHint)+'</div>';
      notes+='</div>';
    }
    var allUnmatched=[].concat(unmatched.sideA||[],unmatched.sideB||[]);
    var missing=allUnmatched.length?'<div class="unmatched">Could not find values for: '+esc(allUnmatched.join(', '))+'</div>':'';
    var fetchedAt=meta&&meta.fetchedAt?new Date(meta.fetchedAt).toLocaleTimeString():'';
    var freshness=fetchedAt?'<div class="freshness">'+esc(meta.valueSources||'')+' · '+esc(fetchedAt)+'</div>':'';
    var html='<div class="widget-shell">'+shellHeader()+'<div class="trade-body">'+verdict+balance+sides+notes+missing+'</div>'+freshness+'</div>';
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

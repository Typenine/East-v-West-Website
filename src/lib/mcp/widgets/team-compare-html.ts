import { TEAM_COMPARE_WIDGET_URI } from './team-compare-contract';
import { BASE_URL, COLOR_MAP_JSON, LOGO_MAP_JSON } from './team-card-assets';
import { WIDGET_BASE_STYLE } from './widget-base-style';
import { TEAM_COMPARE_STYLE } from './team-compare-style';

export const TEAM_COMPARE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>East v. West Team Compare</title>
<style>${WIDGET_BASE_STYLE}${TEAM_COMPARE_STYLE}</style>
</head>
<body>
<div id="state-loading">Comparing teams…</div>
<div id="state-error" style="display:none"></div>
<div id="state-empty" style="display:none">No comparison data available.</div>
<div id="card"></div>
<script>
(function(){
  var COLOR_MAP=${COLOR_MAP_JSON};
  var LOGO_FILE_MAP=${LOGO_MAP_JSON};
  var BASE='${BASE_URL}';
  var hasRendered=false;
  var POS_ORDER=['QB','RB','WR','TE','K','DST','DL','LB','DB','FLEX','SUPER_FLEX','BN'];

  function logoSrc(name){var f=LOGO_FILE_MAP[name]||(name+'.png');return BASE+'/assets/teams/East%20v%20West%20Logos/'+encodeURIComponent(f)}
  function teamColors(name){return COLOR_MAP[name]||{primary:'#3b5b8b',secondary:'#ba1010'}}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

  function cmpRow(label,v1,v2,text1,text2,higherWins){
    var win1='',win2='';
    if(higherWins!==null&&v1!==v2){
      if(higherWins?v1>v2:v1<v2)win1=' win';else win2=' win';
    }
    return'<div class="cmp-row"><div class="cmp-val left'+win1+'">'+esc(text1)+'</div><div class="cmp-lbl">'+esc(label)+'</div><div class="cmp-val right'+win2+'">'+esc(text2)+'</div></div>';
  }

  function posCounts(positionRooms){
    var keys=Object.keys(positionRooms||{}).sort(function(a,b){var ai=POS_ORDER.indexOf(a),bi=POS_ORDER.indexOf(b);if(ai===-1&&bi===-1)return a.localeCompare(b);if(ai===-1)return 1;if(bi===-1)return-1;return ai-bi});
    return keys.map(function(pos){return'<div class="pos-row"><span>'+esc(pos)+'</span><span class="cnt">'+(positionRooms[pos]||[]).length+'</span></div>'}).join('');
  }

  function render(data){
    var d=data&&data.data,team1=d&&d.team1,team2=d&&d.team2;
    if(!team1||!team2){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex';return}
    var c1=teamColors(team1.teamName),c2=teamColors(team2.teamName);
    var headHtml='<div class="headers">'
      +'<div class="team-head" style="background:linear-gradient(135deg,'+c1.primary+' 0%,'+c1.secondary+' 100%)"><img src="'+esc(logoSrc(team1.teamName))+'" alt="'+esc(team1.teamName)+' logo" onerror="this.classList.add(\'hidden\')"><span class="name">'+esc(team1.teamName)+'</span></div>'
      +'<div class="team-head" style="background:linear-gradient(135deg,'+c2.primary+' 0%,'+c2.secondary+' 100%)"><img src="'+esc(logoSrc(team2.teamName))+'" alt="'+esc(team2.teamName)+' logo" onerror="this.classList.add(\'hidden\')"><span class="name">'+esc(team2.teamName)+'</span></div>'
      +'</div>';

    var s1=team1.currentSeason,s2=team2.currentSeason;
    var rec1=s1.wins+'-'+s1.losses+(s1.ties?'/'+s1.ties+'T':''),rec2=s2.wins+'-'+s2.losses+(s2.ties?'/'+s2.ties+'T':'');
    var at1=team1.allTimeStats&&team1.allTimeStats.regularSeason,at2=team2.allTimeStats&&team2.allTimeStats.regularSeason;
    var atText1=at1?(at1.wins+'-'+at1.losses):'—',atText2=at2?(at2.wins+'-'+at2.losses):'—';

    var tableHtml='<div class="cmp-table">'
      +cmpRow('Record',s1.wins,s2.wins,rec1,rec2,true)
      +cmpRow('Points For',s1.pf,s2.pf,s1.pf.toFixed(1),s2.pf.toFixed(1),true)
      +cmpRow('Points Against',s1.pa,s2.pa,s1.pa.toFixed(1),s2.pa.toFixed(1),false)
      +cmpRow('All-Time',at1?at1.wins:0,at2?at2.wins:0,atText1,atText2,true)
      +cmpRow('Championships',team1.championships,team2.championships,String(team1.championships),String(team2.championships),true)
      +'</div>';

    var roomsHtml='<div class="section"><div class="section-title">Roster by Position</div><div class="pos-rooms">'
      +'<div class="pos-list">'+posCounts(team1.positionRooms)+'</div>'
      +'<div class="pos-list">'+posCounts(team2.positionRooms)+'</div>'
      +'</div></div>';

    var ir1=(team1.roster&&team1.roster.ir&&team1.roster.ir.length)||0,taxi1=(team1.roster&&team1.roster.taxi&&team1.roster.taxi.length)||0;
    var ir2=(team2.roster&&team2.roster.ir&&team2.roster.ir.length)||0,taxi2=(team2.roster&&team2.roster.taxi&&team2.roster.taxi.length)||0;
    var reserveHtml='<div class="section"><div class="section-title">Reserve Slots</div>'
      +cmpRow('IR',ir1,ir2,String(ir1),String(ir2),null)
      +cmpRow('Taxi',taxi1,taxi2,String(taxi1),String(taxi2),null)
      +'</div>';

    var fetchedAt=d&&d.fetchedAt?new Date(d.fetchedAt).toLocaleTimeString():'';
    var freshnessHtml=fetchedAt?'<div class="freshness">Live from Sleeper · '+esc(fetchedAt)+'</div>':'';

    var html=headHtml+tableHtml+roomsHtml+reserveHtml+freshnessHtml;
    var card=document.getElementById('card');card.innerHTML=html;card.style.display='block';document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='none';hasRendered=true;
  }

  function tryExtractData(msg){
    if(!msg||typeof msg!=='object')return null;
    if(msg.jsonrpc==='2.0'&&msg.method==='ui/notifications/tool-result'){var p=msg.params||{};var d1=p.structuredContent||((p.data&&p.data.team1)?p:null);if(d1)return d1}
    if(msg.type==='tool_result'||msg.type==='mcp_tool_result'){var r=msg.result||msg;if(r.structuredContent&&r.structuredContent.data&&r.structuredContent.data.team1)return r.structuredContent;if(r.data&&r.data.team1)return r}
    if(msg.type==='app_action'&&msg.action==='set_data'&&msg.data&&msg.data.data&&msg.data.data.team1)return msg.data;
    if(msg.structuredContent&&typeof msg.structuredContent==='object'&&msg.structuredContent.data&&msg.structuredContent.data.team1)return msg.structuredContent;
    if(msg.result&&msg.result.structuredContent&&msg.result.structuredContent.data&&msg.result.structuredContent.data.team1)return msg.result.structuredContent;
    if(msg.data&&msg.data.team1&&msg.data.team2)return msg;
    if(msg.params&&msg.params.structuredContent&&msg.params.structuredContent.data&&msg.params.structuredContent.data.team1)return msg.params.structuredContent;
    return null;
  }

  function showRenderError(error){
    console.error('[team-compare] render error:',error);
    document.getElementById('state-loading').style.display='none';
    var el=document.getElementById('state-error');el.textContent='Widget error: '+String(error);el.style.display='flex';
  }

  function renderCandidate(candidate){
    var data=tryExtractData(candidate)||candidate;
    if(!data||typeof data!=='object'||!data.data||!data.data.team1)return false;
    try{render(data);return true}catch(error){showRenderError(error);return false}
  }

  function handleMessage(event){
    if(event.source&&event.source!==window.parent&&event.source!==window.top)return;
    var data=tryExtractData(event.data);if(data!==null)renderCandidate(data);
  }

  function initializeFromOpenAI(){
    try{var sdk=window.openai;if(sdk&&sdk.toolOutput)renderCandidate(sdk.toolOutput)}catch(error){console.warn('[team-compare] window.openai fallback unavailable:',error)}
  }

  function handleOpenAIGlobals(event){
    try{
      var detail=event&&event.detail;
      var globals=detail&&detail.globals?detail.globals:detail;
      if(!globals||typeof globals!=='object')return;
      var candidate=globals.toolOutput||globals.toolResponseMetadata||globals;
      renderCandidate(candidate);
    }catch(error){console.warn('[team-compare] openai:set_globals handling failed:',error)}
  }

  window.addEventListener('message',handleMessage);
  window.addEventListener('openai:set_globals',handleOpenAIGlobals);
  initializeFromOpenAI();
  try{window.parent.postMessage({type:'widget_ready',widget:'team-compare-v1'},'*')}catch(error){}
  setTimeout(function(){if(!hasRendered&&document.getElementById('state-error').style.display==='none'){document.getElementById('state-loading').style.display='none';document.getElementById('state-empty').style.display='flex'}},12000);
})();
</script>
</body>
</html>`;

export const TEAM_COMPARE_RESOURCE = {
  uri: TEAM_COMPARE_WIDGET_URI,
  name: 'East v. West Team Compare',
  mimeType: 'text/html;profile=mcp-app' as const,
};

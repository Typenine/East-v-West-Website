import { TEAM_NAMES } from '@/lib/constants/league';

// Only published, verifiable selections count. Missing rows remain unresolved.
export type WeeklyPick = { week: number; team1: string; team2: string; mason: string; westy: string };
export type WeeklyResult = { week: number; team1: string; team2: string; winner: string };
export type StockReceipt = { season: number; week: number; subject: string; masonText: string; westyText: string };
export type EditorialExtract = {
  version: 1; season: number; issueWeek: number; picks: WeeklyPick[];
  results: WeeklyResult[]; stockWatch: StockReceipt[]; warnings: string[];
};
export type PredictionRecord = { w: number; l: number };
export type WeeklyPredictionScore = { week: number; mason: PredictionRecord; westy: PredictionRecord };
export type EditorialScoreboard = {
  mason: PredictionRecord; westy: PredictionRecord;
  lastWeek: WeeklyPredictionScore | null; weeks: WeeklyPredictionScore[];
  disagreements: PredictionRecord; verified: boolean; missingWeeks: number[];
};

const quote = (s: string) => s.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
const names = [...TEAM_NAMES].sort((a,b)=>b.length-a.length);
const namePattern = '(' + names.map(quote).join('|') + ')';
const rowPattern = new RegExp('^\\s*' + namePattern + '\\s*[/|]\\s*' + namePattern + '\\s+' + namePattern + '\\s+' + namePattern + '\\s*$', 'i');
const headingPattern = new RegExp('^\\s*' + namePattern + '\\s+vs\\.?\\s+' + namePattern + '\\s*$', 'i');
const resultPattern = new RegExp(namePattern + '\\s+(\\d{1,3}\\.\\d{1,2})\\s*,\\s*' + namePattern + '\\s+(\\d{1,3}\\.\\d{1,2})', 'gi');
const norm = (s:string) => s.replace(/\s+/g,' ').trim();
const canonical = (s:string) => names.find(t=>t.toLowerCase()===norm(s).toLowerCase()) ?? null;
const pairKey = (a:string,b:string) => [a,b].sort((x,y)=>x.localeCompare(y)).join('|');
const speaker = (s:string): 'mason'|'westy'|null => /^MASON REED$/i.test(s)?'mason':/^WESTY$/i.test(s)?'westy':null;

function picksFromProse(lines:string[],week:number, found:Map<string,WeeklyPick>) {
  // Some early issues have no summary pick sheet; extract explicit statements in previews.
  const begin = lines.findIndex(l=>/^(?:ALL SIX UPCOMING MATCHUP PREVIEWS|WEEK \w+ PREVIEWS)$/i.test(l));
  if(begin<0)return;
  let teams:[string,string]|null=null;
  let active:'mason'|'westy'|null=null;
  let words:{mason:string[];westy:string[]}={mason:[],westy:[]};
  const flush=()=>{
    if(!teams)return;
    const [a,b]=teams;
    const pick=(text:string):string|null=>{
      const body=norm(text);
      const m=body.match(/\b(?:my pick is|i (?:also )?pick|i am (?:picking|taking)|i'm (?:picking|taking)|i (?:also )?have)\s+(.{0,100})/i);
      if(!m)return null;
      const tail=m[1];
      const candidates=[a,b].filter(t=>new RegExp('^'+quote(t)+'(?:\\b|[., ]|$)','i').test(tail));
      return candidates.length===1?candidates[0]:null;
    };
    const mason=pick(words.mason.join(' ')),westy=pick(words.westy.join(' '));
    if(mason&&westy&&!found.has(pairKey(a,b)))found.set(pairKey(a,b),{week:week+1,team1:a,team2:b,mason,westy});
  };
  for(let i=begin+1;i<lines.length;i++){
    const line=lines[i];
    if(/^FINAL WORD$/i.test(line))break;
    const h=headingPattern.exec(line);
    if(h){flush();teams=[canonical(h[1])!,canonical(h[2])!];active=null;words={mason:[],westy:[]};continue;}
    const s=speaker(line);
    if(s){active=s;continue;}
    if(teams&&active&&!/^EAST v\. WEST|^20\d\d \/ WEEK/i.test(line)) words[active].push(line);
  }
  flush();
}

function parseWatches(lines:string[],season:number,week:number):StockReceipt[]{
  const from=lines.findIndex(l=>/^STOCK WATCH$/i.test(l));
  if(from<0)return [];
  const stop=lines.findIndex((l,i)=>i>from&&/^CLANCY'S RECEIPT DESK$/i.test(l));
  const section=lines.slice(from+1,stop<0?lines.length:stop);
  const entries:StockReceipt[]=[];
  let item:StockReceipt|null=null, active:'mason'|'westy'|null=null;
  for(let i=0;i<section.length;i++){
    const line=section[i],sp=speaker(line);
    if(sp){active=sp;continue;}
    if(/^EAST v\. WEST|^20\d\d \/ WEEK|^\d{1,2}$/.test(line))continue;
    const immediate=section.slice(i+1,i+4);
    const nextSpeaker=immediate.some(x=>speaker(x)!==null);
    if(line.length>=14&&line.length<120&&!/[.!?]$/.test(line)&&nextSpeaker&&
      !/^(?:where the|the pieces|only where|rising and falling)/i.test(line)){
      // A heading directly above a speaker identifies an independent watch.
      const untilSpeaker=immediate.findIndex(x=>speaker(x)!==null);
      if(untilSpeaker<=1){
        item={season,week,subject:line,masonText:'',westyText:''};
        entries.push(item);active=null;continue;
      }
    }
    if(item&&active) {
      if(active==='mason')item.masonText=norm(item.masonText+' '+line).slice(0,2400);
      else item.westyText=norm(item.westyText+' '+line).slice(0,2400);
    }
  }
  return entries.filter(e=>e.masonText.length>=30||e.westyText.length>=30);
}

export function extractEditorial(rawText:string,season:number,issueWeek:number):EditorialExtract{
  const lines=rawText.split(/\r?\n/).map(norm).filter(Boolean);
  const found=new Map<string,WeeklyPick>();
  for(const line of lines){
    const row=rowPattern.exec(line);
    if(!row)continue;
    const [a,b,m,w]=row.slice(1).map(canonical);
    if(!a||!b||!m||!w||a===b||![a,b].includes(m)||![a,b].includes(w))continue;
    found.set(pairKey(a,b),{week:issueWeek+1,team1:a,team2:b,mason:m,westy:w});
  }
  if(found.size!==6)picksFromProse(lines,issueWeek,found);
  const results=new Map<string,WeeklyResult>();
  for(const m of rawText.matchAll(resultPattern)){
    const a=canonical(m[1]),b=canonical(m[3]);
    const x=Number(m[2]),y=Number(m[4]);
    if(!a||!b||a===b||!Number.isFinite(x)||!Number.isFinite(y)||x===y)continue;
    results.set(pairKey(a,b),{week:issueWeek,team1:a,team2:b,winner:x>y?a:b});
  }
  const warnings=[];
  if(found.size!==6)warnings.push('Recovered only '+found.size+' of 6 upcoming picks.');
  if(results.size!==6)warnings.push('Recovered only '+results.size+' of 6 completed matchups.');
  return {version:1,season,issueWeek,picks:[...found.values()].slice(0,6),
    results:[...results.values()],stockWatch:parseWatches(lines,season,issueWeek),warnings};
}

export function buildScoreboard(issues:EditorialExtract[]):EditorialScoreboard{
  const ordered=[...issues].sort((a,b)=>a.issueWeek-b.issueWeek);
  const results=new Map<number,Map<string,string>>();
  for(const issue of ordered)if(issue.results.length===6){
    results.set(issue.issueWeek,new Map(issue.results.map(r=>[pairKey(r.team1,r.team2),r.winner])));
  }
  const weeks:WeeklyPredictionScore[]=[];
  const missingWeeks:number[]=[];
  const disagreements={w:0,l:0};
  for(const issue of ordered){
    const gameWeek=issue.issueWeek+1;
    const outcome=results.get(gameWeek);
    if(!outcome)continue;
    if(issue.picks.length!==6){missingWeeks.push(gameWeek);continue;}
    const byPair=new Map(issue.picks.map(p=>[pairKey(p.team1,p.team2),p]));
    let graded=0;
    const row:WeeklyPredictionScore={week:gameWeek,mason:{w:0,l:0},westy:{w:0,l:0}};
    for(const [id,winner] of outcome){
      const p=byPair.get(id);
      if(!p)continue;
      if(p.mason===winner)row.mason.w++;else row.mason.l++;
      if(p.westy===winner)row.westy.w++;else row.westy.l++;
      if(p.mason!==p.westy) {if(p.mason===winner)disagreements.w++;else disagreements.l++;}
      graded++;
    }
    if(graded===6)weeks.push(row);
    else missingWeeks.push(gameWeek);
  }
  const sum=(who:'mason'|'westy',field:'w'|'l')=>weeks.reduce((n,x)=>n+x[who][field],0);
  return {mason:{w:sum('mason','w'),l:sum('mason','l')},westy:{w:sum('westy','w'),l:sum('westy','l')},
    lastWeek:weeks[weeks.length-1]??null,weeks,disagreements,
    verified:missingWeeks.length===0&&weeks.length>0,missingWeeks};
}

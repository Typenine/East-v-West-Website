import { scoreProjectedStatLine, type PlayerGameSample } from './projection-model';
import type { FantasyBaselineSummary, RoleTrend } from './projection-opportunity-types';
import { hasExplicitParticipation } from './projection-usage';

function finite(value: unknown): number { const n=Number(value); return Number.isFinite(n)?n:0; }
function statTeam(stats: Record<string, number|string|undefined>): string|null { const v=String(stats.team||stats.recent_team||stats.player_team||'').trim().toUpperCase(); return v||null; }
function opportunity(position:string,stats:Record<string,number|string|undefined>):number {
  if(position==='QB') return finite(stats.pass_att)+(finite(stats.rush_att)*.65);
  if(position==='RB') return finite(stats.rush_att)+(finite(stats.rec_tgt)*.65);
  if(position==='WR') return finite(stats.rec_tgt)+(finite(stats.rush_att)*.55);
  if(position==='TE') return finite(stats.rec_tgt)+(finite(stats.rush_att)*.35);
  if(position==='K') return finite(stats.fga)+finite(stats.xpa);
  return position==='DEF'?1:0;
}
function observed(position:string,stats:Record<string,number|string|undefined>):boolean{return opportunity(position,stats)>0||hasExplicitParticipation(stats);}
function threshold(position:string):number { return position==='QB'?12:position==='RB'?7:position==='WR'?7:position==='TE'?5:4; }
function mean(values:number[]):number{return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}
function median(values:number[]):number{const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return 0;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
function roleTrend(position:string,samples:PlayerGameSample[]):{trend:RoleTrend;factor:number}{
  const recent=samples.slice(-5);const prior=samples.slice(Math.max(0,samples.length-13),Math.max(0,samples.length-5));
  if(recent.length<3||prior.length<3)return{trend:'insufficient',factor:1};
  const recentValues=recent.map(game=>opportunity(position,game.stats));const priorValues=prior.map(game=>opportunity(position,game.stats));
  const recentOpp=median(recentValues);const priorOpp=median(priorValues);
  const ratio=(recentOpp+1)/(priorOpp+1);const delta=recentOpp-priorOpp;
  if(delta>=2&&ratio>=1.28)return{trend:'expanded',factor:Math.min(1.32,1+((ratio-1)*.32))};
  if(delta<=-2&&ratio<=.78)return{trend:'declining',factor:Math.max(.72,1+((ratio-1)*.32))};
  return{trend:'stable',factor:1};
}
export function buildFantasyBaseline(args:{games:PlayerGameSample[];position:string;scoring:Record<string,number>;currentTeam:string|null}):FantasyBaselineSummary|null {
  const position=args.position.toUpperCase();
  const samples=args.games.filter(game=>observed(position,game.stats)).sort((a,b)=>(a.season-b.season)||(a.week-b.week));
  if(!samples.length) return null;
  const latest=samples.at(-1)!;
  const scored=samples.map(game=>{
    const age=((latest.season-game.season)*18)+Math.max(0,latest.week-game.week);
    const weight=Math.exp(-Math.log(2)*age/10);
    return {points:Math.max(0,scoreProjectedStatLine(game.stats as Record<string,number>,args.scoring,position)),weight,team:statTeam(game.stats)};
  });
  const totalWeight=scored.reduce((s,g)=>s+g.weight,0);
  const weighted=scored.reduce((s,g)=>s+g.points*g.weight,0)/Math.max(.001,totalWeight);
  const recentSlice=scored.slice(-5);
  const recent=recentSlice.reduce((s,g)=>s+g.points,0)/recentSlice.length;
  const sameTeamGames=args.currentTeam?scored.filter(g=>g.team===args.currentTeam).length:0;
  const changedTeams=Boolean(args.currentTeam&&scored.some(g=>g.team&&g.team!==args.currentTeam));
  let anchor=samples.length>=12?.38:samples.length>=8?.34:samples.length>=4?.26:samples.length>=2?.16:.08;
  if(position==='QB') anchor*=.72;
  if(position==='K'||position==='DEF') anchor*=.55;
  if(changedTeams) anchor*=.86;
  const trend=roleTrend(position,samples);
  if(trend.trend==='expanded'||trend.trend==='declining')anchor=Math.min(.42,anchor+.025);
  const blended=(weighted*.62)+(recent*.38);
  return {weightedPoints:Number(blended.toFixed(3)),recentPoints:Number(recent.toFixed(3)),games:samples.length,activeZeroGames:samples.filter(game=>opportunity(position,game.stats)===0).length,sameTeamGames,anchorWeight:Number(Math.min(.42,anchor).toFixed(3)),established:samples.length>=6&&blended>=threshold(position),changedTeams,roleTrend:trend.trend,roleTrendFactor:Number(trend.factor.toFixed(3))};
}
export function normalizePreseasonActiveProbability(args:{weight:number;tier:string;status:string|null|undefined}):number {
  const status=String(args.status||'').toLowerCase();
  if(/out|susp|inactive|\bir\b|pup|nfi/.test(status)) return args.weight;
  const roleFloor=args.tier==='starter'?.97:args.tier==='primary_backup'?.95:.93;
  return Math.max(args.weight,roleFloor);
}
export function eligibleProjection(points:number,nflTeam:string|null,isBye:boolean):number { return !nflTeam||isBye?0:Math.max(0,points); }

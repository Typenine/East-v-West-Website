import { scoreProjectedStatLine, type PlayerGameSample } from './projection-model';
import type { FantasyBaselineSummary } from './projection-opportunity-types';

function finite(value: unknown): number { const n=Number(value); return Number.isFinite(n)?n:0; }
function statTeam(stats: Record<string, number|string|undefined>): string|null { const v=String(stats.team||stats.recent_team||stats.player_team||'').trim().toUpperCase(); return v||null; }
function hasOpportunity(position:string, stats:Record<string,number|string|undefined>):boolean {
  if(position==='QB') return finite(stats.pass_att)+finite(stats.rush_att)>0;
  if(['RB','WR','TE'].includes(position)) return finite(stats.rush_att)+finite(stats.rec_tgt)+finite(stats.rec)>0;
  if(position==='K') return finite(stats.fga)+finite(stats.xpa)>0;
  return position==='DEF';
}
function threshold(position:string):number { return position==='QB'?12:position==='RB'?7:position==='WR'?7:position==='TE'?5:4; }
export function buildFantasyBaseline(args:{games:PlayerGameSample[];position:string;scoring:Record<string,number>;currentTeam:string|null}):FantasyBaselineSummary|null {
  const position=args.position.toUpperCase();
  const samples=args.games.filter(g=>hasOpportunity(position,g.stats)).sort((a,b)=>(a.season-b.season)||(a.week-b.week));
  if(!samples.length) return null;
  const latest=samples.at(-1)!;
  const scored=samples.map(game=>{
    const age=((latest.season-game.season)*18)+Math.max(0,latest.week-game.week);
    const weight=Math.exp(-Math.log(2)*age/10);
    return {points:Math.max(0,scoreProjectedStatLine(game.stats as Record<string,number>,args.scoring,position)),weight,team:statTeam(game.stats)};
  });
  const totalWeight=scored.reduce((s,g)=>s+g.weight,0);
  const weighted=scored.reduce((s,g)=>s+g.points*g.weight,0)/Math.max(0.001,totalWeight);
  const recentSlice=scored.slice(-4);
  const recent=recentSlice.reduce((s,g)=>s+g.points,0)/recentSlice.length;
  const sameTeamGames=args.currentTeam?scored.filter(g=>g.team===args.currentTeam).length:0;
  const changedTeams=Boolean(args.currentTeam&&scored.some(g=>g.team&&g.team!==args.currentTeam));
  let anchor=samples.length>=12?0.38:samples.length>=8?0.34:samples.length>=4?0.26:samples.length>=2?0.16:0.08;
  if(position==='QB') anchor*=0.72;
  if(position==='K'||position==='DEF') anchor*=0.55;
  if(changedTeams) anchor*=0.86;
  const blended=(weighted*0.68)+(recent*0.32);
  return {weightedPoints:Number(blended.toFixed(3)),recentPoints:Number(recent.toFixed(3)),games:samples.length,sameTeamGames,anchorWeight:Number(Math.min(0.42,anchor).toFixed(3)),established:samples.length>=6&&blended>=threshold(position),changedTeams};
}
export function normalizePreseasonActiveProbability(args:{weight:number;tier:string;status:string|null|undefined}):number {
  const status=String(args.status||'').toLowerCase();
  if(/out|susp|inactive|\bir\b|pup|nfi/.test(status)) return args.weight;
  const roleFloor=args.tier==='starter'?0.97:args.tier==='primary_backup'?0.95:0.93;
  return Math.max(args.weight,roleFloor);
}
export function eligibleProjection(points:number,nflTeam:string|null,isBye:boolean):number { return !nflTeam||isBye?0:Math.max(0,points); }

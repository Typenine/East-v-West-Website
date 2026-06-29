import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { PlayerProjectionCandidate, RoleTrend } from '@/lib/fantasy/projection-opportunity-types';
import type { PlayerGameSample } from '@/lib/fantasy/projection-model';

export function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
export function finite(value:unknown):number{const n=Number(value);return Number.isFinite(n)?n:0;}
export function weightedMean(values:Array<{value:number;weight:number}>,fallback:number):number{const usable=values.filter(v=>Number.isFinite(v.value)&&v.weight>0);const total=usable.reduce((s,v)=>s+v.weight,0);return total?usable.reduce((s,v)=>s+v.value*v.weight,0)/total:fallback;}
export function statTeam(stats:Record<string,number|string|undefined>):string|null{const v=String(stats.team||stats.recent_team||stats.player_team||'').trim().toUpperCase();return v||null;}

const PARTICIPATION_KEYS=['snap_count','snaps','off_snp','offensive_snaps','offensive_snap_count','plays','gms_active','games_played','gp','played'] as const;
export function hasExplicitParticipation(stats:Record<string,number|string|undefined>):boolean{
  return PARTICIPATION_KEYS.some(key=>{
    const value=stats[key];
    if(typeof value==='string'&&/^(true|yes|active)$/i.test(value.trim()))return true;
    return finite(value)>0;
  });
}

export function positionOpportunity(position:string,game:PlayerGameSample):number{
  const s=game.stats;
  if(position==='QB')return finite(s.pass_att)+(finite(s.rush_att)*0.65);
  if(position==='RB')return finite(s.rush_att)+(finite(s.rec_tgt)*0.65);
  if(position==='WR')return finite(s.rec_tgt)+(finite(s.rush_att)*0.55);
  if(position==='TE')return finite(s.rec_tgt)+(finite(s.rush_att)*0.35);
  return finite(s.rush_att)+finite(s.rec_tgt)+finite(s.pass_att);
}

export function observedGames(position:string,games:PlayerGameSample[]):PlayerGameSample[]{
  return games.filter(game=>positionOpportunity(position,game)>0||hasExplicitParticipation(game.stats));
}

function meanOpportunity(position:string,games:PlayerGameSample[]):number{
  return games.length?games.reduce((sum,game)=>sum+positionOpportunity(position,game),0)/games.length:0;
}
function medianOpportunity(position:string,games:PlayerGameSample[]):number{
  const values=games.map(game=>positionOpportunity(position,game)).sort((a,b)=>a-b);
  if(!values.length)return 0;const middle=Math.floor(values.length/2);return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
}

export function detectRoleTrend(position:string,games:PlayerGameSample[]):{roleTrend:RoleTrend;factor:number;confidence:number;recent:number;prior:number}{
  const observed=observedGames(position,[...games].sort((a,b)=>(a.season-b.season)||(a.week-b.week)));
  const recentGames=observed.slice(-5);
  const priorGames=observed.slice(Math.max(0,observed.length-13),Math.max(0,observed.length-5));
  const recent=meanOpportunity(position,recentGames);
  const prior=meanOpportunity(position,priorGames);
  const recentMedian=medianOpportunity(position,recentGames);
  const priorMedian=medianOpportunity(position,priorGames);
  if(recentGames.length<3||priorGames.length<3)return{roleTrend:'insufficient',factor:1,confidence:0,recent,prior};
  const confidence=clamp(Math.min(recentGames.length,priorGames.length)/5,0,1);
  const ratio=(recentMedian+1)/(priorMedian+1);
  const delta=recentMedian-priorMedian;
  let roleTrend:RoleTrend='stable';
  if(delta>=2&&ratio>=1.28)roleTrend='expanded';
  else if(delta<=-2&&ratio<=0.78)roleTrend='declining';
  const raw=roleTrend==='stable'?1:1+((ratio-1)*0.38*confidence);
  return{roleTrend,factor:clamp(raw,0.72,1.32),confidence,recent,prior};
}

export function draftCapitalFactor(player:SleeperPlayer|undefined):number{const round=Number((player as (SleeperPlayer&{draft_round?:number|string})|undefined)?.draft_round||0);if(round===1)return 1.35;if(round===2)return 1.18;if(round===3)return 1.08;if(round>=4)return 0.88;return 1;}
export function roleText(candidate:PlayerProjectionCandidate):string{return String(candidate.override?.roleLabel||candidate.base.expectedRole||'').toLowerCase();}

export function touchdownFactor(args:{weighted:Array<{game:PlayerGameSample;weight:number}>;touchdownKey:string;opportunityKey:string;priorRate:number;priorAttempts:number}):number{
  const attempts=args.weighted.reduce((sum,{game,weight})=>sum+(finite(game.stats[args.opportunityKey])*weight),0);
  const touchdowns=args.weighted.reduce((sum,{game,weight})=>sum+(finite(game.stats[args.touchdownKey])*weight),0);
  const rate=(touchdowns+(args.priorRate*args.priorAttempts))/Math.max(1,attempts+args.priorAttempts);
  return clamp(rate/args.priorRate,0.65,1.55);
}

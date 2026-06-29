import type { PlayerProjectionCandidate, UsageProfile } from '@/lib/fantasy/projection-opportunity-types';
import {
  clamp,
  detectRoleTrend,
  draftCapitalFactor,
  finite,
  observedGames,
  positionOpportunity,
  roleText,
  statTeam,
  touchdownFactor,
  weightedMean,
} from '@/lib/fantasy/projection-usage-core';

export function buildUsageProfile(candidate:PlayerProjectionCandidate):UsageProfile{
  const position=candidate.base.position;
  const ordered=[...candidate.games].sort((a,b)=>(a.season-b.season)||(a.week-b.week));
  const latestSeason=ordered.at(-1)?.season??0;const latestWeek=ordered.filter(g=>g.season===latestSeason).at(-1)?.week??1;
  const samples=observedGames(position,ordered);
  const activeZeroGames=samples.filter(game=>positionOpportunity(position,game)===0).length;
  const currentTeam=String(candidate.player?.team||candidate.base.nflTeam||'').toUpperCase()||null;
  const weighted=samples.map(game=>{const age=((latestSeason-game.season)*18)+Math.max(0,latestWeek-game.week);const gameTeam=statTeam(game.stats);const continuity=currentTeam&&gameTeam&&gameTeam!==currentTeam?0.82:1;return{game,weight:Math.exp(-Math.log(2)*age/10)*continuity};});
  const avg=(key:string)=>weightedMean(weighted.map(({game,weight})=>({value:finite(game.stats[key]),weight})),0);
  const latestTeam=[...samples].reverse().map(g=>statTeam(g.stats)).find(Boolean)||null;
  const changedTeams=Boolean(currentTeam&&samples.some(g=>{const t=statTeam(g.stats);return Boolean(t&&t!==currentTeam);}));
  const rookieYear=Number(candidate.player?.rookie_year||0);const projectionSeason=candidate.projectionSeason||new Date().getFullYear();
  const rookie=rookieYear>0?rookieYear===projectionSeason:Number(candidate.player?.years_exp??0)===0;
  const trend=detectRoleTrend(position,samples);
  const recentTargets=avg('rec_tgt');const recentCarries=avg('rush_att');const recentPassAttempts=avg('pass_att');
  const trendedTargets=recentTargets*trend.factor;const trendedCarries=recentCarries*trend.factor;const trendedPass=recentPassAttempts*trend.factor;
  const workloadProbability=position==='QB'?clamp(trendedPass/30,0.02,1):position==='RB'?clamp((trendedCarries+(trendedTargets*.65))/15,0.03,1):clamp((trendedTargets+(trendedCarries*.35))/(position==='TE'?6.5:8),0.03,1);
  const role=roleText(candidate);
  let rosterRelevance=0.03;
  if(samples.length>=6&&trend.recent>=3)rosterRelevance=1;
  else if(samples.length>=3&&trend.recent>=2)rosterRelevance=0.82;
  else if(/expected starter|featured|lead back|starting receiver|lead tight end|starting quarterback/.test(role))rosterRelevance=0.92;
  else if(/committee|secondary|primary backup/.test(role))rosterRelevance=samples.length?0.68:0.3;
  else if(/rotational|slot/.test(role))rosterRelevance=samples.length?0.42:0.14;
  else if(rookie)rosterRelevance=clamp(0.22*draftCapitalFactor(candidate.player),0.14,0.42);
  if(trend.roleTrend==='expanded')rosterRelevance=Math.max(rosterRelevance,0.84);
  const rushTouchdownFactor=touchdownFactor({weighted,touchdownKey:'rush_td',opportunityKey:'rush_att',priorRate:.032,priorAttempts:35});
  const receivingTouchdownFactor=touchdownFactor({weighted,touchdownKey:'rec_td',opportunityKey:'rec_tgt',priorRate:position==='TE'?.052:.045,priorAttempts:40});
  return{sampleGames:samples.length,activeZeroGames,recentTargets,recentCarries,recentPassAttempts,recentOpportunity:trend.recent,priorOpportunity:trend.prior,latestTeam,changedTeams,rookie,historyTrust:clamp(samples.length/7,0,0.92),roleTrend:trend.roleTrend,roleTrendFactor:trend.factor,roleTrendConfidence:trend.confidence,workloadProbability,rosterRelevance:clamp(rosterRelevance,0.02,1),rushTouchdownFactor,receivingTouchdownFactor};
}

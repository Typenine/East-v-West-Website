import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { PlayerProjectionCandidate, UsageProfile } from '@/lib/fantasy/projection-opportunity-types';

export function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
export function finite(value:unknown):number{const n=Number(value);return Number.isFinite(n)?n:0;}
export function weightedMean(values:Array<{value:number;weight:number}>,fallback:number):number{const usable=values.filter(v=>Number.isFinite(v.value)&&v.weight>0);const total=usable.reduce((s,v)=>s+v.weight,0);return total?usable.reduce((s,v)=>s+v.value*v.weight,0)/total:fallback;}
function statTeam(stats:Record<string,number|string|undefined>):string|null{const v=String(stats.team||stats.recent_team||stats.player_team||'').trim().toUpperCase();return v||null;}

export function buildUsageProfile(candidate:PlayerProjectionCandidate):UsageProfile{
 const ordered=[...candidate.games].sort((a,b)=>(a.season-b.season)||(a.week-b.week));
 const latestSeason=ordered.at(-1)?.season??0; const latestWeek=ordered.filter(g=>g.season===latestSeason).at(-1)?.week??1;
 const samples=ordered.filter(g=>finite(g.stats.rec_tgt)+finite(g.stats.rush_att)+finite(g.stats.pass_att)>0);
 const currentTeam=String(candidate.player?.team||candidate.base.nflTeam||'').toUpperCase()||null;
 const weighted=samples.map(game=>{const age=((latestSeason-game.season)*18)+Math.max(0,latestWeek-game.week);const gameTeam=statTeam(game.stats);const continuity=currentTeam&&gameTeam&&gameTeam!==currentTeam?0.82:1;return{game,weight:Math.exp(-Math.log(2)*age/10)*continuity};});
 const avg=(key:string)=>weightedMean(weighted.map(({game,weight})=>({value:finite(game.stats[key]),weight})),0);
 const latestTeam=[...samples].reverse().map(g=>statTeam(g.stats)).find(Boolean)||null;
 const changedTeams=Boolean(currentTeam&&samples.some(g=>{const t=statTeam(g.stats);return Boolean(t&&t!==currentTeam);}));
 const rookieYear=Number(candidate.player?.rookie_year||0); const projectionSeason=candidate.projectionSeason||new Date().getFullYear();
 const rookie=rookieYear>0?rookieYear===projectionSeason:Number(candidate.player?.years_exp??0)===0;
 return {sampleGames:samples.length,recentTargets:avg('rec_tgt'),recentCarries:avg('rush_att'),recentPassAttempts:avg('pass_att'),latestTeam,changedTeams,rookie,historyTrust:clamp(samples.length/6,0,0.92)};
}
function draftCapitalFactor(player:SleeperPlayer|undefined):number{const round=Number((player as (SleeperPlayer&{draft_round?:number|string})|undefined)?.draft_round||0);if(round===1)return 1.35;if(round===2)return 1.18;if(round===3)return 1.08;if(round>=4)return 0.88;return 1;}
function roleText(candidate:PlayerProjectionCandidate):string{return String(candidate.override?.roleLabel||candidate.base.expectedRole||'').toLowerCase();}
export function participationFactor(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
 const role=roleText(candidate); const position=candidate.base.position; const recent=profile.recentTargets+profile.recentCarries+(position==='QB'?profile.recentPassAttempts:0);
 const start=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);
 if(position==='QB'){if(start<0.15)return 0.025;if(start>=0.65||(profile.recentPassAttempts>=18&&start>=0.45))return 1;if(start>=0.18)return 0.24;return 0.025;}
 if(profile.sampleGames>=4&&recent>=5) return 1;
 if(/expected starter|featured|lead back|starting receiver|lead tight end|starting quarterback/.test(role)) return 1;
 if(/committee|secondary/.test(role)) return position==='QB'?0.22:0.62;
 if(/primary backup/.test(role)) return position==='QB'?0.12:0.42;
 if(/rotational|slot/.test(role)) return 0.26;
 if(/depth|blocking|change-of-pace|backup quarterback/.test(role)) return 0.08;
 if(profile.sampleGames>=3&&recent>=3) return 0.72;
 if(profile.rookie) return clamp(0.12*draftCapitalFactor(candidate.player),0.08,0.22);
 return 0.025;
}
function roleEvidenceFactor(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{if(profile.sampleGames>=6)return 1;if(profile.sampleGames>=3)return 0.86;if(candidate.base.expectedRole!=='Uncertain role')return 1;if(profile.rookie)return 0.45;return 0.08;}
export function targetPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
 const position=candidate.base.position;const starter=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);
 const rolePrior=position==='WR'?1.2+(starter*6.8):position==='TE'?0.8+(starter*5.3):position==='RB'?0.6+(starter*3.4):0;
 const baseTargets=finite(candidate.base.statLine?.rec_tgt);const roleEvidence=roleEvidenceFactor(candidate,profile);const history=profile.recentTargets*profile.historyTrust;const base=baseTargets*(0.45+0.35*(1-profile.historyTrust));const role=rolePrior*roleEvidence*(1-profile.historyTrust)*0.55;const rookieBoost=profile.rookie?draftCapitalFactor(candidate.player):1;
 return Math.max(0.001,(history+base+role)*rookieBoost*participationFactor(candidate,profile));
}
export function carryPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
 const position=candidate.base.position;const starter=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);
 const rolePrior=position==='RB'?2.0+(starter*13.5):position==='QB'?0.8+Math.min(profile.recentCarries||3.5,9)*0.7:position==='WR'?0.03+profile.recentCarries*0.75:0;
 const baseCarries=finite(candidate.base.statLine?.rush_att);const roleEvidence=position==='RB'?roleEvidenceFactor(candidate,profile):1;const history=profile.recentCarries*profile.historyTrust;const base=baseCarries*(0.45+0.35*(1-profile.historyTrust));const role=rolePrior*roleEvidence*(1-profile.historyTrust)*0.55;const rookieBoost=profile.rookie&&position==='RB'?draftCapitalFactor(candidate.player):1;
 return Math.max(0.001,(history+base+role)*rookieBoost*participationFactor(candidate,profile));
}
export function passPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
 if(candidate.base.position!=='QB')return 0;const start=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);const base=finite(candidate.base.statLine?.pass_att);const role=2+start*32;const blended=(profile.recentPassAttempts*profile.historyTrust)+(base*0.45)+(role*(1-profile.historyTrust)*0.55);return Math.max(0.001,blended*participationFactor(candidate,profile));
}

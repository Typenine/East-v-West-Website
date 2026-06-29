import type { PlayerProjectionCandidate, UsageProfile } from '@/lib/fantasy/projection-opportunity-types';
import { buildUsageProfile } from '@/lib/fantasy/projection-usage-profile';
import { clamp, draftCapitalFactor, finite, roleText, weightedMean } from '@/lib/fantasy/projection-usage-core';

export { buildUsageProfile } from '@/lib/fantasy/projection-usage-profile';
export { clamp, finite, hasExplicitParticipation, weightedMean } from '@/lib/fantasy/projection-usage-core';

export function participationFactor(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
  const role=roleText(candidate);const position=candidate.base.position;const recent=profile.recentOpportunity*profile.roleTrendFactor;
  const start=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);
  if(position==='QB'){if(start<0.15&&profile.recentPassAttempts<8)return 0.025;if(start>=0.65||(profile.recentPassAttempts>=18&&start>=0.45))return 1;if(start>=0.18)return 0.24;return 0.025;}
  if(profile.sampleGames>=4&&recent>=5)return 1;
  if(profile.roleTrend==='expanded'&&profile.roleTrendConfidence>=.6&&recent>=4)return 1;
  if(/expected starter|featured|lead back|starting receiver|lead tight end/.test(role))return 1;
  if(/committee|secondary/.test(role))return profile.sampleGames>=2?.82:.48;
  if(/primary backup/.test(role))return profile.sampleGames>=2?.68:.28;
  if(/rotational|slot/.test(role))return profile.sampleGames>=2?.44:.16;
  if(/depth|blocking|change-of-pace|backup quarterback/.test(role))return profile.sampleGames>=2?.2:.04;
  if(profile.sampleGames>=3&&recent>=3)return .76;
  if(profile.rookie)return clamp(.12*draftCapitalFactor(candidate.player),.08,.22);
  return .025;
}

function roleEvidenceFactor(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{if(profile.sampleGames>=6)return 1;if(profile.sampleGames>=3)return .86;if(candidate.base.expectedRole!=='Uncertain role')return 1;if(profile.rookie)return .45;return .08;}
function relevanceMultiplier(profile:UsageProfile):number{return .12+(.88*profile.rosterRelevance);}

export function targetPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
  const position=candidate.base.position;const start=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);
  const workload=profile.sampleGames?profile.workloadProbability:start;
  const rolePrior=position==='WR'?1.2+(workload*6.8):position==='TE'?.8+(workload*5.3):position==='RB'?.6+(workload*3.4):0;
  const baseTargets=finite(candidate.base.statLine?.rec_tgt);const roleEvidence=roleEvidenceFactor(candidate,profile);const history=profile.recentTargets*profile.roleTrendFactor*profile.historyTrust;const base=baseTargets*(.45+.35*(1-profile.historyTrust));const role=rolePrior*roleEvidence*(1-profile.historyTrust)*.55;const rookieBoost=profile.rookie?draftCapitalFactor(candidate.player):1;
  return Math.max(.0001,(history+base+role)*rookieBoost*participationFactor(candidate,profile)*relevanceMultiplier(profile));
}

export function carryPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
  const position=candidate.base.position;const start=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);
  const workload=profile.sampleGames?profile.workloadProbability:start;
  const rolePrior=position==='RB'?2+(workload*13.5):position==='QB'?.8+Math.min(profile.recentCarries||3.5,9)*.7:position==='WR'?.03+profile.recentCarries*.75:0;
  const baseCarries=finite(candidate.base.statLine?.rush_att);const roleEvidence=position==='RB'?roleEvidenceFactor(candidate,profile):1;const history=profile.recentCarries*profile.roleTrendFactor*profile.historyTrust;const base=baseCarries*(.45+.35*(1-profile.historyTrust));const role=rolePrior*roleEvidence*(1-profile.historyTrust)*.55;const rookieBoost=profile.rookie&&position==='RB'?draftCapitalFactor(candidate.player):1;
  return Math.max(.0001,(history+base+role)*rookieBoost*participationFactor(candidate,profile)*relevanceMultiplier(profile));
}

export function passPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{
  if(candidate.base.position!=='QB')return 0;const start=clamp(candidate.override?.startProbability??candidate.base.startProbability,0,1);const base=finite(candidate.base.statLine?.pass_att);const workload=profile.sampleGames?profile.workloadProbability:start;const role=2+workload*32;const blended=(profile.recentPassAttempts*profile.roleTrendFactor*profile.historyTrust)+(base*.45)+(role*(1-profile.historyTrust)*.55);return Math.max(.0001,blended*participationFactor(candidate,profile)*relevanceMultiplier(profile));
}

export function rushTouchdownPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{return Math.max(.0001,carryPrior(candidate,profile)*profile.rushTouchdownFactor);}
export function receivingTouchdownPrior(candidate:PlayerProjectionCandidate,profile:UsageProfile):number{return Math.max(.0001,targetPrior(candidate,profile)*profile.receivingTouchdownFactor);}

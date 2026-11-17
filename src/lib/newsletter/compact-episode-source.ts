/**
 * A compact alternative to the legacy full Episode Source Pack.
 * The league facts, draft, lineup review, rules, and research are kept intact.
 * Only duplicative character state and long-running published quote history
 * are trimmed; the separate Active Brain files carry these curated memories.
 */
import type { BotMemory } from './types';
import type { PublishedTakeLedgerEntry } from './published-take-store';
import type { CharacterLearningProfile } from './brain-learning';

function relevantReceipts(
  ledger:PublishedTakeLedgerEntry[],
  profile:CharacterLearningProfile,
):PublishedTakeLedgerEntry[]{
  const ids=new Set<string>();
  for(const belief of profile.currentBeliefs.slice(0,18)){
    ids.add(belief.current.receiptId);
    if(belief.earlierOpposingPosition)ids.add(belief.earlierOpposingPosition.receiptId);
  }
  for(const x of profile.verifiedOutcomes.slice(-15))ids.add(x.receiptId);
  for(const x of profile.approvedLessons)if(x.receiptId)ids.add(x.receiptId);
  for(const x of profile.approvedVoice)ids.add(x.receiptId);
  const recent=ledger.slice(-36);
  for(const item of recent)ids.add(item.id);
  return ledger.filter(item=>ids.has(item.id)).slice(-90);
}
function slimMemory(memory:BotMemory|null){
  if(!memory)return null;
  const teams=Object.fromEntries(Object.entries(memory.deepTeamRelationships??{})
    .sort((a,b)=>(b[1].takeHistory?.at(-1)?.week??0)-(a[1].takeHistory?.at(-1)?.week??0))
    .slice(0,9).map(([id,rel])=>[id,{
      ...rel,takeHistory:rel.takeHistory.slice(-3),
    }]));
  const players=Object.fromEntries(Object.entries(memory.deepPlayerRelationships??{})
    .sort((a,b)=>(b[1].history?.at(-1)?.week??0)-(a[1].history?.at(-1)?.week??0))
    .slice(0,9).map(([id,rel])=>[id,{
      ...rel,history:rel.history.slice(-3),predictions:rel.predictions.slice(-2),
    }]));
  return {
    bot:memory.bot,updated_at:memory.updated_at,summaryMood:memory.summaryMood,
    season:memory.season,lastGeneratedWeek:memory.lastGeneratedWeek,
    personality:memory.personality,emotionalState:memory.emotionalState,
    personalGrowth:memory.personalGrowth,
    partnerDynamics:memory.partnerDynamics?{
      ...memory.partnerDynamics,
      recentInteractions:memory.partnerDynamics.recentInteractions.slice(-6),
      insideJokes:memory.partnerDynamics.insideJokes.slice(-6),
    }:null,
    deepTeamRelationships:teams,deepPlayerRelationships:players,
    narratives:memory.narratives?.slice(-9)??[],
    favoritePlayers:memory.favoritePlayers?.slice(-10)??[],
    disappointments:memory.disappointments?.slice(-10)??[],
    teams:memory.teams,
  };
}

export function compactEpisodeSourcePack<T extends {
  publishedContinuity: {
    mason:PublishedTakeLedgerEntry[];
    westy:PublishedTakeLedgerEntry[];
  };
  botContinuity:{
    currentSeason:{mason:BotMemory|null;westy:BotMemory|null};
    priorSeason:{mason:BotMemory|null;westy:BotMemory|null};
    recentPublishedIssues:unknown[];
  };
}>(
  full:T,
  learning:{mason:CharacterLearningProfile;westy:CharacterLearningProfile},
){
  const mason=relevantReceipts(full.publishedContinuity.mason,learning.mason);
  const westy=relevantReceipts(full.publishedContinuity.westy,learning.westy);
  return {
    ...full,
    schemaVersion:3,
    packSize:'chatgpt-compact',
    publishedContinuity:{
      ...full.publishedContinuity,
      mason,westy,
      totalReceiptsAvailableOnWebsite:{
        mason:full.publishedContinuity.mason.length,
        westy:full.publishedContinuity.westy.length,
      },
      compressionNote:'Selective receipts for this week; the two Active Brain files carry current host beliefs. Full retained receipts remain downloadable in each Full Brain archive.',
    },
    botContinuity:{
      ...full.botContinuity,
      currentSeason:{
        mason:slimMemory(full.botContinuity.currentSeason.mason),
        westy:slimMemory(full.botContinuity.currentSeason.westy),
      },
      priorSeason:{
        mason:slimMemory(full.botContinuity.priorSeason.mason),
        westy:slimMemory(full.botContinuity.priorSeason.westy),
      },
      recentPublishedIssues:full.botContinuity.recentPublishedIssues.slice(0,2),
    },
    exportInstructions:[
      'Upload the Writing Room once per ChatGPT project, and the Mason and Westy Active Brains plus this compact Source Pack for each newsletter.',
      'Current league facts, rosters, draft, transactions and rules in this Source Pack are authoritative.',
      'Use each character Active Brain as the source of their individual identity, prior positions, approved learning and voice examples.',
      'Do not infer that missing older receipts mean the host never discussed a subject. Consult the Full Brain archive only for unusual historical deep dives.',
    ],
  };
}

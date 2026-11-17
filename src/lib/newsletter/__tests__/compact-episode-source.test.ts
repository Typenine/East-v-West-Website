import {describe,expect,it} from 'vitest';
import {compactEpisodeSourcePack} from '../compact-episode-source';
import {buildCharacterLearning} from '../brain-learning';
import type {PublishedTakeLedgerEntry} from '../published-take-store';
import type {BotMemory} from '../types';

function take(id:string,week:number):PublishedTakeLedgerEntry {
  return {id,sourceNewsletterId:'published-'+week,title:'Week '+week,episodeType:'regular',
    season:2026,week,subject:'Belleview Badgers',subjectType:'team',relatedTeam:'Belleview Badgers',
    claim:'A detailed published take about Belleview Badgers in week '+week,claimType:'evaluation',
    stance:'positive',confidence:.7,memorable:false,status:'active',
    publishedAt:'2026-11-'+String(week).padStart(2,'0')+'T12:00:00Z'};
}
function state(bot:'entertainer'|'analyst'):BotMemory {
  const rel=Array.from({length:14},(_,i)=>['Team '+i,{teamName:'Team '+i,stance:'neutral',trustLevel:0,timesBurned:0,
    timesVindicated:0,playerOpinions:{},takeHistory:[{season:2026,week:i+1,take:'Week '+(i+1)}]}]);
  return {bot,updated_at:'2026-11-16',summaryMood:'Neutral',season:2026,teams:{},
    deepTeamRelationships:Object.fromEntries(rel),
    deepPlayerRelationships:{}} as unknown as BotMemory;
}
describe('compact source pack',()=>{
  it('preserves authoritative league facts and retains a bounded continuity selection',()=>{
    const mason=Array.from({length:125},(_,i)=>take('m'+i,9));
    const westy=Array.from({length:121},(_,i)=>take('w'+i,9));
    const learning={
      mason:buildCharacterLearning('entertainer',mason,westy),
      westy:buildCharacterLearning('analyst',westy,mason),
    };
    const full={
      league:{leagueId:'league1',scoringSettings:{reception:0.5}},
      rosters:[{name:'Belleview Badgers',players:['Mike Evans']}],
      draft:{draftId:'draft2027',status:'pre_draft'},
      historyAndTransactions:{trades:[{id:'t1'}]},
      lineupReview:{week:9,teams:[]},
      publishedContinuity:{mason,westy,health:{publishedIssues:12}},
      botContinuity:{
        currentSeason:{mason:state('entertainer'),westy:state('analyst')},
        priorSeason:{mason:null,westy:null},
        recentPublishedIssues:Array.from({length:6},(_,i)=>({id:'issue'+i})),
        forecastRecords:{entertainer:{w:0,l:0},analyst:{w:0,l:0}},
      },
    };
    const serialized=JSON.stringify(full);
    const slim=compactEpisodeSourcePack(full,learning);
    expect(slim.packSize).toBe('chatgpt-compact');
    expect(slim.schemaVersion).toBe(3);
    expect(slim.league).toEqual(full.league);
    expect(slim.rosters).toEqual(full.rosters);
    expect(slim.draft).toEqual(full.draft);
    expect(slim.historyAndTransactions).toEqual(full.historyAndTransactions);
    expect(slim.publishedContinuity.health).toEqual(full.publishedContinuity.health);
    expect(slim.publishedContinuity.mason.length).toBeLessThan(mason.length);
    expect(slim.publishedContinuity.westy.length).toBeLessThan(westy.length);
    expect(slim.publishedContinuity.totalReceiptsAvailableOnWebsite).toEqual({mason:125,westy:121});
    expect(slim.botContinuity.recentPublishedIssues).toHaveLength(2);
    expect(Object.keys(slim.botContinuity.currentSeason.mason!.deepTeamRelationships)).toHaveLength(9);
    expect(JSON.stringify(slim).length).toBeLessThan(serialized.length);
    expect(JSON.stringify(full)).toBe(serialized);
  });
  it('does not lose high-value archived receipts when they fall outside the recent window',()=>{
    const mason=Array.from({length:100},(_,i)=>take('m'+i,9));
    const special={...mason[0],subject:'A special 2026 title pick'};
    mason[0]=special;
    const learning={
      mason:buildCharacterLearning('entertainer',mason,[]),
      westy:buildCharacterLearning('analyst',[],mason),
    };
    const pack={
      publishedContinuity:{mason,westy:[]},
      botContinuity:{currentSeason:{mason:state('entertainer'),westy:state('analyst')},
        priorSeason:{mason:null,westy:null},recentPublishedIssues:[]},
    };
    const lean=compactEpisodeSourcePack(pack,learning);
    expect(lean.publishedContinuity.mason.some(x=>x.id==='m0')).toBe(true);
    expect(lean.publishedContinuity.mason.some(x=>x.id==='m99')).toBe(true);
  });
});

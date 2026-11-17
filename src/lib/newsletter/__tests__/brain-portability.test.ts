import {describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {GET} from '@/app/api/admin/newsletter/brain-export/route';
import {ENTERTAINER_BRAIN,ANALYST_BRAIN} from '../bot-brain';
import {buildCharacterLearning} from '../brain-learning';
import {buildActiveBrain,buildFullBrain,brainFilename,renderActiveBrainMarkdown} from '../brain-portability';
import type {BotMemory,BotName} from '../types';
import type {PublishedTakeLedgerEntry} from '../published-take-store';

function receipt(id:string,subject:string,stance:'positive'|'negative',week:number):PublishedTakeLedgerEntry {
  return {
    id,sourceNewsletterId:'issue-'+week,title:'Week '+week,episodeType:'regular',
    season:2026,week,subjectType:'team',subject,claim:subject+' has a convincing case because of the roster decisions and the scoring trends observed in Week '+week+'.',
    claimType:'evaluation',stance,confidence:.8,memorable:false,status:'active',
    publishedAt:'2026-11-'+String(week).padStart(2,'0')+'T15:00:00.000Z',
  };
}
const mason=[receipt('mason-a','Belleview Badgers','positive',3),receipt('mason-b','Belleview Badgers','positive',9)];
const westy=[receipt('westy-a','Belleview Badgers','negative',9)];
function memory(bot:BotName):BotMemory {
  return {
    bot,season:2026,updated_at:'2026-11-16T12:00:00Z',summaryMood:'Neutral',teams:{},
    personality:{confidence:38},
    deepTeamRelationships:{
      'Belleview Badgers':{
        teamName:'Belleview Badgers',stance:bot==='entertainer'?'believer':'skeptic',
        trustLevel:bot==='entertainer'?45:-35,timesBurned:0,timesVindicated:0,
        currentNarrative:bot==='entertainer'?'It could turn around.':'The roster is still thin.',
        playerOpinions:{},
        takeHistory:[{season:2026,week:9,take:'An independently held position.'}],
      },
    },
    deepPlayerRelationships:{},
  } as unknown as BotMemory;
}
function makeInput(bot:BotName,entries:PublishedTakeLedgerEntry[],cohost:PublishedTakeLedgerEntry[]) {
  const state=memory(bot);
  const ledger={entries,processedNewsletterIds:['issue-3','issue-9'],updatedAt:'2026-11-16T12:00:00Z',extractionVersion:8};
  const enhanced={brainAdmin:{revision:3,annotations:{},history:[{at:'now',action:'annotate'}]},publishedTakeLedgerState:ledger};
  return {
    bot,season:2026,exportedAt:'2026-11-16T20:00:00Z',
    identity:bot==='entertainer'?ENTERTAINER_BRAIN:ANALYST_BRAIN,
    currentMemory:state,rawEnhancedData:enhanced,publishedLedger:ledger,
    learning:buildCharacterLearning(bot,entries,cohost),
    adminSettings:{adminNotes:'Speak naturally and admit errors.'},
    phrasePools:{banned_global:['fake catchphrase']},
    publishedSources:[
      {id:'issue-3',title:'Week 3',week:3,episodeType:'regular',publishedAt:'2026-11-03',generatedAt:'2026-11-03'},
      {id:'issue-9',title:'Week 9',week:9,episodeType:'regular',publishedAt:'2026-11-09',generatedAt:'2026-11-09'},
    ],
  };
}

describe('phase 4 portable character brains',()=>{
  it('rejects anonymous requests before touching the database',async()=>{
    const r=await GET(new NextRequest('https://east-v-west.com/api/admin/newsletter/brain-export?bot=mason&depth=full&season=2026'));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('Admin access required');
  });
  it('makes Active Brains short and individually attributable',()=>{
    const a=buildActiveBrain(makeInput('entertainer',mason,westy));
    const b=buildActiveBrain(makeInput('analyst',westy,mason));
    const markdownA=renderActiveBrainMarkdown(a);
    const markdownB=renderActiveBrainMarkdown(b);
    expect(a.bot).toBe('entertainer');
    expect(b.bot).toBe('analyst');
    expect(a.identity.name).toBe('Mason Reed');
    expect(markdownA).toContain('Mason Reed | Active Brain');
    expect(markdownB).toContain('Trent');
    expect(markdownA).toContain('mason-b');
    expect(markdownA).not.toContain('westy-a):');
    expect(markdownA).toContain('Episode Source Pack');
    expect(JSON.stringify(a).length).toBeLessThan(35000);
    expect(markdownA.length).toBeLessThan(25000);
    expect(a.learning.performance.accuracy).toBeNull();
  });
  it('backs up all retained receipts and reviews, plus the source manifest',()=>{
    const input=makeInput('entertainer',mason,westy);
    const before=JSON.stringify(input);
    const full=buildFullBrain(input);
    expect(full.depth).toBe('full');
    expect(full.publishedLedger.entries.map(e=>e.id)).toEqual(['mason-a','mason-b']);
    expect(full.rawEnhancedData).toHaveProperty('brainAdmin');
    expect(full.sources.processedNewsletterIds).toHaveLength(2);
    expect(full.sources.publishedIssues).toHaveLength(2);
    expect(full.about.excludes).toMatch(/PDF/i);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('documents missing published source IDs rather than pretending they are archived',()=>{
    const input=makeInput('analyst',westy,mason);
    input.publishedLedger.processedNewsletterIds.push('missing-source');
    const full=buildFullBrain(input);
    expect(full.sources.missingSourceIds).toEqual(['missing-source']);
    expect(full.sources.publishedIssues).toHaveLength(2);
  });
  it('provides stable and appropriately named download files',()=>{
    expect(brainFilename('entertainer','active',2026,'md')).toBe('mason-reed-active-brain-2026.md');
    expect(brainFilename('analyst','full',2026,'json')).toBe('westy-weston-full-brain-2026.json');
  });
  it('does not serialize the complete receipt ledger in the Active Brain even when large',()=>{
    const receipts=Array.from({length:350},(_,i)=>receipt('large-'+i,'Team '+i,'positive',9));
    const input=makeInput('entertainer',receipts,[]);
    const active=buildActiveBrain(input);
    const full=buildFullBrain(input);
    expect(active.continuity.publishedReceiptsRetained).toBe(350);
    expect(active.learning.currentBeliefs).toHaveLength(12);
    expect(full.publishedLedger.entries).toHaveLength(350);
    expect(JSON.stringify(active).length).toBeLessThan(35000);
    expect(JSON.stringify(full).length).toBeGreaterThan(JSON.stringify(active).length);
  });
});

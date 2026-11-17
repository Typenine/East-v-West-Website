import { describe, expect, it } from 'vitest';
import {
  buildCharacterLearning,
  compactCharacterLearning,
  learningWritingInstructions,
  type LearningAdmin,
} from '../brain-learning';
import type { PublishedTakeLedgerEntry } from '../published-take-store';

const quote=(id:string,bot:'entertainer'|'analyst',subject:string,claim:string,stance:'positive'|'negative'|'neutral'|'mixed',
  week:number,claimType:'prediction'|'evaluation'|'reaction'|'strategy'='evaluation'):PublishedTakeLedgerEntry=>({
  id, sourceNewsletterId:'issue-'+week, title:'Week '+week, episodeType:'regular', season:2026, week,
  subjectType:'team', subject, claim, claimType, stance,
  confidence:0.8, memorable:false, status:'active',
  publishedAt:'2026-11-'+String(week).padStart(2,'0')+'T12:00:00Z',
});

const mason=[
  quote('m1','entertainer','Belleview Badgers','The Belleview Badgers are clearly rebuilding, but they have some upside.','positive',4),
  quote('m2','entertainer','Belleview Badgers','The Badgers might actually be on a different trajectory after these moves.','positive',9),
  quote('m3','entertainer','Red Pandas','I am taking Red Pandas to win the league this year.','positive',8,'prediction'),
];
const westy=[
  quote('w1','analyst','Belleview Badgers','The Badgers are still too thin at running back to contend this season.','negative',9),
  quote('w2','analyst','Red Pandas','Their roster construction is a big weakness in the playoffs.','negative',9),
];

describe('source-grounded character learning',()=>{
  it('keeps each host’s positions separate and identifies potential contrasts without inventing arguments',()=>{
    const a=buildCharacterLearning('entertainer',mason,westy);
    const b=buildCharacterLearning('analyst',westy,mason);
    const badgersA=a.currentBeliefs.find(x=>x.subject==='Belleview Badgers');
    const badgersB=b.currentBeliefs.find(x=>x.subject==='Belleview Badgers');
    expect(badgersA?.current.receiptId).toBe('m2');
    expect(badgersB?.current.receiptId).toBe('w1');
    expect(a.cohostContrasts.some(x=>x.subject==='Belleview Badgers')).toBe(true);
    expect(b.cohostContrasts.some(x=>x.subject==='Red Pandas')).toBe(true);
    expect(a.verifiedOutcomes).toHaveLength(0);
    expect(a.performance.accuracy).toBeNull();
    expect(a.performance.ungradedPredictions).toBe(1);
    expect(a.cohostContrasts[0].kind).toBe('opposing_published_stances');
  });

  it('excludes rejected and unreviewed damaged snippets rather than inserting untrusted quotes',()=>{
    const questionable={...mason[0],id:'broken',claim:'Lebanon Cake Eaters]] My pick is Mt.',qualityReviewRequired:true};
    const admin:LearningAdmin={annotations:{m1:{reviewStatus:'dismissed'},m2:{reviewStatus:'verified'}}};
    const x=buildCharacterLearning('entertainer',[...mason,questionable],westy,admin);
    expect(x.receiptsExcluded).toBe(2);
    expect(x.currentBeliefs.find(b=>b.subject==='Belleview Badgers')?.current.receiptId).toBe('m2');
    expect(x.currentBeliefs.every(b=>!b.current.statement.includes('Lebanon Cake Eaters]]'))).toBe(true);
  });

  it('does not count predictions as correct or wrong without verified evidence',()=>{
    const admin:LearningAdmin={outcomes:{m3:{
      receiptId:'m3',verdict:'correct',source:'',evidence:'',verifiedAt:'2026-11-15T00:00:00Z',
    }}};
    const x=buildCharacterLearning('entertainer',mason,westy,admin);
    expect(x.performance.correct).toBe(0);
    expect(x.performance.ungradedPredictions).toBe(1);
  });

  it('uses manually verified outcomes and approved development while preserving original receipts',()=>{
    const admin:LearningAdmin={
      annotations:{m2:{reviewStatus:'verified',pinned:true,correction:'The Badgers are rebuilding and the recent trades changed the forecast.'}},
      outcomes:{m3:{receiptId:'m3',verdict:'wrong',evidence:'The published final league standings show another team won the title.',
        source:'2026 league championship bracket',verifiedAt:'2026-12-28T15:00:00Z'}},
      developmentNotes:[{id:'approved1',kind:'bias',text:'Mason sometimes mistakes early momentum for sustainable depth.',
        receiptId:'m2',status:'approved'},{id:'rejected',kind:'lesson',text:'A rejected lesson must not be exported.',
        receiptId:'m1',status:'rejected'}],
      voiceSamples:[{receiptId:'m2',quote:'The Badgers might actually be on a different trajectory after these moves.',
        note:'Succinct enthusiasm without fake catchphrases',sourceNewsletterId:'issue-9'}],
    };
    const before=JSON.stringify(mason);
    const x=buildCharacterLearning('entertainer',mason,westy,admin);
    expect(x.performance).toMatchObject({wrong:1,correct:0,ungradedPredictions:0,accuracy:0});
    expect(x.currentBeliefs[0].current.statement).toContain('recent trades changed');
    expect(x.approvedLessons).toHaveLength(1);
    expect(x.approvedVoice).toHaveLength(1);
    expect(x.suggestedReview.some(s=>s.kind==='prediction_mistake'&&s.receiptId==='m3')).toBe(true);
    const prompt=learningWritingInstructions(x);
    expect(prompt).toContain('APPROVED bias');
    expect(prompt).toContain('VERIFIED PREDICTION WRONG');
    expect(prompt).not.toContain('A rejected lesson');
    expect(prompt).not.toContain('Their roster construction is a big weakness');
    expect(JSON.stringify(mason)).toBe(before);
  });

  it('recognizes an explicitly acknowledged changed opinion without grading it',()=>{
    const own=[
      quote('a','analyst','Cascade Marauders','This team is too weak to compete.','negative',3),
      {...quote('b','analyst','Cascade Marauders','I changed my mind after they beat the favorite.','positive',10),
        status:'reversed' as const},
    ];
    const x=buildCharacterLearning('analyst',own,[]);
    const belief=x.currentBeliefs[0];
    expect(belief.explicitRevision).toBe(true);
    expect(belief.earlierOpposingPosition?.receiptId).toBe('a');
    expect(x.suggestedReview.some(s=>s.kind==='possible_revision')).toBe(true);
    expect(x.performance.accuracy).toBeNull();
  });

  it('produces a bounded compact profile without copying the entire history into prompts',()=>{
    const own=Array.from({length:40},(_,i)=>quote('id'+i,'entertainer','Team '+i,'This is a substantial published opinion number '+i+'.',
      'positive',9));
    const x=buildCharacterLearning('entertainer',own,[]);
    const short=compactCharacterLearning(x,6);
    expect(x.currentBeliefs.length).toBe(40);
    expect(short.currentBeliefs).toHaveLength(6);
    expect(short.schemaVersion).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCharacterLearning,
  compactCharacterLearning,
  learningWritingInstructions,
  isUsableCurrentPosition,
  publishedSourceLabel,
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
  quote('m2','entertainer','Belleview Badgers','Belleview Badgers might actually be on a different trajectory after these moves.','positive',9),
  quote('m3','entertainer','Red Pandas','I am taking Red Pandas to win the league this year.','positive',8,'prediction'),
  quote('m4','entertainer','Red Pandas','Red Pandas have two healthy paths to a playoff run, and I like their available options.','positive',9),
];
const westy=[
  quote('w1','analyst','Belleview Badgers','Belleview Badgers are still too thin at running back to contend this season.','negative',9),
  quote('w2','analyst','Red Pandas','Red Pandas have a major roster construction weakness heading into the playoffs.','negative',9),
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
      voiceSamples:[{receiptId:'m2',quote:'Belleview Badgers might actually be on a different trajectory after these moves.',
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
      quote('a','analyst','Cascade Marauders','Cascade Marauders are too weak to compete this season and their roster still needs work.','negative',3),
      {...quote('b','analyst','Cascade Marauders','I changed my mind about Cascade Marauders after they beat the favorite in a real contest.','positive',10),
        status:'reversed' as const},
    ];
    const x=buildCharacterLearning('analyst',own,[]);
    const belief=x.currentBeliefs[0];
    expect(belief.explicitRevision).toBe(true);
    expect(belief.earlierOpposingPosition?.receiptId).toBe('a');
    expect(x.suggestedReview.some(s=>s.kind==='possible_revision')).toBe(true);
    expect(x.performance.accuracy).toBeNull();
  });

  it('does not promote unrelated matchup picks, captions or generic filler into persistent beliefs',()=>{
    const flawed=[
      quote('f1','analyst','Double Trouble',"Lebanon Cake Eaters Double Trouble / Detroit Dawgs Double Trouble Detroit Dawgs I'm watching the lineups.",'neutral',9),
      quote('f2','analyst','Bimg Bamg Boomg',"Then there's Bimg Bamg Boomg.",'neutral',9),
      quote('f3','analyst','Belleview Badgers',"I am taking Elemental Heroes to win tonight.",'neutral',9,'prediction'),
      quote('f4','analyst','Belleview Badgers',"I'm watching the lineups and waiting to see who starts.",'neutral',9),
      quote('f5','analyst','Bimg Bamg Boomg','Bimg Bamg Boomg has the higher season points total and the worse record.','neutral',8),
    ];
    expect(flawed.slice(0,4).every(x=>!isUsableCurrentPosition(x))).toBe(true);
    expect(isUsableCurrentPosition(flawed[4])).toBe(true);
    const x=buildCharacterLearning('analyst',flawed,[]);
    expect(x.currentBeliefs).toHaveLength(1);
    expect(x.currentBeliefs[0].current.receiptId).toBe('f5');
    expect(x.receiptsConsidered).toBe(5);
  });
  it('never treats special-edition storage timestamps as NFL weeks or as recency',()=>{
    const early={...quote('special','entertainer','Belleview Badgers',
      'Belleview Badgers are a team that should draft more running backs before contending.', 'negative',1787317300),
      title:'2026 Free Agency',episodeType:'special',publishedAt:'2026-08-21T13:00:00Z'};
    const recent=quote('week9','entertainer','Red Pandas',
      'Red Pandas can turn these strong performances into meaningful playoff momentum.', 'positive',9);
    const x=buildCharacterLearning('entertainer',[early,recent],[]);
    expect(x.currentBeliefs[0].subject).toBe('Red Pandas');
    expect(x.currentBeliefs[1].current.sourceLabel).toBe('2026 Free Agency');
    expect(publishedSourceLabel(recent)).toBe('Week 9');
    expect(learningWritingInstructions(x)).not.toContain('week 1787317300');
  });
  it('finds different evidence-backed host framing when both stances are neutral',()=>{
    const m=[
      quote('m-focus','entertainer','Red Pandas',
        'Red Pandas have to get the starting lineup right after another questionable benching decision this week.',
        'neutral',9),
    ];
    const w=[
      quote('w-focus','analyst','Red Pandas',
        'Red Pandas need to protect future draft assets rather than chase immediate wins with a short-term trade.',
        'neutral',9),
    ];
    const learning=buildCharacterLearning('entertainer',m,w);
    expect(learning.cohostContrasts).toHaveLength(1);
    expect(learning.cohostContrasts[0].kind).toBe('different_published_focus');
    expect(learning.cohostContrasts[0].reason).toContain('not an established disagreement');
    expect(learning.performance.accuracy).toBeNull();
  });
  it('offers authentic attributed voice candidates without approving them automatically',()=>{
    const m=[
      quote('voice-id','entertainer','Belleview Badgers',
        "I think Belleview Badgers might have a plan here, but I'm not buying the quick turnaround until I see two good weeks in a row.",
        'neutral',9),
    ];
    const learning=buildCharacterLearning('entertainer',m,[]);
    expect(learning.voiceCandidates.map(x=>x.receiptId)).toContain('voice-id');
    expect(learning.approvedVoice).toHaveLength(0);
    expect(learningWritingInstructions(learning)).not.toContain('APPROVED VOICE EXAMPLE');
    const reviewed=buildCharacterLearning('entertainer',m,[],{
      voiceSamples:[{receiptId:'voice-id',quote:m[0].claim,note:'Natural uncertainty',
        sourceNewsletterId:m[0].sourceNewsletterId}],
    });
    expect(reviewed.approvedVoice).toHaveLength(1);
    expect(reviewed.voiceCandidates).toHaveLength(0);
  });
  it('honors a manually approved opinion label while preserving the published classification',()=>{
    const source=quote('position-id','analyst','Red Pandas',
      'Red Pandas keep trading future assets for shallow short-term relief, and I cannot support this approach.',
      'neutral',9);
    const profile=buildCharacterLearning('analyst',[source],[],{
      annotations:{'position-id':{reviewStatus:'verified',stanceOverride:'negative'}},
    });
    expect(profile.currentBeliefs[0].current.stance).toBe('negative');
    expect(source.stance).toBe('neutral');
  });
  it('produces a bounded compact profile without copying the entire history into prompts',()=>{
    const own=Array.from({length:40},(_,i)=>quote('id'+i,'entertainer','Team '+i,'Team '+i+' has a meaningful published opinion backed by roster decisions and scoring trends '+i+'.',
      'positive',9));
    const x=buildCharacterLearning('entertainer',own,[]);
    const short=compactCharacterLearning(x,6);
    expect(x.currentBeliefs.length).toBe(40);
    expect(short.currentBeliefs).toHaveLength(6);
    expect(short.schemaVersion).toBe(1);
  });
});

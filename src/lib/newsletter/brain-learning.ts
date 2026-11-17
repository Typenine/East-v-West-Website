/**
 * Phase 3: deterministic character learning from published, attributed receipts.
 * The output is a grounded, versioned interpretation, not a model-weight update.
 * Never infer verified prediction outcomes, co-host dialogue or trait changes
 * from a sentiment heuristic. Core identity remains controlled separately.
 */
import type { BotName } from './types';
import type { PublishedTakeLedgerEntry } from './published-take-store';

export type Verdict = 'correct' | 'wrong' | 'void';
export type VerifiedOutcome = {
  receiptId: string;
  verdict: Verdict;
  evidence: string;
  source: string;
  verifiedAt: string;
};
export type LearningAnnotation = {
  reviewStatus?: 'unreviewed' | 'verified' | 'needs_review' | 'dismissed';
  pinned?: boolean;
  correction?: string;
  note?: string;
};
export type ApprovedDevelopment = {
  id: string;
  kind: 'lesson' | 'bias' | 'improvement';
  text: string;
  receiptId: string | null;
  status: 'proposed' | 'approved' | 'rejected';
};
export type ApprovedVoiceExample = {
  receiptId: string;
  quote: string;
  note: string;
  sourceNewsletterId: string;
};
export type LearningAdmin = {
  annotations?: Record<string, LearningAnnotation>;
  developmentNotes?: ApprovedDevelopment[];
  voiceSamples?: ApprovedVoiceExample[];
  outcomes?: Record<string, VerifiedOutcome>;
};
export type LearnedBelief = {
  subjectType: PublishedTakeLedgerEntry['subjectType'];
  subject: string;
  current: { receiptId: string; sourceNewsletterId: string; week: number; statement: string; stance: string; claimType: string; confidence: number };
  recentHistory: Array<{ receiptId: string; week: number; statement: string; stance: string }>;
  earlierOpposingPosition?: { receiptId: string; week: number; statement: string; stance: string };
  explicitRevision: boolean;
  pinned: boolean;
};
export type HostContrast = {
  subjectType: string;
  subject: string;
  mason: { receiptId: string; stance: string; statement: string };
  westy: { receiptId: string; stance: string; statement: string };
  kind: 'opposing_published_stances';
};
export type LearningSuggestion = {
  id: string;
  kind: 'correction' | 'possible_revision' | 'prediction_mistake';
  receiptId: string;
  sourceNewsletterId: string;
  reason: string;
};
export type CharacterLearningProfile = {
  schemaVersion: 1;
  bot: BotName;
  receiptsConsidered: number;
  receiptsExcluded: number;
  currentBeliefs: LearnedBelief[];
  cohostContrasts: HostContrast[];
  verifiedOutcomes: Array<VerifiedOutcome & { claim: string; subject: string }>;
  performance: { correct: number; wrong: number; void: number; accuracy: number | null; ungradedPredictions: number };
  approvedLessons: Array<{ kind: string; text: string; receiptId: string | null }>;
  approvedVoice: ApprovedVoiceExample[];
  suggestedReview: LearningSuggestion[];
  limitations: string[];
};

function chronology(a: PublishedTakeLedgerEntry,b: PublishedTakeLedgerEntry): number {
  return a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id);
}
function valid(entry: PublishedTakeLedgerEntry, admin: LearningAdmin): boolean {
  const status = admin.annotations?.[entry.id]?.reviewStatus;
  return status !== 'dismissed' && status !== 'needs_review' && (!entry.qualityReviewRequired || status === 'verified');
}
function statement(entry: PublishedTakeLedgerEntry, admin: LearningAdmin): string {
  return admin.annotations?.[entry.id]?.correction?.trim() || entry.claim;
}
function polarity(raw: string): 'positive' | 'negative' | null {
  return raw === 'positive' || raw === 'negative' ? raw : null;
}
function key(row: Pick<PublishedTakeLedgerEntry,'subjectType' | 'subject'>): string {
  return row.subjectType + ':' + row.subject.trim().toLocaleLowerCase('en-US');
}
function groupBeliefs(entries: PublishedTakeLedgerEntry[], admin: LearningAdmin): LearnedBelief[] {
  const groups = new Map<string, PublishedTakeLedgerEntry[]>();
  for(const row of entries) {
    const id = key(row);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const beliefs: LearnedBelief[]=[];
  for(const group of groups.values()){
    const history=group.sort(chronology);
    const current=history[history.length-1];
    const prior=history.slice(0,-1).reverse().find(x => polarity(x.stance) &&
      polarity(current.stance) && polarity(x.stance) !== polarity(current.stance));
    const explicitRevision = ['reversed','weakened','strengthened'].includes(current.status) ||
      /\b(?:changed my mind|was wrong|i retract|walk that back|taking that back|i was too high|i was too low|no longer believe)\b/i.test(current.claim);
    beliefs.push({
      subjectType:current.subjectType,
      subject:current.subject,
      current:{ receiptId:current.id,sourceNewsletterId:current.sourceNewsletterId,week:current.week,
        statement:statement(current,admin),stance:current.stance,claimType:current.claimType,confidence:current.confidence },
      recentHistory:history.slice(-4).reverse().map(x=>({receiptId:x.id,week:x.week,statement:statement(x,admin),stance:x.stance})),
      ...(prior?{earlierOpposingPosition:{receiptId:prior.id,week:prior.week,statement:statement(prior,admin),stance:prior.stance}}:{}),
      explicitRevision,pinned:Boolean(admin.annotations?.[current.id]?.pinned),
    });
  }
  return beliefs.sort((a,b)=> Number(b.pinned)-Number(a.pinned) ||
    b.current.week-a.current.week || a.subject.localeCompare(b.subject));
}

function contrasts(own: LearnedBelief[], other: LearnedBelief[], bot: BotName): HostContrast[] {
  const mapping = new Map(other.map(x=>[x.subjectType+':'+x.subject.toLowerCase(),x]));
  const contrasts:HostContrast[]=[];
  for(const belief of own){
    const opposing=mapping.get(belief.subjectType+':'+belief.subject.toLowerCase());
    if(!opposing)continue;
    const a=polarity(belief.current.stance),b=polarity(opposing.current.stance);
    if(!a||!b||a===b)continue;
    const mason=bot==='entertainer'?belief:opposing;
    const westy=bot==='analyst'?belief:opposing;
    contrasts.push({
      subjectType:belief.subjectType,subject:belief.subject,
      mason:{receiptId:mason.current.receiptId,stance:mason.current.stance,statement:mason.current.statement},
      westy:{receiptId:westy.current.receiptId,stance:westy.current.stance,statement:westy.current.statement},
      kind:'opposing_published_stances',
    });
  }
  return contrasts.slice(0,15);
}

export function buildCharacterLearning(
  bot: BotName,
  ownEntries: PublishedTakeLedgerEntry[],
  cohostEntries: PublishedTakeLedgerEntry[],
  admin: LearningAdmin = {},
  cohostAdmin: LearningAdmin = {},
): CharacterLearningProfile {
  const own=ownEntries.filter(x=>valid(x,admin)).sort(chronology);
  const other=cohostEntries.filter(x=>valid(x,cohostAdmin)).sort(chronology);
  const byId=new Map(ownEntries.map(e=>[e.id,e]));
  const currentBeliefs=groupBeliefs(own,admin);
  const otherBeliefs=groupBeliefs(other,cohostAdmin);
  const verifiedOutcomes=Object.values(admin.outcomes??{}).filter(outcome=>{
    const entry=byId.get(outcome.receiptId);
    return Boolean(entry && entry.claimType==='prediction' && valid(entry,admin) &&
      ['correct','wrong','void'].includes(outcome.verdict) &&
      outcome.evidence?.trim().length>=20 && outcome.source?.trim().length>=6);
  }).map(outcome=>({...outcome,claim:statement(byId.get(outcome.receiptId)!,admin),subject:byId.get(outcome.receiptId)!.subject}));
  const correct=verifiedOutcomes.filter(x=>x.verdict==='correct').length;
  const wrong=verifiedOutcomes.filter(x=>x.verdict==='wrong').length;
  const voided=verifiedOutcomes.filter(x=>x.verdict==='void').length;
  const approvedLessons=(admin.developmentNotes??[]).filter(x=>x.status==='approved')
    .slice(-30).map(x=>({kind:x.kind,text:x.text,receiptId:x.receiptId}));
  const approvedVoice=(admin.voiceSamples??[]).filter(x=>byId.has(x.receiptId) &&
    admin.annotations?.[x.receiptId]?.reviewStatus!=='dismissed').slice(-18);
  const suggestions:LearningSuggestion[]=[];
  const approvedSources=new Set((admin.developmentNotes??[]).filter(x=>x.status==='approved'||x.status==='proposed')
    .map(x=>x.receiptId).filter(Boolean));
  for(const entry of own.slice().reverse()){
    if(suggestions.length>=18)break;
    const text=entry.claim.toLowerCase();
    const proposed = verifiedOutcomes.find(x=>x.receiptId===entry.id&&x.verdict==='wrong');
    const kind:LearningSuggestion['kind']|null=proposed?'prediction_mistake':
      /\b(?:i was wrong|i got (?:this|that|it) wrong|i retract|i whiffed|i missed on)\b/.test(text)?'correction':
      /\b(?:changed my mind|taking that back|walk that back|i was too high|i was too low|no longer believe)\b/.test(text)?'possible_revision':null;
    if(!kind||approvedSources.has(entry.id))continue;
    suggestions.push({id:kind+':'+entry.id,kind,receiptId:entry.id,sourceNewsletterId:entry.sourceNewsletterId,
      reason:kind==='prediction_mistake'?'A verified outcome contradicted this published prediction. Consider a specific lesson.':
        kind==='correction'?'The host expressly acknowledged an earlier mistake. Verify the context.':
        'The host expressly reconsidered a previous position. Check the original claim before approving growth.'});
  }
  return {
    schemaVersion:1,bot,receiptsConsidered:own.length,receiptsExcluded:ownEntries.length-own.length,
    currentBeliefs,cohostContrasts:contrasts(currentBeliefs,otherBeliefs,bot),
    verifiedOutcomes,performance:{correct,wrong,void:voided,
      accuracy:correct+wrong?Math.round(correct/(correct+wrong)*100):null,
      ungradedPredictions:Math.max(0,own.filter(x=>x.claimType==='prediction').length-correct-wrong-voided)},
    approvedLessons,approvedVoice,suggestedReview:suggestions,
    limitations:[
      'Published statements and approved annotations are the only sources of character positions.',
      'Opposing sentiment labels are possible contrasts, not proof of a spoken argument.',
      'A prediction is scored only when an admin verifies its outcome and supplies evidence.',
      'Unverified changes do not alter personality traits or become hard lessons.',
    ],
  };
}

export function compactCharacterLearning(profile:CharacterLearningProfile, maxBeliefs=12) {
  return {
    schemaVersion:profile.schemaVersion,bot:profile.bot,
    currentBeliefs:profile.currentBeliefs.slice(0,maxBeliefs),
    cohostContrasts:profile.cohostContrasts.slice(0,6),
    verifiedOutcomes:profile.verifiedOutcomes.slice(-10),
    performance:profile.performance,
    approvedLessons:profile.approvedLessons.slice(-12),
    approvedVoice:profile.approvedVoice.slice(-8),
    suggestedReviewCount:profile.suggestedReview.length,
    limitations:profile.limitations,
  };
}

export function learningWritingInstructions(profile:CharacterLearningProfile): string {
  const lines=[
    'USE ONLY THIS HOST’S OWN PUBLISHED POSITIONS. Do not attribute the co-host’s opinions to this speaker.',
    'Distinguish statements the host made from current league facts and from hypotheses.',
    'A prior opinion may change only when new facts or an explicit later statement justify it.',
    'Do not invent admissions, growth lessons, arguments or successful/failed predictions.',
    'Keep the speaker’s natural voice; do not turn voice examples into repetitive catchphrases.',
  ];
  for(const b of profile.currentBeliefs.slice(0,8))
    lines.push('CURRENT POSITION on '+b.subject+' (week '+b.current.week+', receipt '+b.current.receiptId+'): '+b.current.statement.slice(0,240));
  for(const l of profile.approvedLessons.slice(-6))
    lines.push('APPROVED '+l.kind+': '+l.text.slice(0,270));
  for(const v of profile.approvedVoice.slice(-4))
    lines.push('APPROVED VOICE EXAMPLE ('+v.receiptId+'): '+v.quote.slice(0,260)+(v.note?' | why: '+v.note.slice(0,150):''));
  for(const o of profile.verifiedOutcomes.filter(x=>x.verdict!=='void').slice(-5))
    lines.push('VERIFIED PREDICTION '+o.verdict.toUpperCase()+' ('+o.receiptId+'): '+o.claim.slice(0,190)+' | evidence: '+o.evidence.slice(0,170));
  return lines.join('\n');
}

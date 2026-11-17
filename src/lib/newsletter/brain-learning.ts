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
  stanceOverride?: 'positive'|'negative'|'mixed'|'neutral';
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
  current: { receiptId: string; sourceNewsletterId: string; week: number; sourceLabel: string; publishedAt: string; statement: string; stance: string; focus: string | null; claimType: string; confidence: number };
  recentHistory: Array<{ receiptId: string; week: number; sourceLabel: string; statement: string; stance: string }>;
  earlierOpposingPosition?: { receiptId: string; week: number; sourceLabel: string; statement: string; stance: string };
  explicitRevision: boolean;
  pinned: boolean;
};
export type HostContrast = {
  subjectType: string;
  subject: string;
  mason: { receiptId: string; stance: string; statement: string };
  westy: { receiptId: string; stance: string; statement: string };
  kind: 'opposing_published_stances' | 'different_published_focus';
  reason: string;
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
  voiceCandidates: Array<{receiptId:string;sourceNewsletterId:string;sourceLabel:string;quote:string;reason:string}>;
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

/**
 * The ledger stores attributed transcript excerpts, not an editorially
 * approved psychological profile. A quote can be correctly attributed and
 * still be a fragment, scoreboard caption, or prediction about another team.
 * Filter only the CURRENT OPINION projection; leave historical source intact.
 */
export function isUsableCurrentPosition(entry:PublishedTakeLedgerEntry,annotation?:LearningAnnotation):boolean {
  const claim=(annotation?.correction?.trim()||entry.claim).trim();
  if(entry.qualityReviewRequired && annotation?.reviewStatus!=='verified') return false;
  if(claim.length<48 || claim.length>520) return false;
  if(entry.claimType==='prediction') return false;
  if(entry.claimType==='reaction' && !/\b(?:changed my mind|walk that back|i was wrong about|now believe|no longer believe|taking that back|i retract)\b/i.test(claim)) return false;
  if(/^\s*\d+(?:\.\d+)?(?:\s+|$)/.test(claim) || /\s\/\s/.test(claim)) return false;
  if(/^(?:then there'?s|that'?s the part|i'?m watching|i'?m with you|and this is why)\b/i.test(claim)) return false;
  if(/\[\[|\]\]/.test(claim)) return false;
  const subject=entry.subject.trim().toLowerCase();
  if(!subject) return false;
  if(entry.subjectType==='league')
    return /\b(?:i think|i believe|i expect|we should|we need|my conclusion|i'?m not|i'?m going to)\b/i.test(claim);
  // An explicitly verified admin clarification may use a shortened team name.
  if(annotation?.reviewStatus==='verified' && annotation.correction?.trim()) return true;
  // Without a stated subject, a disconnected sentence may have been
  // attributed solely because of a neighboring table or section heading.
  return claim.toLowerCase().includes(subject);
}

/** Special episodes use sentinel storage weeks, not NFL week numbers. */
export function publishedSourceLabel(entry:Pick<PublishedTakeLedgerEntry,'week'|'episodeType'|'title'>):string {
  if(entry.episodeType==='regular' && entry.week>=1 && entry.week<=18) return 'Week '+entry.week;
  if(entry.title?.trim()) return entry.title.trim();
  return 'Special issue';
}

/**
 * A factual topic emphasis is not a sentiment score. Two hosts may have
 * different arguments without being labeled 'positive' and 'negative'.
 */
export function publishedFocus(claim:string):string|null {
  if(/\b(?:tanking|benching|lineups?|starters?|start(?:ing|ed)?|sit(?:ting)?|intentional(?:ly)?\s+losing)\b/i.test(claim))
    return 'lineup decisions';
  if(/\b(?:trades?|roster construction|draft capital|draft picks?|future picks?|assets?|age curve|long.term|rebuild|taxi)\b/i.test(claim))
    return 'roster building';
  if(/\b(?:injur(?:ed|y|ies)|\bIR\b|\bPUP\b|bye|availability|healthy|returning from)\b/i.test(claim))
    return 'player availability';
  if(/\b(?:rankings?|wins?|loss(?:es)?|points?|scor(?:ing|ed)|playoffs?|standings|streak)\b/i.test(claim))
    return 'competitive results';
  return null;
}
function findVoiceCandidates(entries:PublishedTakeLedgerEntry[],admin:LearningAdmin) {
  const approved=new Set((admin.voiceSamples??[]).map(x=>x.receiptId));
  return [...entries].reverse().filter(e=>{
    const quote=statement(e,admin);
    return !approved.has(e.id) && valid(e,admin) &&
      quote.length>=75 && quote.length<=330 &&
      /\b(?:i think|i believe|i still|i'm|i am|i don't|my|here's|that's why|i would|i cannot|what i)\b/i.test(quote) &&
      !/^\s*\d+|\s\/\s/.test(quote) &&
      (e.subjectType==='league'||quote.toLowerCase().includes(e.subject.toLowerCase()));
  }).slice(0,8).map(e=>({
    receiptId:e.id,sourceNewsletterId:e.sourceNewsletterId,sourceLabel:publishedSourceLabel(e),
    quote:statement(e,admin),
    reason:'Possible authentic first-person voice example; review before approval.',
  }));
}

function key(row: Pick<PublishedTakeLedgerEntry,'subjectType' | 'subject'>): string {
  return row.subjectType + ':' + row.subject.trim().toLocaleLowerCase('en-US');
}
function groupBeliefs(entries: PublishedTakeLedgerEntry[], admin: LearningAdmin): LearnedBelief[] {
  const groups = new Map<string, PublishedTakeLedgerEntry[]>();
  for(const row of entries) {
    if(!isUsableCurrentPosition(row,admin.annotations?.[row.id])) continue;
    const id = key(row);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const beliefs: LearnedBelief[]=[];
  for(const group of groups.values()){
    const history=group.sort(chronology);
    const current=history[history.length-1];
    const prior=history.slice(0,-1).reverse().find(x => polarity(x.stance) &&
      polarity(admin.annotations?.[current.id]?.stanceOverride??current.stance) &&
      polarity(admin.annotations?.[x.id]?.stanceOverride??x.stance) !==
        polarity(admin.annotations?.[current.id]?.stanceOverride??current.stance));
    // Status changes are heuristic; only an explicit published admission counts
    // as an explicit reversal or correction.
    const explicitRevision = /\b(?:changed my mind|i was wrong about|i retract|walk that back|taking that back|i was too high|i was too low|no longer believe)\b/i.test(statement(current,admin));
    beliefs.push({
      subjectType:current.subjectType,
      subject:current.subject,
      current:{ receiptId:current.id,sourceNewsletterId:current.sourceNewsletterId,week:current.week,
        sourceLabel:publishedSourceLabel(current),publishedAt:current.publishedAt,
        statement:statement(current,admin),stance:admin.annotations?.[current.id]?.stanceOverride??current.stance,
        focus:publishedFocus(statement(current,admin)),claimType:current.claimType,confidence:current.confidence },
      recentHistory:history.slice(-4).reverse().map(x=>({receiptId:x.id,week:x.week,sourceLabel:publishedSourceLabel(x),statement:statement(x,admin),stance:admin.annotations?.[x.id]?.stanceOverride??x.stance})),
      ...(prior?{earlierOpposingPosition:{receiptId:prior.id,week:prior.week,sourceLabel:publishedSourceLabel(prior),statement:statement(prior,admin),stance:admin.annotations?.[prior.id]?.stanceOverride??prior.stance}}:{}),
      explicitRevision,pinned:Boolean(admin.annotations?.[current.id]?.pinned),
    });
  }
  return beliefs.sort((a,b)=> Number(b.pinned)-Number(a.pinned) ||
    b.current.publishedAt.localeCompare(a.current.publishedAt) || a.subject.localeCompare(b.subject));
}

function contrasts(own: LearnedBelief[], other: LearnedBelief[], bot: BotName): HostContrast[] {
  const mapping=new Map(other.map(x=>[x.subjectType+':'+x.subject.toLowerCase(),x]));
  const result:HostContrast[]=[];
  for(const belief of own) {
    const opposite=mapping.get(belief.subjectType+':'+belief.subject.toLowerCase());
    if(!opposite)continue;
    const polarityA=polarity(belief.current.stance),polarityB=polarity(opposite.current.stance);
    const opposing=Boolean(polarityA&&polarityB&&polarityA!==polarityB);
    const different=Boolean(belief.current.focus&&opposite.current.focus&&belief.current.focus!==opposite.current.focus);
    if(!opposing&&!different)continue;
    const mason=bot==='entertainer'?belief:opposite,westy=bot==='analyst'?belief:opposite;
    result.push({
      subjectType:belief.subjectType,subject:belief.subject,
      mason:{receiptId:mason.current.receiptId,stance:mason.current.stance,statement:mason.current.statement},
      westy:{receiptId:westy.current.receiptId,stance:westy.current.stance,statement:westy.current.statement},
      kind:opposing?'opposing_published_stances':'different_published_focus',
      reason:opposing
        ? 'Opposing published sentiment labels, not proof of a prior conversation.'
        : 'Different documented focus: Mason ('+(mason.current.focus??'unknown')+
          ') and Westy ('+(westy.current.focus??'unknown')+'). This is not an established disagreement.',
    });
  }
  return result.sort((x,y)=>Number(y.kind==='opposing_published_stances')-
    Number(x.kind==='opposing_published_stances')).slice(0,15);
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
    voiceCandidates:findVoiceCandidates(ownEntries,admin),
    limitations:[
      'Published statements and approved annotations are the only sources of character positions.',
      'Opposing sentiment labels are possible contrasts, not proof of a spoken argument.',
      'Different published focus is distinct framing, not an inferred contradiction.',
      'A prediction is scored only when an admin verifies its outcome and supplies evidence.',
      'Unverified changes do not alter personality traits or become hard lessons.',
      'Current positions exclude weak excerpts and matchup picks; they remain auditable in the complete ledger.',
      'Positions are extracted from published text, not independent observations or human fact-checking.',
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
    voiceCandidates:profile.voiceCandidates.slice(0,4),
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
    lines.push('CURRENT POSITION on '+b.subject+' ('+b.current.sourceLabel+', receipt '+b.current.receiptId+'): '+b.current.statement.slice(0,240));
  for(const l of profile.approvedLessons.slice(-6))
    lines.push('APPROVED '+l.kind+': '+l.text.slice(0,270));
  for(const v of profile.approvedVoice.slice(-4))
    lines.push('APPROVED VOICE EXAMPLE ('+v.receiptId+'): '+v.quote.slice(0,260)+(v.note?' | why: '+v.note.slice(0,150):''));
  for(const o of profile.verifiedOutcomes.filter(x=>x.verdict!=='void').slice(-5))
    lines.push('VERIFIED PREDICTION '+o.verdict.toUpperCase()+' ('+o.receiptId+'): '+o.claim.slice(0,190)+' | evidence: '+o.evidence.slice(0,170));
  return lines.join('\n');
}

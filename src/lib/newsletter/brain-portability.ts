/**
 * Two deliberately different portable artifacts for each East v. West host.
 *
 * Active: a bounded, readable current snapshot for ChatGPT newsletter work.
 * Full: every currently stored season memory, receipt, admin review and source
 * reference available for backup/inspection. The full archive does NOT contain
 * the original newsletter PDFs, which remain stored on the website.
 *
 * No inference, writes or data retrieval here. All inputs are already vetted
 * as belonging to one authenticated season and character.
 */
import type { BotBrain } from './bot-brain';
import type { BotMemory, BotName } from './types';
import type { PublishedTakeLedgerState } from './published-take-store';
import type { CharacterLearningProfile } from './brain-learning';
import { compactCharacterLearning } from './brain-learning';

export type BrainFormat = 'md' | 'json';
export type BrainDepth = 'active' | 'full';

export interface BrainExportSource {
  id: string;
  title: string | null;
  week: number;
  episodeType: string | null;
  publishedAt: string | null;
  generatedAt: string;
}

export interface BrainExportInput {
  bot: BotName;
  season: number;
  exportedAt: string;
  identity: BotBrain;
  currentMemory: BotMemory;
  rawEnhancedData: Record<string, unknown>;
  publishedLedger: PublishedTakeLedgerState;
  learning: CharacterLearningProfile;
  adminSettings: unknown;
  phrasePools: Record<string, string[]>;
  publishedSources: BrainExportSource[];
}

const ACTIVE_TEAM_LIMIT=9;
const ACTIVE_PLAYER_LIMIT=9;

function teamSnapshot(memory:BotMemory, learning:CharacterLearningProfile) {
  const current=new Map(learning.currentBeliefs.filter(x=>x.subjectType==='team')
    .map((x,i)=>[x.subject.toLowerCase(),{item:x,rank:i}]));
  const teams=Object.values(memory.deepTeamRelationships??{});
  return teams.sort((a,b)=>{
    const ar=current.get(a.teamName.toLowerCase())?.rank??1000;
    const br=current.get(b.teamName.toLowerCase())?.rank??1000;
    return ar-br || (b.takeHistory?.length??0)-(a.takeHistory?.length??0);
  }).slice(0,ACTIVE_TEAM_LIMIT).map(t=>{
    const belief=current.get(t.teamName.toLowerCase())?.item;
    return {
      team:t.teamName,stance:t.stance,trust:t.trustLevel,
      source:belief?.current.sourceLabel??null,
      // Do not carry a stale or garbled unreviewed "currentNarrative"
      // into the compact brain merely because hydration stored it last.
      narrative:belief?.current.statement.slice(0,230)??null,
    };
  });
}
function playerSnapshot(memory:BotMemory, learning:CharacterLearningProfile) {
  const current=new Map(learning.currentBeliefs.filter(x=>x.subjectType==='player')
    .map((x,i)=>[x.subject.toLowerCase(),{item:x,rank:i}]));
  return Object.values(memory.deepPlayerRelationships??{})
    .sort((a,b)=>(current.get(a.playerName.toLowerCase())?.rank??1000) -
      (current.get(b.playerName.toLowerCase())?.rank??1000) ||
      (b.history?.length??0)-(a.history?.length??0))
    .slice(0,ACTIVE_PLAYER_LIMIT).map(p=>{
      const belief=current.get(p.playerName.toLowerCase())?.item;
      return {
        player:p.playerName,team:p.team??null,sentiment:p.sentiment,trust:p.trustLevel,
        source:belief?.current.sourceLabel??null,
        recentPublishedTake:belief?.current.statement.slice(0,230)??null,
      };
    });
}
function cleanNotes(raw:unknown): string {
  return typeof raw==='string'?raw.slice(0,1000):'';
}
function getAdminNotes(input:BrainExportInput): string {
  const value=input.adminSettings;
  if(!value||typeof value!=='object')return '';
  return cleanNotes((value as {adminNotes?:unknown}).adminNotes);
}

const GUIDELINES=[
  'Speak as this character, never as a generic analyst or an assistant describing the character.',
  'Keep this host’s beliefs distinct from the other host’s. Other-host quotations are reference material only.',
  'Use the separate Episode Source Pack as authoritative for current league facts; this file is for character continuity.',
  'Use the latest supported position, but preserve the history of meaningful changes and cite prior weeks when relevant.',
  'Only outcomes with verified evidence have been graded. Ungraded predictions are not wins or losses.',
  'Approved voice examples establish natural rhythm, not phrases to repeat verbatim.',
  'Do not claim human experience, independently observed events, or remembered conversations that are not documented.',
  'Avoid generic AI-sounding monologues, symmetrical debates, theatrical metaphors and forced catchphrases.',
];

export function buildActiveBrain(input:BrainExportInput) {
  const learning=compactCharacterLearning(input.learning,12);
  return {
    schemaVersion:1,
    format:'east-v-west-character-brain',
    depth:'active',
    exportedAt:input.exportedAt,
    season:input.season,
    bot:input.bot,
    host:input.identity.displayName,
    identity:{
      name:input.identity.displayName,
      alias:input.identity.shortName,
      role:input.identity.role,
      voice:input.identity.voice,
      debate:input.identity.debate,
      baselineTraits:input.identity.baseTraits,
      blindSpots:input.identity.blindSpots.slice(0,6),
      boundaries:input.identity.safetyBoundaries.slice(0,8),
      verbalTics:input.identity.verbalTics.slice(0,5),
      openers:input.identity.openers.slice(0,5),
      closers:input.identity.closers.slice(0,5),
      adminNotes:getAdminNotes(input),
    },
    currentState:{
      traits:input.currentMemory.personality??null,
      mood:input.currentMemory.summaryMood,
      emotionalState:input.currentMemory.emotionalState??null,
      lastGeneratedWeek:input.currentMemory.lastGeneratedWeek??null,
    },
    learning,
    relationshipSnapshot:{teams:teamSnapshot(input.currentMemory,input.learning),players:playerSnapshot(input.currentMemory,input.learning)},
    continuity:{
      publishedReceiptsRetained:input.publishedLedger.entries.length,
      publishedIssuesProcessed:input.publishedLedger.processedNewsletterIds.length,
      lastLedgerUpdate:input.publishedLedger.updatedAt,
      ledgerVersion:input.publishedLedger.extractionVersion,
      excludedFromLearning:input.learning.receiptsExcluded,
    },
    writingGuidelines:GUIDELINES,
  } as const;
}

export function buildFullBrain(input:BrainExportInput) {
  const sourceIds=new Set(input.publishedLedger.processedNewsletterIds);
  const sources=input.publishedSources
    .filter(x=>sourceIds.has(x.id) || input.publishedLedger.entries.some(entry=>entry.sourceNewsletterId===x.id))
    .sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt));
  const covered=new Set(sources.map(x=>x.id));
  return {
    schemaVersion:1,
    format:'east-v-west-character-brain',
    depth:'full',
    exportedAt:input.exportedAt,
    season:input.season,
    bot:input.bot,
    host:input.identity.displayName,
    about:{
      purpose:'Portable backup and inspectable reference of this host’s presently retained website brain data.',
      includes:'Complete stored season memory, published-take ledger, original extraction text where retained, evidence reviews, voice samples, development decisions and available newsletter source references.',
      excludes:'Original newsletter PDF files and unpublished drafts are not embedded. Open source newsletters on East v. West by issue ID.',
      retention:'The ledger is bounded on the website. This export includes all currently retained takes, not an assurance of unlimited all-time storage.',
      restore:'A reference snapshot, not an automatic database import operation.',
    },
    identity:input.identity,
    adminSettings:input.adminSettings,
    phrasePools:input.phrasePools,
    currentMemory:input.currentMemory,
    rawEnhancedData:input.rawEnhancedData,
    publishedLedger:input.publishedLedger,
    learning:input.learning,
    sources:{
      processedNewsletterIds:input.publishedLedger.processedNewsletterIds,
      publishedIssues:sources,
      missingSourceIds:input.publishedLedger.processedNewsletterIds.filter(id=>!covered.has(id)),
      receiptsInLedger:input.publishedLedger.entries.length,
    },
    writingGuidelines:GUIDELINES,
  } as const;
}

function formatLines(values:readonly string[]):string {
  return values.length?values.map(x=>'- '+x).join('\n'):'- Nothing recorded';
}
function excerpt(text:string,max=240):string {
  return text.replace(/\s+/g,' ').trim().slice(0,max);
}
function heading(text:string){return '\n\n## '+text+'\n\n';}

export function renderActiveBrainMarkdown(data:ReturnType<typeof buildActiveBrain>):string {
  const l=data.learning;
  const lines=[
    '# '+data.host+' | Active Brain | '+data.season,
    '',
    'Exported: '+data.exportedAt,
    'Use this one host’s ACTIVE brain alongside the Writing Room and the current Episode Source Pack. Do not upload the Full Brain for routine weekly writing.',
    heading('Character identity'),
    '**Role:** '+data.identity.role,
    '**Voice:** '+JSON.stringify(data.identity.voice),
    '**Debate style:** '+JSON.stringify(data.identity.debate),
    '**Baseline traits:** '+JSON.stringify(data.identity.baselineTraits),
    '**Known blind spots:** '+data.identity.blindSpots.join('; '),
    '**Current personality:** '+JSON.stringify(data.currentState.traits),
    '**Mood:** '+data.currentState.mood,
    data.identity.adminNotes?'**Approved admin guidance:** '+data.identity.adminNotes:'',
    heading('Current positions with source receipts'),
    l.currentBeliefs.length?l.currentBeliefs.map(b=>
      '- **'+b.subject+'** ('+b.current.sourceLabel+', '+b.current.stance+', receipt '+b.current.receiptId+'): '+
      excerpt(b.current.statement,300)+(b.earlierOpposingPosition?
        ' Earlier position, '+b.earlierOpposingPosition.sourceLabel+': '+excerpt(b.earlierOpposingPosition.statement,135):'')
    ).join('\n'):'- No attributable current positions have cleared review.',
    heading('Verified prediction history'),
    'Correct: '+l.performance.correct+'; wrong: '+l.performance.wrong+'; void: '+l.performance.void+
      '; still ungraded: '+l.performance.ungradedPredictions+
      '; verified accuracy: '+(l.performance.accuracy===null?'not yet established':l.performance.accuracy+'%')+'.',
    l.verifiedOutcomes.length?l.verifiedOutcomes.map(x=>
      '- '+x.verdict.toUpperCase()+' ('+x.receiptId+'): '+excerpt(x.claim,160)+
      ' | evidence: '+excerpt(x.evidence,170)+' | source: '+x.source
    ).join('\n'):'- No verified prediction outcomes yet. Do not claim a record.',
    heading('Approved development'),
    l.approvedLessons.length?l.approvedLessons.map(x=>
      '- '+x.kind+': '+excerpt(x.text,350)+(x.receiptId?' (receipt '+x.receiptId+')':'')
    ).join('\n'):'- No approved learning lessons yet. Avoid inventing character growth.',
    heading('Approved natural voice examples'),
    l.approvedVoice.length?l.approvedVoice.map(x=>
      '- '+excerpt(x.quote,330)+' (receipt '+x.receiptId+')'+(x.note?' | Why: '+excerpt(x.note,140):'')
    ).join('\n'):'- No authentic voice passages approved yet. Follow the stable identity.',
    heading('Recent team relationships'),
    data.relationshipSnapshot.teams.length?data.relationshipSnapshot.teams.map(x=>
      '- '+x.team+' | stance '+x.stance+' | trust '+x.trust+
      ' | '+(x.source??'No vetted recent position')+' | '+excerpt(x.narrative||'',200)
    ).join('\n'):'- No team relationship history saved.',
    heading('Recent player relationships'),
    data.relationshipSnapshot.players.length?data.relationshipSnapshot.players.map(x=>
      '- '+x.player+' | '+x.sentiment+' | trust '+x.trust+
      ' | '+(x.source??'No vetted recent position')+' | '+excerpt(x.recentPublishedTake||'',200)
    ).join('\n'):'- No player relationship history saved.',
    heading('Potential co-host differences'),
    l.cohostContrasts.length?l.cohostContrasts.map(x=>
      '- '+x.subject+': Mason previously said '+excerpt(x.mason.statement,150)+
      '; Westy previously said '+excerpt(x.westy.statement,150)+
      ' (possible difference, not a proven spoken argument)'
    ).join('\n'):'- No confident evidence of opposing latest stances. Do not manufacture a disagreement.',
    heading('Writing instructions'),
    formatLines(data.writingGuidelines),
    '',
    'This file is a selective snapshot, not the full archive. Full retained records are available through the separate Full Brain JSON download.',
    '',
  ];
  return lines.join('\n');
}

export function brainFilename(bot:BotName,depth:BrainDepth,season:number,format:BrainFormat):string {
  const name=bot==='entertainer'?'mason-reed':'westy-weston';
  return name+'-'+depth+'-brain-'+season+'.'+format;
}

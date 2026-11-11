import { eq } from 'drizzle-orm';
import { extractText, getDocumentProxy } from 'unpdf';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import { listNewslettersMeta, loadNewsletterById } from '@/server/db/newsletter-queries';
import { presignGet } from '@/server/storage/r2';
import { buildScoreboard, extractEditorial, type EditorialExtract } from './editorial-tracking';

type UploadedData = { key?: string; editorialTracking?: EditorialExtract; [key:string]:unknown };
type IssueSection = { type:string; data:unknown };
type IssueContent = { meta:unknown; sections:IssueSection[]; [key:string]:unknown };

async function extractFromIssue(issueId:string):Promise<EditorialExtract|null>{
  const loaded=await loadNewsletterById(issueId);
  if(!loaded||loaded.status!=='published'||loaded.episodeType!=='regular')return null;
  const doc=loaded.newsletter as IssueContent;
  const section=doc.sections.find(s=>s.type==='UploadedPdf');
  if(!section||typeof section.data!=='object'||!section.data)return null;
  const data=section.data as UploadedData;
  if(data.editorialTracking?.version===1)return data.editorialTracking;
  if(!data.key?.startsWith('newsletter/uploads/'))return null;

  const url=await presignGet({key:data.key,expiresSec:180});
  const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(120_000)});
  if(!res.ok)throw new Error('Newsletter PDF fetch returned '+res.status);
  const bytes=new Uint8Array(await res.arrayBuffer());
  const pdf=await getDocumentProxy(bytes,{maxImageSize:16_777_216});
  if(pdf.numPages<1||pdf.numPages>80)throw new Error('Unexpected newsletter page count');
  const extracted=await extractText(pdf,{mergePages:true});
  const raw=Array.isArray(extracted.text)?extracted.text.join('\n'):extracted.text;
  if(!raw||raw.trim().length<100)return null;

  const record=extractEditorial(raw,loaded.season,loaded.week);
  const updated:IssueContent={...doc,sections:doc.sections.map(s=>
    s===section?{...s,data:{...data,editorialTracking:record}}:s)};
  await getDb().update(newsletters).set({content:updated,updatedAt:new Date()}).where(eq(newsletters.id,issueId));
  return record;
}

/** Cache extraction under the published newsletter itself. Re-running is idempotent.
 * Historical PDFs are backfilled when the next source pack is requested.
 * Replacing a published issue naturally replaces its record because snapshots only
 * query currently published rows, never drafts.
 */
export async function getPublishedEditorialSnapshot(season:number,throughWeek:number){
  const metas=(await listNewslettersMeta(season))
    .filter(x=>x.status==='published'&&x.episodeType==='regular'&&x.week>=1&&x.week<=throughWeek)
    .sort((a,b)=>a.week-b.week||a.generatedAt.localeCompare(b.generatedAt));
  const issues:EditorialExtract[]=[];
  const unresolvedIssues:string[]=[];
  // Sequential read limits concurrent R2/PDF work on the free hosting tier.
  for(const meta of metas){
    try{
      const value=await extractFromIssue(meta.id);
      if(value)issues.push(value);
      else unresolvedIssues.push(meta.id);
    }catch(error){
      unresolvedIssues.push(meta.id);
      console.warn('[EditorialTracking] Unable to extract '+meta.id,error instanceof Error?error.message:String(error));
    }
  }
  const scoreboard=buildScoreboard(issues);
  const allWatches=issues.flatMap(i=>i.stockWatch).sort((a,b)=>a.week-b.week);
  return {
    scoreboard:{
      ...scoreboard,
      verified:scoreboard.verified&&unresolvedIssues.length===0,
      label:scoreboard.verified&&unresolvedIssues.length===0?'Verified published picks':'Incomplete archive; do not print a full season record',
      scope:'Matchup winner picks only; excludes preseason and subjective forecasts',
    },
    stockWatch:{
      history:allWatches.slice(-40),
      revisitCandidates:allWatches.slice(-24),
      instruction:'Past Stock Watch remarks are accountable, attributed observations. Follow up on claims when verified new developments matter, including several weeks later. They are not automatically wrong because an anticipated opportunity has not happened. Clancy may challenge definite earlier predictions using actual outcomes; no forced weekly callbacks.',
    },
    extractionHealth:{
      publishedIssues:metas.length,
      indexedIssues:issues.length,
      unresolvedIssueIds:unresolvedIssues,
      perIssueWarnings:issues.filter(i=>i.warnings.length).map(i=>({week:i.issueWeek,warnings:i.warnings})),
    },
  };
}

/** Called after an exact issue is published. Does not record draft material. */
export async function recordPublishedEditorialIssue(issueId:string){
  return extractFromIssue(issueId);
}

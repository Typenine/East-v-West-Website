import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { ENTERTAINER_BRAIN, ANALYST_BRAIN } from '@/lib/newsletter/bot-brain';
import { loadBotSettings } from '@/server/db/personality-queries';
import { loadBotMemory, listNewslettersMeta } from '@/server/db/newsletter-queries';
import { loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';
import { getDb } from '@/server/db/client';
import { botMemory } from '@/server/db/schema';
import type { BotName } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Review = 'unreviewed' | 'verified' | 'needs_review' | 'dismissed';
type Annotation = { reviewStatus: Review; pinned: boolean; note: string; correction: string; updatedAt: string };
type Sample = { id: string; receiptId: string; quote: string; note: string; sourceNewsletterId: string; addedAt: string };
type Development = { id: string; kind: 'lesson' | 'bias' | 'improvement'; text: string; receiptId: string | null; status: 'proposed' | 'approved' | 'rejected'; createdAt: string; updatedAt: string };
type BrainAdmin = { revision: number; annotations: Record<string, Annotation>; voiceSamples: Sample[]; developmentNotes: Development[]; history: Array<{ at: string; action: string; receiptId?: string }> };
function parseAdmin(raw: unknown): BrainAdmin {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<BrainAdmin> : {};
  return {
    revision: Number.isInteger(s.revision) ? s.revision! : 0,
    annotations: s.annotations && typeof s.annotations === 'object' && !Array.isArray(s.annotations) ? s.annotations : {},
    voiceSamples: Array.isArray(s.voiceSamples) ? s.voiceSamples : [],
    developmentNotes: Array.isArray(s.developmentNotes) ? s.developmentNotes : [],
    history: Array.isArray(s.history) ? s.history : [],
  };
}
function botOf(raw: unknown): BotName | null { return raw === 'entertainer' || raw === 'analyst' ? raw : null; }
function yearOf(raw: unknown): number | null { const n = Number(raw ?? 2026); return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null; }
function cut(raw: unknown, max: number): string { return typeof raw === 'string' ? raw.trim().slice(0, max) : ''; }
function authorized(req: NextRequest): boolean { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); }

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const bot = botOf(req.nextUrl.searchParams.get('bot'));
  const season = yearOf(req.nextUrl.searchParams.get('season'));
  const view = req.nextUrl.searchParams.get('view') ?? 'overview';
  if (!bot || !season || !['overview','memories','relationships','growth','voice','history'].includes(view))
    return Response.json({ error: 'Invalid query' }, { status: 400 });
  try {
    const db = getDb();
    const [memory, ledger, allIssues, settings, rows] = await Promise.all([
      loadBotMemory(bot, season), loadPublishedTakeLedgerState(bot, season), listNewslettersMeta(season),
      loadBotSettings(bot),
      db.select({ enhancedData: botMemory.enhancedData }).from(botMemory).where(and(eq(botMemory.bot, bot), eq(botMemory.season, season))).limit(1),
    ]);
    if (!memory || !rows.length) return Response.json({ error: 'No character memory for this season' }, { status: 404 });
    const raw = (rows[0].enhancedData ?? {}) as Record<string, unknown>;
    const admin = parseAdmin(raw.brainAdmin);
    const issues = allIssues.filter(x => x.status === 'published');
    const source = new Map(issues.map(x => [x.id, x]));
    const brain = bot === 'entertainer' ? ENTERTAINER_BRAIN : ANALYST_BRAIN;
    const summary = {
      name: settings?.displayName || brain.displayName, role: settings?.roleDescription || brain.role,
      updatedAt: memory.updated_at, personality: memory.personality ?? null, mood: memory.summaryMood,
      emotion: memory.emotionalState ?? null, takes: ledger.entries.length,
      predictions: ledger.entries.filter(e => e.claimType === 'prediction').length,
      reviewPending: ledger.entries.filter(e => e.qualityReviewRequired && !['verified','dismissed'].includes(admin.annotations[e.id]?.reviewStatus ?? '')).length,
      publishedIssues: issues.length, processedIssues: ledger.processedNewsletterIds.filter(id => source.has(id)).length,
      teams: Object.keys(memory.deepTeamRelationships ?? {}).length, players: Object.keys(memory.deepPlayerRelationships ?? {}).length,
      growthLessons: memory.personalGrowth?.hardLessons.length ?? 0,
      approvedDevelopments: admin.developmentNotes.filter(n => n.status === 'approved').length,
      voiceExamples: admin.voiceSamples.length,
    };
    const common = { bot, season, view, summary, revision: admin.revision };
    if (view === 'overview') return Response.json({ ...common,
      teams: Object.values(memory.deepTeamRelationships ?? {}).filter(x => x.currentNarrative)
        .sort((a,b) => b.takeHistory.length - a.takeHistory.length).slice(0,8).map(x => ({
          name: x.teamName, trust: x.trustLevel, stance: x.stance, takes: x.takeHistory.length, narrative: x.currentNarrative,
        })),
      recent: ledger.entries.slice(-6).reverse().map(x => ({ id:x.id, claim:x.claim, subject:x.subject, week:x.week, type:x.claimType })),
      proposed: admin.developmentNotes.filter(n=>n.status==='proposed').length,
    });
    if (view === 'memories') {
      const q = cut(req.nextUrl.searchParams.get('q'),120).toLowerCase();
      const kind = cut(req.nextUrl.searchParams.get('kind'),25);
      const review = cut(req.nextUrl.searchParams.get('review'),25);
      const page = Math.max(1,Math.min(100,Number(req.nextUrl.searchParams.get('page'))||1));
      const pageSize = 12;
      const matches = ledger.entries.filter(e => {
        const annotation = admin.annotations[e.id];
        return (!q || [e.id,e.claim,e.subject,e.title??'',e.originalClaim??''].some(v=>v.toLowerCase().includes(q)))
          && (!kind || kind==='all' || e.claimType===kind)
          && (review!=='flagged' || (e.qualityReviewRequired && !['verified','dismissed'].includes(annotation?.reviewStatus??'')))
          && (review!=='pinned' || annotation?.pinned)
          && (review!=='verified' || annotation?.reviewStatus==='verified');
      }).sort((a,b) => Number(Boolean(admin.annotations[b.id]?.pinned))-Number(Boolean(admin.annotations[a.id]?.pinned))
        || b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
      return Response.json({ ...common, total: matches.length, page, pageSize,
        entries:matches.slice((page-1)*pageSize,page*pageSize).map(e=>({
          ...e, annotation:admin.annotations[e.id]??null, voiceSample: admin.voiceSamples.some(s=>s.receiptId===e.id),
          source:source.get(e.sourceNewsletterId)
            ? { id:e.sourceNewsletterId, title:source.get(e.sourceNewsletterId)!.title, week:source.get(e.sourceNewsletterId)!.week }
            : { id:e.sourceNewsletterId, title:e.title, week:e.week },
        })),
      });
    }
    if (view === 'relationships') return Response.json({ ...common,
      teams:Object.values(memory.deepTeamRelationships??{}).map(x=>({
        name:x.teamName,stance:x.stance,trust:x.trustLevel,burned:x.timesBurned,vindicated:x.timesVindicated,
        narrative:x.currentNarrative??null,takeCount:x.takeHistory.length,history:x.takeHistory.slice(-6).reverse(),
      })).sort((a,b)=>b.takeCount-a.takeCount),
      players:Object.values(memory.deepPlayerRelationships??{}).map(x=>({
        name:x.playerName,team:x.team??null,sentiment:x.sentiment,trust:x.trustLevel,
        historyCount:x.history.length,history:x.history.slice(-5).reverse(),predictions:x.predictions.slice(-4).reverse(),
      })).sort((a,b)=>b.historyCount-a.historyCount),
    });
    if (view==='growth') return Response.json({ ...common,
      growth:memory.personalGrowth??{hardLessons:[],recognizedBiases:[],improvements:[],blindSpots:[]},
      speech:memory.speechPatterns??null,dynamics:memory.partnerDynamics??null,
      notes:admin.developmentNotes,changes:admin.history.slice(0,30),
    });
    if (view==='voice') return Response.json({ ...common,
      identity:{ name:summary.name,role:summary.role,voice:{...brain.voice,...(settings?.voiceConfig??{})},
        blindSpots:brain.blindSpots,openers:brain.openers,verbalTics:brain.verbalTics,
        adminNotes:settings?.adminNotes??null },
      samples:admin.voiceSamples,
    });
    return Response.json({ ...common,issues:issues.map(issue=>({
      id:issue.id,title:issue.title,week:issue.week,date:issue.publishedAt,type:issue.episodeType,
      processed:ledger.processedNewsletterIds.includes(issue.id),
      takes:ledger.entries.filter(e=>e.sourceNewsletterId===issue.id).length,
      review:ledger.entries.filter(e=>e.sourceNewsletterId===issue.id&&e.qualityReviewRequired
        &&!['verified','dismissed'].includes(admin.annotations[e.id]?.reviewStatus??'')).length,
    })) });
  } catch(err) { console.error('[brain-center:get]',err); return Response.json({error:'Brain center load failed'}, {status:500}); }
}

export async function POST(req:NextRequest) {
  if (!authorized(req)) return Response.json({error:'Forbidden'},{status:403});
  const body = await req.json().catch(()=>({})) as Record<string,unknown>;
  const bot=botOf(body.bot), season=yearOf(body.season), action=cut(body.action,30);
  if (!bot||!season||!['annotate','add_voice','remove_voice','propose_growth','review_growth'].includes(action))
    return Response.json({error:'Invalid action'},{status:400});
  try {
    const db=getDb();
    const [rows,ledger]=await Promise.all([
      db.select({id:botMemory.id,enhancedData:botMemory.enhancedData}).from(botMemory)
        .where(and(eq(botMemory.bot,bot),eq(botMemory.season,season))).limit(1),
      loadPublishedTakeLedgerState(bot,season),
    ]);
    if(!rows.length)return Response.json({error:'Character memory missing'},{status:404});
    const raw=(rows[0].enhancedData??{}) as Record<string,unknown>;
    const previous=parseAdmin(raw.brainAdmin);
    const next:BrainAdmin={...previous,revision:previous.revision+1,
      annotations:{...previous.annotations},voiceSamples:[...previous.voiceSamples],
      developmentNotes:[...previous.developmentNotes],history:[...previous.history]};
    const receiptId=cut(body.receiptId,180),receipt=ledger.entries.find(e=>e.id===receiptId);
    const now=new Date().toISOString();
    if(action==='annotate'){
      if(!receipt)return Response.json({error:'Take not found'},{status:404});
      if(!['unreviewed','verified','needs_review','dismissed'].includes(String(body.reviewStatus)))
        return Response.json({error:'Invalid review status'},{status:400});
      next.annotations[receiptId]={reviewStatus:body.reviewStatus as Review,pinned:body.pinned===true,
        note:cut(body.note,1000),correction:cut(body.correction,600),updatedAt:now};
    }else if(action==='add_voice'){
      if(!receipt)return Response.json({error:'Take not found'},{status:404});
      if(next.voiceSamples.length>=60&&!next.voiceSamples.some(s=>s.receiptId===receiptId))
        return Response.json({error:'Maximum 60 voice examples per character'},{status:400});
      next.voiceSamples=next.voiceSamples.filter(s=>s.receiptId!==receiptId);
      next.voiceSamples.push({id:crypto.randomUUID(),receiptId,quote:receipt.claim,note:cut(body.note,500),
        sourceNewsletterId:receipt.sourceNewsletterId,addedAt:now});
    }else if(action==='remove_voice'){
      if(!next.voiceSamples.some(s=>s.receiptId===receiptId))return Response.json({error:'Example not found'},{status:404});
      next.voiceSamples=next.voiceSamples.filter(s=>s.receiptId!==receiptId);
    }else if(action==='propose_growth'){
      const kind=body.kind,text=cut(body.text,800);
      if(!['lesson','bias','improvement'].includes(String(kind))||text.length<15)
        return Response.json({error:'A specific observation (at least 15 characters) is required'},{status:400});
      if(receiptId&&!receipt)return Response.json({error:'Source take not found'},{status:404});
      next.developmentNotes=[...next.developmentNotes,{id:crypto.randomUUID(),
        kind:kind as Development['kind'],text,receiptId:receiptId||null,status:'proposed' as const,
        createdAt:now,updatedAt:now}].slice(-100);
    }else{
      const id=cut(body.noteId,100),status=String(body.status);
      if(!['proposed','approved','rejected'].includes(status)||!next.developmentNotes.some(n=>n.id===id))
        return Response.json({error:'Development note or status not found'},{status:404});
      next.developmentNotes=next.developmentNotes.map(n=>n.id===id?{...n,status:status as Development['status'],updatedAt:now}:n);
    }
    next.history=[{at:now,action,...(receiptId?{receiptId}:{})},...next.history].slice(0,100);
    // Merge only the admin-owned key, with compare-and-swap protection.
    const updated=await db.update(botMemory).set({
      enhancedData:sql`COALESCE(${botMemory.enhancedData}, '{}'::jsonb) || ${JSON.stringify({brainAdmin:next})}::jsonb`,
      updatedAt:new Date(),
    }).where(and(eq(botMemory.id,rows[0].id),
      sql`COALESCE((${botMemory.enhancedData}->'brainAdmin'->>'revision')::int,0) = ${previous.revision}`))
      .returning({id:botMemory.id});
    if(!updated.length)return Response.json({error:'Another edit occurred. Refresh and retry.'},{status:409});
    return Response.json({ok:true,revision:next.revision});
  }catch(err){console.error('[brain-center:save]',err);return Response.json({error:'Unable to save brain center change'},{status:500});}
}

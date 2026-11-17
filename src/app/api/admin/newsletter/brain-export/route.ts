/**
 * Admin-only export of independently maintained Mason/Westy brains.
 * Active is a compact ChatGPT prompt artifact; Full is a structured backup.
 * No updates, newsletter publishing, discord, or model inference.
 */
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { ANALYST_BRAIN, ENTERTAINER_BRAIN, type BotBrain } from '@/lib/newsletter/bot-brain';
import type { BotName } from '@/lib/newsletter/types';
import {
  buildActiveBrain, buildFullBrain, renderActiveBrainMarkdown, brainFilename,
  type BrainDepth,type BrainFormat,
} from '@/lib/newsletter/brain-portability';
import { loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';
import { loadBotMemory, listNewslettersMeta } from '@/server/db/newsletter-queries';
import { loadLearningProfilesForSeason } from '@/server/db/brain-learning-queries';
import { loadBotSettings, loadAllPhrasePools } from '@/server/db/personality-queries';
import { getDb } from '@/server/db/client';
import { botMemory } from '@/server/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mergeBrain(bot:BotName, settings:Awaited<ReturnType<typeof loadBotSettings>>):BotBrain {
  const base=bot==='entertainer'?ENTERTAINER_BRAIN:ANALYST_BRAIN;
  const phrases=settings?.signaturePhrases as {openers?:string[];closers?:string[];verbalTics?:string[]} | null | undefined;
  const unique=(items:Array<string|undefined>)=>[...new Set(items.filter((v):v is string=>Boolean(v?.trim())).map(x=>x.trim()))];
  return {
    ...base,
    displayName:settings?.displayName?.trim()||base.displayName,
    role:settings?.roleDescription?.trim()||base.role,
    voice:{...base.voice,...(settings?.voiceConfig??{})},
    safetyBoundaries:unique([...base.safetyBoundaries,...(settings?.safetyBoundaries??[])]),
    verbalTics:unique([...base.verbalTics,...(phrases?.verbalTics??[])]),
    openers:unique([...base.openers,...(phrases?.openers??[])]),
    closers:unique([...base.closers,...(phrases?.closers??[])]),
  };
}

export async function GET(req:NextRequest):Promise<Response>{
  if(!isAdminCookieValue(req.cookies.get('evw_admin')?.value))
    return Response.json({error:'Admin access required'}, {status:403,headers:{'Cache-Control':'no-store'}});
  const id=req.nextUrl.searchParams.get('bot')??'';
  const bot:BotName|null=id==='mason'||id==='entertainer'?'entertainer':
    id==='westy'||id==='analyst'?'analyst':null;
  const depth=req.nextUrl.searchParams.get('depth')??'active';
  const format=req.nextUrl.searchParams.get('format')??(depth==='full'?'json':'md');
  const season=Number(req.nextUrl.searchParams.get('season')??2026);
  if(!bot||!['active','full'].includes(depth)||!['md','json'].includes(format)||
    (depth==='full'&&format!=='json')||!Number.isInteger(season)||season<2020||season>2100)
    return Response.json({error:'Choose bot=mason|westy, depth=active|full, format=md|json (full requires json), and a valid season'}, {status:400});
  try {
    const db=getDb();
    const [memory, ledger, profiles, settings, phrases, sources, rows]=await Promise.all([
      loadBotMemory(bot,season),
      loadPublishedTakeLedgerState(bot,season),
      loadLearningProfilesForSeason(season),
      loadBotSettings(bot),
      loadAllPhrasePools(),
      listNewslettersMeta(season),
      db.select({enhancedData:botMemory.enhancedData}).from(botMemory)
        .where(and(eq(botMemory.bot,bot),eq(botMemory.season,season))).limit(1),
    ]);
    if(!memory||!rows.length)
      return Response.json({error:'No character brain data stored for that season'},{status:404});
    const prefix=bot==='entertainer'?'mason_':'westy_';
    const phrasePools=Object.fromEntries(phrases
      .filter(p=>p.poolKey==='banned_global'||p.poolKey.startsWith(prefix))
      .map(p=>[p.poolKey,p.phrases]));
    const input={
      bot,season,exportedAt:new Date().toISOString(),
      identity:mergeBrain(bot,settings),
      currentMemory:memory,
      rawEnhancedData:(rows[0].enhancedData??{}) as Record<string,unknown>,
      publishedLedger:ledger,
      learning:bot==='entertainer'?profiles.mason:profiles.westy,
      adminSettings:settings,
      phrasePools,
      publishedSources:sources.filter(x=>x.status==='published').map(x=>({
        id:x.id,title:x.title,week:x.week,episodeType:x.episodeType,
        publishedAt:x.publishedAt,generatedAt:x.generatedAt,
      })),
    };
    const active=depth==='active'?buildActiveBrain(input):null;
    const full=depth==='full'?buildFullBrain(input):null;
    const body=format==='md'
      ? renderActiveBrainMarkdown(active!)
      : JSON.stringify(full??active,null,2);
    const fileName=brainFilename(bot,depth as BrainDepth,season,format as BrainFormat);
    return new Response(body,{
      status:200,
      headers:{
        'Content-Type':format==='md'?'text/markdown; charset=utf-8':'application/json; charset=utf-8',
        'Content-Disposition':`attachment; filename="${fileName}"`,
        'Cache-Control':'private, no-store, max-age=0',
        'Vary':'Cookie',
        'X-Content-Type-Options':'nosniff',
        'X-Brain-Type':depth,
        'X-Brain-Receipt-Count':String(ledger.entries.length),
        'Content-Length':String(Buffer.byteLength(body,'utf8')),
        'X-Brain-Content-SHA256':createHash('sha256').update(body,'utf8').digest('hex'),
      },
    });
  }catch(error){
    console.error('[brain-export]',error);
    return Response.json({error:'Character brain export could not be generated'}, {status:500});
  }
}

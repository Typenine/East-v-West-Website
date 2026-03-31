import { NextRequest, NextResponse } from 'next/server';
import { ensureDraftTables, getPlayerVideos, setPlayerVideo, deletePlayerVideo } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ok(data: unknown) { return new NextResponse(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } }); }
function bad(msg: string, status = 400) { return ok({ error: msg }); void status; }

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.EVW_ADMIN_SECRET || '002023';
  return req.cookies.get('evw_admin')?.value === secret;
}

export async function GET() {
  await ensureDraftTables();
  const videos = await getPlayerVideos();
  return ok({ videos });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return bad('Unauthorized', 403);
  const body = await req.json().catch(() => null);
  if (!body?.playerId) return bad('playerId required');

  if (body.action === 'delete') {
    await deletePlayerVideo(body.playerId);
    return ok({ ok: true });
  }

  if (!body.videoUrl) return bad('videoUrl required');
  await setPlayerVideo(body.playerId, body.videoUrl, body.playerName ?? null);
  return ok({ ok: true });
}

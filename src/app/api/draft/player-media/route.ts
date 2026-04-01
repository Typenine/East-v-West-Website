import { NextRequest, NextResponse } from 'next/server';
import { ensureDraftTables, setPlayerVideo, setPlayerImage } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.EVW_ADMIN_SECRET || '002023';
  return req.cookies.get('evw_admin')?.value === secret;
}

function ok(data: unknown) {
  return new NextResponse(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}
function bad(msg: string, status = 400) {
  return new NextResponse(JSON.stringify({ error: msg }), { status, headers: { 'content-type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return bad('Unauthorized', 403);

  // Support both JSON+base64 (preferred, avoids Next.js 15/Turbopack req.formData() issues)
  // and legacy multipart FormData
  const ct = req.headers.get('content-type') || '';
  let buffer: Buffer;
  let fileName: string;
  let mediaType: string | null = null;
  let playerId: string | null = null;
  let playerName: string | null = null;

  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => null);
    if (!body) return bad('Invalid JSON body');
    playerId = (typeof body.playerId === 'string' ? body.playerId : '').trim() || null;
    playerName = (typeof body.playerName === 'string' ? body.playerName : '').trim() || null;
    mediaType = (typeof body.type === 'string' ? body.type : '').toLowerCase() || null;
    const fileData = typeof body.fileData === 'string' ? body.fileData : null;
    fileName = typeof body.fileName === 'string' ? body.fileName : 'upload';
    if (!fileData) return bad('fileData required');
    try { buffer = Buffer.from(fileData, 'base64'); } catch { return bad('Invalid base64 fileData'); }
  } else {
    const formData = await req.formData().catch(() => null);
    if (!formData) return bad('Invalid form data');
    const file = formData.get('file') as File | null;
    mediaType = (formData.get('type') as string | null)?.toLowerCase() ?? null;
    playerId = (formData.get('playerId') as string | null)?.trim() ?? null;
    playerName = (formData.get('playerName') as string | null)?.trim() || null;
    if (!file) return bad('file required');
    fileName = file.name;
    buffer = Buffer.from(await file.arrayBuffer());
  }

  if (!buffer || !mediaType || !playerId) return bad('file, type, playerId required');
  if (mediaType !== 'video' && mediaType !== 'image') return bad('type must be video or image');
  const maxBytes = mediaType === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (buffer.length > maxBytes) return bad(`File too large (max ${mediaType === 'image' ? '10' : '50'} MB)`);

  const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  };
  const contentType = mimeMap[ext] || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
  const url = `data:${contentType};base64,${buffer.toString('base64')}`;

  try {
    await ensureDraftTables();
    if (mediaType === 'video') {
      await setPlayerVideo(playerId, url, playerName);
    } else {
      await setPlayerImage(playerId, url, playerName);
    }
  } catch (e) {
    return bad(`DB error: ${(e as Error)?.message || 'unknown'}`, 500);
  }

  return ok({ ok: true, url });
}

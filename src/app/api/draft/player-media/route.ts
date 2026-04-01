import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
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

  const formData = await req.formData().catch(() => null);
  if (!formData) return bad('Invalid form data');

  const file = formData.get('file') as File | null;
  const mediaType = (formData.get('type') as string | null)?.toLowerCase();
  const playerId = (formData.get('playerId') as string | null)?.trim();
  const playerName = (formData.get('playerName') as string | null)?.trim() || null;

  if (!file || !mediaType || !playerId) return bad('file, type, playerId required');
  if (mediaType !== 'video' && mediaType !== 'image') return bad('type must be video or image');
  if (file.size > 200 * 1024 * 1024) return bad('File too large (max 200 MB)');

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safePid = playerId.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const filename = `${safePid}-${Date.now()}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'draft', mediaType);
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);
  } catch (e) {
    console.error('[player-media] File write failed:', e);
    return bad(`File write error: ${(e as Error)?.message || 'unknown'}`, 500);
  }

  const url = `/uploads/draft/${mediaType}/${filename}`;

  try {
    await ensureDraftTables();
    if (mediaType === 'video') {
      await setPlayerVideo(playerId, url, playerName);
    } else {
      await setPlayerImage(playerId, url, playerName);
    }
  } catch (e) {
    console.error('[player-media] DB save failed:', e);
    return bad(`DB error: ${(e as Error)?.message || 'unknown'}`, 500);
  }

  return ok({ ok: true, url });
}

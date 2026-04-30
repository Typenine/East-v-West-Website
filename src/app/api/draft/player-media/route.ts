import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.EVW_ADMIN_SECRET || '002023';
  return req.cookies.get('evw_admin')?.value === secret;
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

  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => null);
    if (!body) return bad('Invalid JSON body');
    playerId = (typeof body.playerId === 'string' ? body.playerId : '').trim() || null;
    void (typeof body.playerName === 'string' ? body.playerName : ''); // parsed but not stored
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
    void (formData.get('playerName') as string | null); // parsed but not stored
    if (!file) return bad('file required');
    fileName = file.name;
    buffer = Buffer.from(await file.arrayBuffer());
  }

  if (!buffer || !mediaType || !playerId) return bad('file, type, playerId required');
  if (mediaType !== 'video' && mediaType !== 'image') return bad('type must be video or image');
  const maxBytes = mediaType === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (buffer.length > maxBytes) return bad(`File too large (max ${mediaType === 'image' ? '10' : '50'} MB)`);

  // Reject direct file uploads: storing raw files as base64 data URLs in Neon causes
  // excessive network transfer on every poll. Upload the file to an external host (e.g.
  // Cloudflare R2, YouTube, or any public URL) and save the URL via
  // POST /api/draft/player-videos instead.
  void buffer; void fileName; // parsed above for validation; not used for storage
  return bad(
    'Direct file uploads to Neon are disabled to prevent excessive database transfer. ' +
    'Please host the file externally and submit its URL via POST /api/draft/player-videos.',
    400,
  );
}

import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { loadNewsletterById } from '@/server/db/newsletter-queries';
import { presignGet } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type UploadedPdfData = {
  key?: string;
  fileName?: string;
};

function safeDownloadName(value: string): string {
  return value
    .replace(/[\r\n"\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .slice(0, 140) || 'east-v-west-newsletter.pdf';
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return Response.json({ error: 'Newsletter id is required.' }, { status: 400 });

  const item = await loadNewsletterById(id);
  if (!item) return Response.json({ error: 'Newsletter not found.' }, { status: 404 });

  const admin = isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  if (item.status !== 'published' && !admin) return Response.json({ error: 'Newsletter not found.' }, { status: 404 });

  const pdfSection = item.newsletter.sections.find(section => section.type === 'UploadedPdf');
  const data = (pdfSection?.data ?? null) as UploadedPdfData | null;
  const key = data?.key?.trim();
  if (!key || !key.startsWith('newsletter/uploads/')) {
    return Response.json({ error: 'This newsletter does not have an uploaded PDF.' }, { status: 404 });
  }

  try {
    const signedUrl = await presignGet({ key, expiresSec: 90 });
    const upstream = await fetch(signedUrl, { cache: 'no-store' });
    if (!upstream.ok) throw new Error(`storage returned ${upstream.status}`);
    const body = await upstream.arrayBuffer();
    const download = req.nextUrl.searchParams.get('download') === '1';
    const fallbackName = `${item.title || 'east-v-west-newsletter'}.pdf`;
    const fileName = safeDownloadName(data?.fileName || fallbackName);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName}"`,
        'Cache-Control': item.status === 'published' ? 'private, max-age=300' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[newsletter/pdf] failed:', message);
    return Response.json({ error: 'The PDF could not be loaded.' }, { status: 502 });
  }
}

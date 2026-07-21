import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { EPISODE_WEEK_STORAGE } from '@/lib/newsletter/queue-target';
import { getDb } from '@/server/db/client';
import { saveNewsletter } from '@/server/db/newsletter-queries';
import { newsletters } from '@/server/db/schema';
import { putObjectBytes } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const WEEKLESS_TYPES = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason', 'special']);
const ALLOWED_TYPES = new Set([
  'regular',
  'trade_deadline',
  'playoffs_preview',
  'playoffs_round',
  'championship',
  'season_finale',
  'pre_draft',
  'post_draft',
  'preseason',
  'offseason',
  'special',
]);

function isAdmin(req: NextRequest): boolean {
  return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
}

function cleanFileName(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned || 'newsletter'}.pdf`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLanding(input: {
  id: string;
  title: string;
  description: string;
  issueDate: string;
  episodeType: string;
  fileName: string;
}): string {
  const inlineUrl = `/api/newsletter/pdf?id=${encodeURIComponent(input.id)}`;
  const downloadUrl = `${inlineUrl}&download=1`;
  const description = input.description.trim()
    ? `<p class="description">${escapeHtml(input.description)}</p>`
    : '<p class="description">A finished East v. West special edition.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f7; color: #162033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page { max-width: 1080px; margin: 0 auto; padding: 28px 18px 44px; }
    .hero { overflow: hidden; border-radius: 24px; border: 1px solid #d7deea; background: white; box-shadow: 0 18px 42px rgba(20,31,54,.10); }
    .stripe { height: 8px; background: linear-gradient(90deg,#be161e 0 50%,#0b5f98 50%); }
    .hero-inner { padding: 34px clamp(22px,5vw,54px); }
    .eyebrow { margin: 0 0 10px; color: #0b5f98; font-size: 12px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 900px; color: #101827; font-size: clamp(34px,6vw,64px); line-height: 1.02; letter-spacing: -.045em; }
    .meta { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 18px; color: #61708a; font-size: 14px; }
    .description { max-width: 780px; margin: 22px 0 0; color: #45536b; font-size: 17px; line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 12px; font-weight: 850; text-decoration: none; }
    .primary { background: #be161e; color: white; }
    .secondary { border: 1px solid #b9c4d5; background: #f8fafc; color: #162033; }
    article { margin-top: 24px; overflow: hidden; border-radius: 22px; border: 1px solid #d7deea; background: white; box-shadow: 0 12px 30px rgba(20,31,54,.08); }
    article h2 { margin: 0; padding: 20px 24px; border-bottom: 1px solid #d7deea; font-size: 20px; }
    iframe { display: block; width: 100%; height: 1120px; border: 0; background: #555; }
    .mobile-note { display: none; padding: 18px 24px; color: #61708a; font-size: 14px; }
    @media (max-width: 720px) {
      .page { padding: 14px 10px 28px; }
      .hero { border-radius: 18px; }
      .hero-inner { padding: 25px 20px; }
      article { border-radius: 18px; }
      iframe { height: 760px; }
      .mobile-note { display: block; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="stripe"></div>
      <div class="hero-inner">
        <p class="eyebrow">East v. West · ${escapeHtml(input.episodeType.replace(/_/g, ' '))}</p>
        <h1>${escapeHtml(input.title)}</h1>
        <div class="meta"><span>${escapeHtml(input.issueDate)}</span><span>${escapeHtml(input.fileName)}</span></div>
        ${description}
        <div class="actions">
          <a class="button primary" href="${downloadUrl}">Download original PDF</a>
          <a class="button secondary" href="${inlineUrl}" target="_blank" rel="noopener noreferrer">Open PDF in new tab</a>
        </div>
      </div>
    </section>
    <article>
      <h2>Read the issue</h2>
      <div class="mobile-note">Some mobile browsers display PDFs more reliably in a separate tab. Use “Open PDF in new tab” above if needed.</div>
      <iframe src="${inlineUrl}" title="${escapeHtml(input.title)}"></iframe>
    </article>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid multipart form data.' }, { status: 400 });
  }

  const fileValue = form.get('file');
  if (!fileValue || typeof fileValue === 'string' || typeof fileValue.arrayBuffer !== 'function') {
    return Response.json({ error: 'A PDF file is required.' }, { status: 400 });
  }

  const title = String(form.get('title') || '').trim().slice(0, 200);
  const description = String(form.get('description') || '').trim().slice(0, 2500);
  const issueDate = String(form.get('issueDate') || new Date().toISOString().slice(0, 10)).trim().slice(0, 40);
  const episodeType = String(form.get('episodeType') || 'special').trim();
  const season = Math.trunc(Number(form.get('season')));
  const requestedWeek = Math.trunc(Number(form.get('week')));

  if (!title) return Response.json({ error: 'Title is required.' }, { status: 400 });
  if (!Number.isFinite(season) || season < 2020 || season > 2100) return Response.json({ error: 'A valid season is required.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(episodeType)) return Response.json({ error: 'Unsupported episode type.' }, { status: 400 });
  if (!WEEKLESS_TYPES.has(episodeType) && (!Number.isFinite(requestedWeek) || requestedWeek < 1 || requestedWeek > 18)) {
    return Response.json({ error: 'A week from 1 through 18 is required for this episode type.' }, { status: 400 });
  }

  if (fileValue.size <= 0 || fileValue.size > MAX_PDF_BYTES) {
    return Response.json({ error: 'PDF must be between 1 byte and 25 MB.' }, { status: 400 });
  }

  const bytes = new Uint8Array(await fileValue.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== '%PDF-') return Response.json({ error: 'The uploaded file is not a valid PDF.' }, { status: 400 });

  const fileName = cleanFileName(fileValue.name || `${title}.pdf`);
  const key = `newsletter/uploads/${season}/${randomUUID()}-${fileName}`;
  const displayWeek = WEEKLESS_TYPES.has(episodeType) ? 0 : requestedWeek;
  const storageWeek = episodeType === 'special'
    ? Math.floor(Date.now() / 1000)
    : (EPISODE_WEEK_STORAGE[episodeType] ?? requestedWeek);

  try {
    await putObjectBytes({ key, body: bytes, contentType: 'application/pdf' });

    const content = {
      meta: {
        leagueName: 'East v. West',
        week: displayWeek,
        date: issueDate,
        season,
      },
      sections: [{
        type: 'UploadedPdf',
        data: {
          key,
          fileName,
          description,
          issueDate,
          size: fileValue.size,
          source: 'admin-upload',
        },
      }],
    };

    const id = await saveNewsletter(
      season,
      storageWeek,
      'East v. West',
      content,
      '<p>Preparing uploaded newsletter…</p>',
      { status: 'draft', episodeType, title },
    );
    if (!id) throw new Error('Newsletter row was not created.');

    const html = renderLanding({ id, title, description, issueDate, episodeType, fileName });
    const db = getDb();
    await db.update(newsletters).set({ html, updatedAt: new Date() }).where(eq(newsletters.id, id));

    return Response.json({
      success: true,
      id,
      title,
      season,
      week: storageWeek,
      episodeType,
      status: 'draft',
      message: 'PDF uploaded as a draft. Publish it from Saved Newsletters when ready.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[newsletter/upload-pdf] failed:', message);
    return Response.json({ error: `PDF upload failed: ${message}` }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCESS_KEY = 'evw-patch-20260702-5f1c8d7a';
const REPO = 'Typenine/East-v-West-Website';
const REF = '8082f1bfe15e158797621833462844dde0cf0107';

const ALLOWED_PATHS = new Set([
  '.github/workflows/newsletter-scheduler.yml',
  'scripts/run-newsletter.mjs',
  'src/app/admin/newsletter/EditorialCalendar.tsx',
  'src/app/admin/newsletter/SavedNewsletters.tsx',
  'src/app/api/newsletter/queue/route.ts',
  'src/lib/newsletter/guardrails.ts',
  'src/lib/newsletter/trade-section-compose.ts',
  'src/server/db/newsletter-queue-queries.ts',
  'src/server/db/schema.ts',
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get('kind');

  if (kind === 'runs') {
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/apply-tradeandqueue-patch.yml/runs?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'east-v-west-patch-diagnostic' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json({ error: `GitHub returned ${response.status}`, detail: await response.text() }, { status: 502 });
    }
    const data = await response.json() as { workflow_runs?: Array<Record<string, unknown>> };
    return NextResponse.json({
      runs: (data.workflow_runs ?? []).map((run) => ({
        id: run.id,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        headSha: run.head_sha,
        url: run.html_url,
      })),
    });
  }

  if (params.get('key') !== ACCESS_KEY) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (kind === 'commit') {
    const response = await fetch(`https://api.github.com/repos/${REPO}/git/commits/${REF}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'east-v-west-patch-diagnostic' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json({ error: `GitHub returned ${response.status}` }, { status: 502 });
    }
    const commit = await response.json() as { tree?: { sha?: string } };
    return NextResponse.json({ ref: REF, treeSha: commit.tree?.sha ?? null });
  }

  if (kind === 'file') {
    const path = params.get('path') ?? '';
    if (!ALLOWED_PATHS.has(path)) {
      return new NextResponse('Not found', { status: 404 });
    }
    const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${REF}/${path}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return new NextResponse(`GitHub returned ${response.status}`, { status: 502 });
    }
    return new NextResponse(await response.text(), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return new NextResponse('Not found', { status: 404 });
}

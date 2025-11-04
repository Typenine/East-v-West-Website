export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ error: 'removed', reason: 'Blob disabled' }, { status: 410 });
}

export async function POST() {
  return Response.json({ error: 'removed', reason: 'Blob disabled' }, { status: 410 });
}

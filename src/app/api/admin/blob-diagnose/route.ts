export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ error: 'removed', reason: 'Blob disabled' }, { status: 410 });
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return Response.json({ error: 'removed', reason: 'Blob migration completed and route disabled' }, { status: 410 })
}

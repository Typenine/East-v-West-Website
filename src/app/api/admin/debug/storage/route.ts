import { getKV } from '@/lib/server/kv';
import { listKeys } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const out: Record<string, unknown> = { ok: true };

    // R2 diagnostics
    try {
      const snapshots = await listKeys({ prefix: 'logs/lineups/snapshots/', max: 5000 });
      out.r2Snapshots = snapshots.length;
    } catch (e) {
      out.r2Snapshots = { error: String(e) };
    }
    try {
      const tradeBlocks = await listKeys({ prefix: 'tradeblock/', max: 5000 });
      out.r2TradeBlocks = tradeBlocks.length;
    } catch (e) {
      out.r2TradeBlocks = { error: String(e) };
    }

    // KV diagnostics
    try {
      const kv = await getKV();
      if (kv) {
        const raw = (await kv.get('suggestions:items')) as string | null;
        out.kvSuggestionsCount = raw ? (Array.isArray(JSON.parse(raw)) ? (JSON.parse(raw) as unknown[]).length : -1) : 0;
      } else {
        out.kvSuggestionsCount = 'kv_unavailable';
      }
    } catch (e) {
      out.kvSuggestionsCount = { error: String(e) };
    }

    return Response.json(out);
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

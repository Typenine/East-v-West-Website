import { getObjectText, putObjectText } from '@/server/storage/r2';

// Shared storage layer for admin-entered manual trades.
// Used by the /api/manual-trades route and by the server-side trade feed builder,
// so the feed can merge manual trades without an HTTP round-trip.

export type ManualTradeAsset =
  | { type: 'player'; name: string; position?: string; team?: string; playerId?: string }
  | { type: 'pick'; name: string; year?: string; round?: number; draftSlot?: number; originalOwner?: string; pickInRound?: number; became?: string; becamePosition?: string; becameTeam?: string; becamePlayerId?: string }
  | { type: 'cash'; name: string; amount?: number };

export type ManualTradeTeam = {
  name: string;
  assets: ManualTradeAsset[];
};

export type ManualTrade = {
  id: string;                // manual-<timestamp>-<rand> or override target id
  date: string;              // YYYY-MM-DD
  status: 'completed' | 'pending' | 'vetoed';
  teams: ManualTradeTeam[];
  notes?: string;
  overrideOf?: string | null; // Sleeper transaction_id if overriding
  active?: boolean;           // soft delete flag
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

const BLOB_PATH = 'evw/manual_trades.json';

// In-memory fallback (dev/local only)
let memoryStore: { trades: ManualTrade[]; ts: number } = { trades: [], ts: 0 };

export async function loadAllManualTrades(): Promise<ManualTrade[]> {
  // R2 primary
  try {
    const txt = await getObjectText({ key: BLOB_PATH });
    if (txt) {
      const json = JSON.parse(txt);
      if (Array.isArray(json)) return json as ManualTrade[];
    }
  } catch {}
  // In-memory fallback (local only)
  return memoryStore.trades || [];
}

export async function saveAllManualTrades(trades: ManualTrade[]) {
  // R2 primary
  try {
    await putObjectText({ key: BLOB_PATH, text: JSON.stringify(trades, null, 2) });
    return;
  } catch {}
  // In-memory fallback
  memoryStore = { trades: trades.slice(), ts: Date.now() };
}

export async function loadActiveManualTrades(): Promise<ManualTrade[]> {
  const all = await loadAllManualTrades();
  return all.filter((t) => t.active !== false);
}

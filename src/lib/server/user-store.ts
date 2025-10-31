import { getKV } from '@/lib/server/kv';
import { TEAM_NAMES } from '@/lib/constants/league';
import { normalizeName } from '@/lib/constants/team-mapping';

export type TradeAsset =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; year: number; round: number; originalTeam: string }
  | { type: 'faab'; amount?: number };

export type TradeWants = {
  text?: string;
  positions?: string[];
};

export type UserDoc = {
  userId: string;
  team: string;
  version: number;
  updatedAt: string;
  tradeBlock?: TradeAsset[];
  tradeWants?: TradeWants;
  votes?: Record<string, Record<string, number>>;
};

function canonicalizeTeamName(name: string): string {
  const want = normalizeName(name);
  const found = TEAM_NAMES.find((t) => normalizeName(t) === want);
  return found || name;
}

function userBlobKey(userId: string): string {
  return `auth/users/${userId}.json`;
}

async function getBlobToken(): Promise<string | undefined> {
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('blob:token')) as string | null;
      if (raw && typeof raw === 'string' && raw.length > 0) return raw;
    }
  } catch {}
  const envTok = process.env.BLOB_READ_WRITE_TOKEN;
  if (envTok && envTok.length > 0) return envTok;
  return undefined;
}

export async function readUserDoc(userId: string, team: string): Promise<UserDoc> {
  const key = userBlobKey(userId);
  try {
    const { list } = await import('@vercel/blob');
    const token = await getBlobToken();
    const opts: { prefix: string; token?: string } = { prefix: key };
    if (token) opts.token = token;
    const { blobs } = await list(opts as { prefix: string; token?: string });
    type BlobMeta = { pathname: string; url: string; uploadedAt?: string | Date };
    const toTime = (v?: string | Date): number => {
      if (!v) return 0;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string') return Date.parse(v);
      return 0;
    };
    const matches: BlobMeta[] = (blobs as unknown as BlobMeta[]).filter((b) => b.pathname === key || b.pathname.startsWith(key));
    if (matches.length > 0) {
      const newest = matches.reduce((acc, cur) => (!acc ? cur : (toTime(cur.uploadedAt) > toTime(acc.uploadedAt) ? cur : acc)), matches[0]);
      if (newest?.url) {
        const res = await fetch(newest.url, { cache: 'no-store' });
        if (res.ok) {
          const json = (await res.json()) as unknown;
          if (isUserDoc(json)) return json;
        }
      }
    }
  } catch {}
  return { userId, team: canonicalizeTeamName(team), version: 0, updatedAt: new Date().toISOString() };
}

export async function writeUserDoc(doc: UserDoc): Promise<boolean> {
  const key = userBlobKey(doc.userId);
  try {
    const { put } = await import('@vercel/blob');
    const token = await getBlobToken();
    await put(key, JSON.stringify(doc, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      allowOverwrite: true,
      token,
    });
    return true;
  } catch {
    return false;
  }
}

function isUserDoc(v: unknown): v is UserDoc {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.userId === 'string' &&
    typeof o.team === 'string' &&
    typeof o.version === 'number' &&
    typeof o.updatedAt === 'string'
  );
}

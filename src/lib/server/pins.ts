import { promises as fs } from 'fs';
import path from 'path';
import { getKV } from '@/lib/server/kv';
import { TEAM_NAMES } from '@/lib/constants/league';

export type StoredPin = {
  hash: string;
  salt: string;
  pinVersion: number;
  updatedAt: string; // ISO
};

export type PinMap = Record<string, StoredPin>; // ownerId -> StoredPin

const DATA_PATH = path.join(process.cwd(), 'data', 'team-pins.json');
const BLOB_KEY = 'auth/team-pins.json';

function teamSlug(team: string): string {
  return team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function teamBlobKey(team: string): string {
  return `auth/pins/${teamSlug(team)}.json`;
}

export async function readTeamPin(team: string): Promise<StoredPin | null> {
  const key = teamBlobKey(team);
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: key });
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
          if (isStoredPin(json)) return json;
        }
      }
    }
  } catch {}
  return null;
}

function isStoredPin(v: unknown): v is StoredPin {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.hash === 'string' &&
    typeof o.salt === 'string' &&
    typeof o.pinVersion === 'number' &&
    typeof o.updatedAt === 'string'
  );
}

export async function writeTeamPin(team: string, value: StoredPin): Promise<boolean> {
  const key = teamBlobKey(team);
  try {
    const { put } = await import('@vercel/blob');
    await put(key, JSON.stringify(value, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function listAllTeamPins(): Promise<PinMap> {
  const out: PinMap = {};
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'auth/pins/' });
    const known = new Map<string, string>();
    for (const name of TEAM_NAMES) known.set(teamSlug(name), name);
    type BlobMeta = { pathname: string; url: string; uploadedAt?: string | Date };
    const toTime = (v?: string | Date): number => {
      if (!v) return 0;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string') return Date.parse(v);
      return 0;
    };
    const bySlug: Record<string, BlobMeta[]> = {} as Record<string, BlobMeta[]>;
    for (const b of (blobs as unknown as BlobMeta[])) {
      const m = b.pathname.match(/^auth\/pins\/([a-z0-9-]+)\.json/);
      if (!m) continue;
      const slug = m[1];
      bySlug[slug] = bySlug[slug] || [];
      bySlug[slug].push(b);
    }
    for (const [slug, listForSlug] of Object.entries(bySlug)) {
      const newest = listForSlug.reduce((acc, cur) => (!acc ? cur : (toTime(cur.uploadedAt) > toTime(acc.uploadedAt) ? cur : acc)), listForSlug[0]);
      const res = await fetch(newest.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      if (!json || typeof json !== 'object') continue;
      const team = known.get(slug) || slug;
      out[team] = json as StoredPin;
    }
  } catch {}
  return out;
}

export async function readPins(): Promise<PinMap> {
  let blobMap: PinMap = {};
  let kvMap: PinMap = {};

  // Blob
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: BLOB_KEY });
    type BlobMeta = { pathname: string; url: string; uploadedAt?: string | Date };
    const toTime = (v?: string | Date): number => {
      if (!v) return 0;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string') return Date.parse(v);
      return 0;
    };
    const matches: BlobMeta[] = (blobs as unknown as BlobMeta[]).filter((b) => b.pathname === BLOB_KEY || b.pathname.startsWith(BLOB_KEY));
    if (matches.length > 0) {
      const newest = matches.reduce((acc, cur) => (!acc ? cur : (toTime(cur.uploadedAt) > toTime(acc.uploadedAt) ? cur : acc)), matches[0]);
      if (newest?.url) {
        const res = await fetch(newest.url, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json && typeof json === 'object') blobMap = json as PinMap;
        }
      }
    }
  } catch {}

  // KV
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('pins:map')) as string | null;
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') kvMap = parsed as PinMap;
      }
    }
  } catch {}

  // Merge: pick higher pinVersion per team
  const merged: PinMap = { ...blobMap };
  for (const [team, entry] of Object.entries(kvMap)) {
    const cur = merged[team];
    if (!cur || (entry.pinVersion || 0) > (cur.pinVersion || 0)) {
      merged[team] = entry as StoredPin;
    }
  }
  if (Object.keys(merged).length > 0) return merged;

  // Local fs (dev)
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PinMap;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (!(err && err.code === 'ENOENT')) throw err;
  }
  return {};
}

export async function writePins(pins: PinMap): Promise<void> {
  await writePinsWithResult(pins);
}

export type WriteResult = { kv: boolean; blob: boolean; fs: boolean };

export async function writePinsWithResult(pins: PinMap): Promise<WriteResult> {
  let kvOk = false;
  let blobOk = false;
  let fsOk = false;

  // Try Blob first
  try {
    const { put } = await import('@vercel/blob');
    await put(BLOB_KEY, JSON.stringify(pins, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      // Use versioned writes (random suffix) to avoid CDN staleness; readPins picks newest by uploadedAt
    });
    blobOk = true;
  } catch {}

  // Then KV
  try {
    const kv = await getKV();
    if (kv) {
      await kv.set('pins:map', JSON.stringify(pins));
      kvOk = true;
    }
  } catch {}

  // Finally, local filesystem (dev)
  try {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(pins, null, 2), 'utf8');
    fsOk = true;
  } catch {}

  return { kv: kvOk, blob: blobOk, fs: fsOk };
}

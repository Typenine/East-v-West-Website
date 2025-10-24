import { promises as fs } from 'fs';
import path from 'path';
import { getKV } from '@/lib/server/kv';

export type StoredPin = {
  hash: string;
  salt: string;
  pinVersion: number;
  updatedAt: string; // ISO
};

export type PinMap = Record<string, StoredPin>; // ownerId -> StoredPin

const DATA_PATH = path.join(process.cwd(), 'data', 'team-pins.json');
const BLOB_KEY = 'auth/team-pins.json';


export async function readPins(): Promise<PinMap> {
  // 1) Blob store first (your prod setup)
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'auth/' });
    const found = blobs.find((b) => b.pathname === BLOB_KEY);
    if (found) {
      const res = await fetch(found.url);
      if (res.ok) {
        const json = await res.json();
        const blobResult = (json && typeof json === 'object') ? (json as PinMap) : {};
        if (Object.keys(blobResult).length > 0) return blobResult;
      }
    }
  } catch {}

  // 2) KV (fallback)
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('pins:map')) as string | null;
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as PinMap;
      }
    }
  } catch {}

  // 3) Local fs (dev)
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

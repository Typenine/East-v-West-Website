import { promises as fs } from 'fs';
import path from 'path';
import { TEAM_NAMES } from '@/lib/constants/league';
import { hashPin } from '@/lib/server/auth';
import { getKV } from '@/lib/server/kv';

export type StoredPin = {
  hash: string;
  salt: string;
  pinVersion: number;
  updatedAt: string; // ISO
};

export type PinMap = Record<string, StoredPin>; // ownerId -> StoredPin

const DATA_PATH = path.join(process.cwd(), 'data', 'team-pins.json');
const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_TOKEN);
const BLOB_KEY = 'auth/team-pins.json';

async function initDefaultPins(): Promise<PinMap> {
  const defaultPins: string[] = [
    '111111', '222222', '333333', '444444', '555555', '666666',
    '777777', '888888', '999999', '101010', '121212', '131313'
  ];
  const mapping: PinMap = {};
  let idx = 0;
  for (const team of TEAM_NAMES) {
    const pin = defaultPins[idx % defaultPins.length];
    const { hash, salt } = await hashPin(pin);
    mapping[team] = {
      hash,
      salt,
      pinVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    idx++;
  }
  // Persist to Blob (best-effort)
  try {
    const { put } = await import('@vercel/blob');
    await put(BLOB_KEY, JSON.stringify(mapping, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
    });
  } catch {}
  return mapping;
}

export async function readPins(): Promise<PinMap> {
  // 1) Prefer KV (cross-device, no token strings in code)
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('pins:map')) as string | null;
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as PinMap;
      }
      // Auto-init defaults into KV
      const defaults = await initDefaultPins();
      try { await kv.set('pins:map', JSON.stringify(defaults)); } catch {}
      return defaults;
    }
  } catch {}

  // 2) Blob store
  if (USE_BLOB) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: 'auth/' });
      const found = blobs.find((b) => b.pathname === BLOB_KEY);
      if (!found) {
        // Auto-initialize with default PINs if not present
        const mapping = await initDefaultPins();
        try {
          const { put } = await import('@vercel/blob');
          await put(BLOB_KEY, JSON.stringify(mapping, null, 2), {
            access: 'public',
            contentType: 'application/json; charset=utf-8',
          });
        } catch {}
        return mapping;
      }
      const res = await fetch(found.url);
      if (!res.ok) return {};
      const json = await res.json();
      return (json && typeof json === 'object') ? (json as PinMap) : {};
    } catch {
      // If listing fails for any reason, fall back to auto-init once
      try {
        const mapping = await initDefaultPins();
        return mapping;
      } catch {
        return {};
      }
    }
  }
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PinMap;
    return {};
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function writePins(pins: PinMap): Promise<void> {
  // 1) KV preferred
  try {
    const kv = await getKV();
    if (kv) {
      await kv.set('pins:map', JSON.stringify(pins));
      return;
    }
  } catch {}

  // 2) Blob
  if (USE_BLOB) {
    const { put } = await import('@vercel/blob');
    await put(BLOB_KEY, JSON.stringify(pins, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
    });
    return;
  }
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(pins, null, 2), 'utf8');
}

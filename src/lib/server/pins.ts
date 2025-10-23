import { promises as fs } from 'fs';
import path from 'path';

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

export async function readPins(): Promise<PinMap> {
  if (USE_BLOB) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: 'auth/' });
      const found = blobs.find((b) => b.pathname === BLOB_KEY || b.key === BLOB_KEY);
      if (!found) return {};
      const res = await fetch(found.url);
      if (!res.ok) return {};
      const json = await res.json();
      return (json && typeof json === 'object') ? (json as PinMap) : {};
    } catch {
      return {};
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
  if (USE_BLOB) {
    const { put } = await import('@vercel/blob');
    await put(BLOB_KEY, JSON.stringify(pins, null, 2), {
      access: 'private',
      contentType: 'application/json; charset=utf-8',
    });
    return;
  }
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(pins, null, 2), 'utf8');
}

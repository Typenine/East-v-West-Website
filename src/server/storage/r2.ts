import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getStorageConfig, setStorageConfig } from '@/server/db/r2-queries';

type Mode = 'path' | 'vhost';

// In-memory cache
let clientPath: S3Client | null = null;
let clientVhost: S3Client | null = null;
let chosenMode: Mode | null = null;
let lastVerifiedAt: string | null = null;
let initOnce: Promise<void> | null = null;
let clockOffsetMs: number | null = null; // positive -> server is ahead

// Guardrails: fail fast if mandatory envs missing
function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is missing`);
  return v.trim();
}

const ACCOUNT_ID = () => req('R2_ACCOUNT_ID');
const ACCESS_KEY = () => req('R2_ACCESS_KEY_ID');
const SECRET_KEY = () => req('R2_SECRET_ACCESS_KEY');
const BUCKET = () => req('R2_BUCKET');

function endpoint(): string {
  return `https://${ACCOUNT_ID()}.r2.cloudflarestorage.com`;
}

export function publicUrl(key: string): string | null {
  const base = (process.env.R2_PUBLIC_BASE || '').trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${key}`;
}

function readEnvClockOffset(): number | null {
  const raw = (process.env.R2_CLOCK_OFFSET_MS || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function ensureClockOffset(): Promise<void> {
  if (clockOffsetMs !== null) return;
  const envOff = readEnvClockOffset();
  if (envOff !== null) {
    clockOffsetMs = envOff;
    return;
  }
  try {
    const res = await fetch(endpoint(), { method: 'GET' });
    const d = res.headers.get('date');
    if (d) {
      const server = Date.parse(d);
      if (Number.isFinite(server)) {
        clockOffsetMs = server - Date.now();
        return;
      }
    }
  } catch {}
  // Fallback: use Cloudflare website date header
  try {
    const res2 = await fetch('https://www.cloudflare.com', { method: 'HEAD' });
    const d2 = res2.headers.get('date');
    if (d2) {
      const server2 = Date.parse(d2);
      if (Number.isFinite(server2)) {
        clockOffsetMs = server2 - Date.now();
        return;
      }
    }
  } catch {}
  clockOffsetMs = 0;
}

export function getClient(mode: Mode = 'path'): S3Client {
  const common = {
    region: 'auto',
    endpoint: endpoint(),
    credentials: { accessKeyId: ACCESS_KEY(), secretAccessKey: SECRET_KEY() },
    systemClockOffset: clockOffsetMs ?? 0,
  } as const;
  if (mode === 'path') {
    if (!clientPath) clientPath = new S3Client({ ...common, forcePathStyle: true });
    return clientPath;
  } else {
    if (!clientVhost) clientVhost = new S3Client({ ...common }); // virtual-hosted
    return clientVhost;
  }
}

function timeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}:timeout:${ms}`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function tryMode(mode: Mode): Promise<{ ok: boolean; error?: string }> {
  try {
    const s3 = getClient(mode);
    // Write health file (server-side PUT, no CORS). Bucket listing may be disallowed, so we rely on PUT only.
    await timeout(s3.send(new PutObjectCommand({ Bucket: BUCKET(), Key: 'health/hello.txt', Body: `hello evw ${new Date().toISOString()}`, ContentType: 'text/plain' })), 400, `put:${mode}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(JSON.stringify({ op: 'r2.tryMode', mode, message: msg }));
    return { ok: false, error: msg };
  }
}

async function selectModeOnBoot(): Promise<void> {
  try {
    // Ensure envs exist first
    ACCOUNT_ID(); ACCESS_KEY(); SECRET_KEY(); BUCKET();
  } catch (e) {
    console.warn(JSON.stringify({ op: 'r2.env.missing', message: e instanceof Error ? e.message : String(e) }));
    chosenMode = null; return;
  }

  // Establish clock offset before signing requests
  try { await ensureClockOffset(); } catch {}

  // Load persisted mode if any
  try {
    const cfg = await getStorageConfig();
    if (cfg?.chosenMode === 'path' || cfg?.chosenMode === 'vhost') {
      chosenMode = cfg.chosenMode as Mode; lastVerifiedAt = cfg.lastVerifiedAt?.toISOString() ?? null;
    }
  } catch {}

  // If unknown, try path then vhost
  const order: Mode[] = chosenMode ? [chosenMode, chosenMode === 'path' ? 'vhost' : 'path'] : ['path', 'vhost'];
  for (const m of order) {
    const res = await tryMode(m);
    if (res.ok) {
      chosenMode = m;
      lastVerifiedAt = new Date().toISOString();
      try { await setStorageConfig({ chosenMode: m, lastVerifiedAt: new Date(), notes: null }); } catch {}
      console.log(JSON.stringify({ op: 'r2.mode.selected', mode: m }));
      return;
    }
  }
  // Nothing worked; leave disabled
  chosenMode = null;
}

function boot(): Promise<void> {
  if (initOnce) return initOnce;
  initOnce = (async () => {
    await selectModeOnBoot();
  })();
  return initOnce;
}

export async function presignPut(params: { key: string; contentType?: string; expiresSec?: number }): Promise<string> {
  await boot();
  const m: Mode = chosenMode || 'path';
  const client = getClient(m);
  const cmd = new PutObjectCommand({ Bucket: BUCKET(), Key: params.key, ContentType: params.contentType || 'application/octet-stream' });
  const expires = Math.max(60, Math.min(300, params.expiresSec ?? 300));
  return await getSignedUrl(client, cmd, { expiresIn: expires });
}

export async function presignGet(params: { key: string; expiresSec?: number }): Promise<string> {
  const pub = publicUrl(params.key);
  if (pub) return pub;
  await boot();
  const m: Mode = chosenMode || 'path';
  const client = getClient(m);
  const cmd = new GetObjectCommand({ Bucket: BUCKET(), Key: params.key });
  const expires = Math.max(30, Math.min(300, params.expiresSec ?? 60));
  return await getSignedUrl(client, cmd, { expiresIn: expires });
}

export async function putObjectText(params: { key: string; text: string }) {
  await boot();
  const m: Mode = chosenMode || 'path';
  const client = getClient(m);
  await client.send(new PutObjectCommand({ Bucket: BUCKET(), Key: params.key, Body: params.text, ContentType: 'text/plain' }));
}

export async function putObjectBytes(params: { key: string; body: Uint8Array | ArrayBuffer; contentType?: string }) {
  await boot();
  const m: Mode = chosenMode || 'path';
  const client = getClient(m);
  const body = params.body instanceof Uint8Array ? params.body : new Uint8Array(params.body);
  await client.send(new PutObjectCommand({ Bucket: BUCKET(), Key: params.key, Body: body, ContentType: params.contentType || 'application/octet-stream' }));
}

export async function getObjectText(params: { key: string }): Promise<string | null> {
  await boot();
  const m: Mode = chosenMode || 'path';
  const client = getClient(m);
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET(), Key: params.key }));
  const body: unknown = (res as unknown as { Body?: unknown }).Body;
  if (!body) return null;
  const tts = (body as { transformToString?: unknown }).transformToString;
  if (typeof tts === 'function') {
    return await (tts as () => Promise<string>)();
  }
  try {
    const chunks: Uint8Array[] = [];
    const on = (body as { on?: unknown }).on;
    if (typeof on !== 'function') return null;
    await new Promise<void>((resolve, reject) => {
      (on as (event: string, cb: (c: Uint8Array) => void) => void).call(body, 'data', (c: Uint8Array) => chunks.push(c));
      (on as (event: string, cb: () => void) => void).call(body, 'end', () => resolve());
      (on as (event: string, cb: (err: unknown) => void) => void).call(body, 'error', reject);
    });
    const buf = Buffer.concat(chunks);
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

export async function listKeys(params: { prefix: string; max?: number }): Promise<string[]> {
  await boot();
  const m: Mode = chosenMode || 'path';
  const client = getClient(m);
  const out: string[] = [];
  let token: string | undefined = undefined;
  const limit = Math.max(1, Math.min(5000, params.max ?? 1000));
  while (out.length < limit) {
    const res: ListObjectsV2CommandOutput = await client.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: params.prefix, ContinuationToken: token, MaxKeys: Math.min(1000, limit - out.length) }));
    const contents = res.Contents || [];
    for (const c of contents) {
      if (c.Key) out.push(c.Key);
      if (out.length >= limit) break;
    }
    if (!res.IsTruncated || !res.NextContinuationToken) break;
    token = res.NextContinuationToken;
  }
  return out;
}

// Expose status for health route
export function getR2Status() {
  return { mode: chosenMode, lastVerifiedAt };
}

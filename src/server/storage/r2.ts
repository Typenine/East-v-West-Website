import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;
let _offsetMs = 0;
let _initPromise: Promise<void> | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is missing`);
  return v.trim();
}

export async function getR2Client(): Promise<S3Client> {
  await ensureClient();
  return _client!;
}

async function computeClockOffsetMs(endpoint: string): Promise<number> {
  const envOff = Number(process.env.R2_CLOCK_OFFSET_MS || '0');
  if (Number.isFinite(envOff) && envOff !== 0) return envOff;
  try {
    const res = await fetch(endpoint, { method: 'GET' });
    const dateHdr = res.headers.get('date');
    if (!dateHdr) return 0;
    const server = Date.parse(dateHdr);
    if (!Number.isFinite(server)) return 0;
    const local = Date.now();
    return server - local;
  } catch {
    return 0;
  }
}

async function ensureClient(): Promise<void> {
  if (_client) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const accountId = requireEnv('R2_ACCOUNT_ID');
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const region = 'auto';
    const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
    // Disable automatic body checksum on presigned PUT URLs to avoid mismatches when the client uploads an arbitrary body
    if (!process.env.AWS_S3_DISABLE_BODY_CHECKSUM) process.env.AWS_S3_DISABLE_BODY_CHECKSUM = 'true';
    _offsetMs = await computeClockOffsetMs(endpoint);
    _client = new S3Client({
      region,
      endpoint,
      // use virtual-hosted-style by default (recommended by Cloudflare R2)
      credentials: { accessKeyId, secretAccessKey },
    });
  })();
  return _initPromise;
}

export function r2PublicUrlForKey(key: string): string | null {
  const base = (process.env.R2_PUBLIC_BASE || '').trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, '');
  return `${clean}/${key}`;
}

export async function getPresignedPut(params: { key: string; contentType?: string; expiresSec?: number }): Promise<string> {
  await ensureClient();
  const client = _client!;
  const bucket = requireEnv('R2_BUCKET');
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: params.key, ContentType: params.contentType || 'application/octet-stream' });
  const url = await getSignedUrl(client, cmd, { expiresIn: params.expiresSec || 300, signingDate: new Date(Date.now() + _offsetMs) });
  return url;
}

export async function getPresignedGet(params: { key: string; expiresSec?: number }): Promise<string> {
  const pub = r2PublicUrlForKey(params.key);
  if (pub) return pub;
  await ensureClient();
  const client = _client!;
  const bucket = requireEnv('R2_BUCKET');
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: params.key });
  const url = await getSignedUrl(client, cmd, { expiresIn: params.expiresSec || 300, signingDate: new Date(Date.now() + _offsetMs) });
  return url;
}

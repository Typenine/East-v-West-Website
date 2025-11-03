import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is missing`);
  return v;
}

export function getR2Client(): S3Client {
  if (_client) return _client;
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  _client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function r2PublicUrlForKey(key: string): string | null {
  const base = (process.env.R2_PUBLIC_BASE || '').trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, '');
  return `${clean}/${key}`;
}

export async function getPresignedPut(params: { key: string; contentType?: string; expiresSec?: number }): Promise<string> {
  const client = getR2Client();
  const bucket = requireEnv('R2_BUCKET');
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: params.key, ContentType: params.contentType || 'application/octet-stream' });
  const url = await getSignedUrl(client, cmd, { expiresIn: params.expiresSec || 300 });
  return url;
}

export async function getPresignedGet(params: { key: string; expiresSec?: number }): Promise<string> {
  const pub = r2PublicUrlForKey(params.key);
  if (pub) return pub;
  const client = getR2Client();
  const bucket = requireEnv('R2_BUCKET');
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: params.key });
  const url = await getSignedUrl(client, cmd, { expiresIn: params.expiresSec || 300 });
  return url;
}

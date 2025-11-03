#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { neon } from '@neondatabase/serverless';
import { list } from '@vercel/blob';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} missing`);
  return v;
}

async function main() {
  const write = flag('write');
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_TOKEN || '';
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.log('[migrate-blob-media-to-r2] DATABASE_URL missing. Skipping.');
    return;
  }

  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = requireEnv('R2_BUCKET');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  const sql = neon(dbUrl);

  let blobs: Array<{ pathname: string; url: string; contentType?: string }> = [];
  try {
    const r = await list({ prefix: '', token: token || undefined } as any);
    blobs = (r?.blobs as Array<{ pathname: string; url: string; contentType?: string }>) || [];
  } catch {
    console.log('[migrate-blob-media-to-r2] Blob list failed or store suspended. Skipping import.');
    return;
  }

  const media = blobs.filter((b) => !b.pathname.endsWith('.json'));
  const imported: string[] = [];
  let copied = 0;

  for (const b of media) {
    try {
      const res = await fetch(b.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const arr = new Uint8Array(await res.arrayBuffer());
      const key = `migrated/${b.pathname.replace(/^\/+/, '')}`;
      if (write) {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: arr, ContentType: b.contentType || 'application/octet-stream' }));
        await sql`INSERT INTO media_files (owner_type, owner_id, file_key, content_type, url) VALUES ('unknown', NULL, ${key}, ${b.contentType || null}, NULL)`;
        imported.push(b.pathname);
      }
      copied++;
    } catch {}
  }

  // Write checkpoint file of imported keys
  if (write) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const out = path.join(process.cwd(), 'migrated-media-keys.json');
    fs.writeFileSync(out, JSON.stringify(imported, null, 2), 'utf8');
  }
  console.log(`[migrate-blob-media-to-r2] scanned=${media.length} copied=${copied} imported=${imported.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

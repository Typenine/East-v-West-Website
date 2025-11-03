#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { neon } from '@neondatabase/serverless';
import { list } from '@vercel/blob';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function strFlag(name: string, def = ''): string {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split('=')[1] : def;
}

async function main() {
  const write = flag('write');
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_TOKEN || '';
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.log('[migrate-blob-to-db] DATABASE_URL missing. Skipping.');
    return;
  }
  const sql = neon(dbUrl);

  let blobs: Array<{ pathname: string; url: string }> = [];
  try {
    const r = await list({ prefix: 'suggestions/', token: token || undefined } as any);
    blobs = (r?.blobs as Array<{ pathname: string; url: string }>) || [];
  } catch (e) {
    console.log('[migrate-blob-to-db] Blob list failed or store suspended. Skipping import.');
    return;
  }

  const imported: string[] = [];
  let parsed = 0;

  for (const b of blobs) {
    try {
      const res = await fetch(b.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = await res.json();
      if (!j || typeof j !== 'object') continue;
      const id = String(j.id || '');
      const text = String(j.content || j.text || '').trim();
      const category = j.category ? String(j.category) : null;
      const createdAt = j.createdAt ? new Date(j.createdAt) : null;
      if (!text) continue;
      parsed++;
      if (write) {
        if (createdAt) {
          await sql`INSERT INTO suggestions (text, category, created_at) VALUES (${text}, ${category}, ${createdAt})`;
        } else {
          await sql`INSERT INTO suggestions (text, category) VALUES (${text}, ${category})`;
        }
        imported.push(b.pathname);
      }
    } catch {}
  }

  console.log(`[migrate-blob-to-db] scanned=${blobs.length} parsed=${parsed} imported=${imported.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

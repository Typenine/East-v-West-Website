#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

async function main() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args.set(m[1], m[2]);
  }
  const token = args.get('token') || process.env.BLOB_READ_WRITE_TOKEN || '';
  const prefix = args.get('prefix') || 'suggestions/';
  const out = args.get('out') || 'public/suggestions.json';
  if (!token) {
    console.error('Missing token. Pass --token=VERCEL_BLOB_RW or set BLOB_READ_WRITE_TOKEN');
    process.exit(1);
  }
  let listFn;
  try {
    const mod = await import('@vercel/blob');
    listFn = mod.list;
    if (typeof listFn !== 'function') throw new Error('list not found');
  } catch (e) {
    console.error('Failed to import @vercel/blob. Install it with: npm i -D @vercel/blob');
    process.exit(1);
  }

  const blobs = [];
  let cursor = undefined;
  try {
    while (true) {
      const res = await listFn({ prefix, token, cursor });
      const arr = (res && Array.isArray(res.blobs)) ? res.blobs : [];
      blobs.push(...arr);
      cursor = res && res.cursor ? res.cursor : undefined;
      if (!cursor) break;
    }
  } catch (e) {
    console.error('Blob list failed:', e?.message || e);
    process.exit(1);
  }

  const outMap = new Map();
  let fetched = 0;
  for (const b of blobs) {
    const url = b && b.url ? b.url : '';
    if (!url) continue;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && typeof j === 'object' && typeof j.id === 'string') {
        outMap.set(j.id, j);
        fetched++;
      }
    } catch {}
  }

  const items = Array.from(outMap.values()).sort((a, b) => {
    const ta = Date.parse(a.createdAt || '');
    const tb = Date.parse(b.createdAt || '');
    return tb - ta;
  });

  const outPath = path.join(process.cwd(), out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(items, null, 2), 'utf8');

  console.log(`Exported ${items.length} suggestions to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

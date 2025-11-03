#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[db:migrate] DATABASE_URL missing');
    process.exit(1);
  }
  const dir = path.join(process.cwd(), 'drizzle');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql')).sort()
    : [];
  if (files.length === 0) {
    console.log('[db:migrate] No SQL files found in drizzle/. Nothing to do.');
    return;
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const f of files) {
      const p = path.join(dir, f);
      const sql = fs.readFileSync(p, 'utf8');
      console.log(`[db:migrate] Applying ${f} ...`);
      await client.query(sql);
      console.log(`[db:migrate] Applied ${f}`);
    }
  } finally {
    await client.end();
  }
  console.log('[db:migrate] Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });

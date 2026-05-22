/**
 * refresh-ktc.ts
 *
 * Run this locally (residential IP) to scrape KTC dynasty rankings and write
 * the result to your R2 bucket. The trade-analyzer API route will read from R2
 * instead of scraping live, bypassing Cloudflare's datacenter IP blocks.
 *
 * Usage:
 *   npx tsx scripts/refresh-ktc.ts
 *
 * Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in .env.local
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const KTC_R2_KEY = 'trade-analyzer/ktc.json';

interface KTCPlayer {
  playerName: string;
  position: string;
  team: string;
  age?: number;
  value: number;
}

async function fetchPage(page: number): Promise<string> {
  const url = `https://keeptradecut.com/dynasty-rankings?page=${page}&filters=QB%7CWR%7CRB%7CTE%7CRDP&format=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://keeptradecut.com/',
    },
  });
  if (!res.ok) throw new Error(`Page ${page}: HTTP ${res.status}`);
  return res.text();
}

function parsePage(html: string): KTCPlayer[] {
  const players: KTCPlayer[] = [];
  const blocks = html.split(/<div\s+class="onePlayer"\s*>/);
  blocks.shift();

  for (const block of blocks) {
    const b = block;

    const nameMatch = b.match(/class="player-name"[\s\S]*?<a[^>]*>([^<]+)</);
    if (!nameMatch) continue;
    const playerName = nameMatch[1].trim();

    const teamMatch = b.match(/class="player-team"[^>]*>([^<]+)</);
    const team = teamMatch ? teamMatch[1].trim() : '';

    const valueMatch = b.match(/class="value"[\s\S]*?<p>(\d+)<\/p>/);
    if (!valueMatch) continue;
    const value = parseInt(valueMatch[1].trim(), 10);
    if (!value || isNaN(value)) continue;

    const posMatch = b.match(/class="position-team"[\s\S]*?<p\s+class="position">([A-Z]+\d*)<\/p>/);
    const position = posMatch ? posMatch[1].trim().replace(/\d.*$/, '').toUpperCase() : '';

    const ageMatch = b.match(/class="position hidden-xs"[^>]*>([\d.]+)/);
    const age = ageMatch ? parseFloat(ageMatch[1].trim()) : undefined;

    if (!playerName) continue;
    players.push({ playerName, position, team, age, value });
  }

  return players;
}

async function scrapeKTC(): Promise<KTCPlayer[]> {
  const pages = Array.from({ length: 10 }, (_, i) => i);
  console.log('Fetching 10 pages in parallel...');
  const results = await Promise.allSettled(pages.map(fetchPage));

  const players: KTCPlayer[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const parsed = parsePage(r.value);
      console.log(`  Page ${i}: ${parsed.length} players`);
      players.push(...parsed);
    } else {
      console.warn(`  Page ${i}: FAILED — ${r.reason}`);
    }
  }
  return players;
}

async function main() {
  const envs = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = envs.filter((n) => !process.env[n] || !process.env[n]!.trim());
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const players = await scrapeKTC();
  console.log(`\nTotal players scraped: ${players.length}`);

  if (players.length < 100) {
    console.error('Too few players — likely a Cloudflare block or parse failure. Aborting write.');
    process.exit(1);
  }

  const payload = JSON.stringify({ players, updatedAt: new Date().toISOString() });

  // Attempt direct S3 upload first
  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: KTC_R2_KEY,
      Body: payload,
      ContentType: 'application/json',
    }));
    console.log(`\nWritten to R2: ${KTC_R2_KEY}`);
    console.log(`Players stored: ${players.length}`);
    console.log('\nDone. The trade analyzer will now use this KTC data.');
    return;
  } catch (e) {
    console.warn('Direct R2 upload failed:', e instanceof Error ? e.message : String(e));
  }

  // Fallback: save locally and instruct user to POST to API
  const localPath = path.resolve(__dirname, 'ktc-data.json');
  writeFileSync(localPath, payload);
  console.log(`\nSaved locally: ${localPath}`);
  console.log('To upload to R2, run your dev server and then:');
  console.log(`  curl -X POST http://localhost:3000/api/admin/upload-ktc -H "Content-Type: application/json" -d @"${localPath.replace(/\\/g, '/')}"`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

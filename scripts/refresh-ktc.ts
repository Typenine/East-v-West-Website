/**
 * refresh-ktc.ts
 *
 * Run this locally (residential IP) to scrape KTC dynasty rankings and write
 * the result to Vercel KV. The trade-analyzer API route will then read from KV
 * instead of scraping live, bypassing Cloudflare's datacenter IP blocks.
 *
 * Usage:
 *   npx tsx scripts/refresh-ktc.ts
 *
 * Requires KV_REST_API_URL and KV_REST_API_TOKEN in .env.local
 */

import dotenv from 'dotenv';
import path from 'path';
import { kv } from '@vercel/kv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const KTC_KV_KEY = 'trade-analyzer:ktc';
export const KTC_KV_TTL_HOURS = 24;

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
  const blocks = html.split(/class="onePlayer(?:\s[^"]*)?"/);
  blocks.shift();

  for (const block of blocks) {
    const nameMatch = block.match(/class="player-name"[^>]*>([^<]+)</);
    if (!nameMatch) continue;
    const rawName = nameMatch[1].trim();

    let playerName = rawName;
    let team = '';
    const suffixMatch = rawName.match(/^(.+?)([A-Z]{2,4})$/);
    if (suffixMatch) {
      playerName = suffixMatch[1].trim();
      team = suffixMatch[2] === 'RFA' ? 'FA' : suffixMatch[2];
    }

    const valueMatch = block.match(/class="value"[^>]*>([^<]+)</);
    if (!valueMatch) continue;
    const value = parseInt(valueMatch[1].trim(), 10);
    if (!value || isNaN(value)) continue;

    const posMatch = block.match(/class="position"[^>]*>([^<]+)</);
    const position = posMatch ? posMatch[1].trim().replace(/\d.*$/, '').toUpperCase() : '';

    const ageMatch = block.match(/class="position hidden-xs"[^>]*>([^<]+)</);
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
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error('Missing KV_REST_API_URL or KV_REST_API_TOKEN in .env.local');
    process.exit(1);
  }

  const players = await scrapeKTC();
  console.log(`\nTotal players scraped: ${players.length}`);

  if (players.length < 100) {
    console.error('Too few players — likely a Cloudflare block or parse failure. Aborting KV write.');
    process.exit(1);
  }

  const payload = { players, updatedAt: new Date().toISOString() };
  await kv.set(KTC_KV_KEY, payload);
  console.log(`\nWritten to Vercel KV: "${KTC_KV_KEY}"`);
  console.log(`Players stored: ${players.length}`);
  console.log(`Updated at: ${payload.updatedAt}`);
  console.log('\nDone. The trade analyzer will now use this KTC data for up to 24 hours.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

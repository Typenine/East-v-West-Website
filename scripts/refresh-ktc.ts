/**
 * refresh-ktc.ts
 *
 * Run this locally (residential IP) to scrape KTC and write the result to your
 * R2 bucket. The trade-analyzer API route reads from R2 instead of scraping
 * live, bypassing Cloudflare's datacenter IP blocks.
 *
 * Uses a headless browser (Playwright) and loads KTC's Trade Calculator so that
 * KTC's own JavaScript runs. This matters because KTC generates per-slot rookie
 * pick values ("2026 Pick 1.01" etc.) client-side via calcPicksRookies() — they
 * do not exist in the raw HTML. After the page's JS runs, every player, tier
 * pick ("2026 Early 1st"), and numbered slot pick is present on window.playersArray.
 *
 * Usage:
 *   npx tsx scripts/refresh-ktc.ts
 *
 * Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in .env.local
 * Requires Chromium: npx playwright install chromium
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const KTC_R2_KEY = 'trade-analyzer/ktc.json';
const KTC_TRADE_CALC_URL = 'https://keeptradecut.com/trade-calculator';

interface KTCPlayer {
  playerName: string;
  position: string;
  team: string;
  age?: number;
  value: number;
}

// Shape of the objects KTC exposes on window.playersArray (only fields we read).
interface KTCWindowPlayer {
  playerName: string;
  position: string;
  team: string;
  age?: number;
  superflexValues?: { value: number };
}

async function scrapeKTC(): Promise<KTCPlayer[]> {
  console.log('Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    console.log(`Loading ${KTC_TRADE_CALC_URL} and waiting for KTC's JS to build picks...`);
    // Use domcontentloaded (not networkidle — KTC keeps analytics sockets open, so the
    // network never goes fully idle). The waitForFunction below is the real readiness gate.
    await page.goto(KTC_TRADE_CALC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait until KTC's calcPicksRookies()/calcPicksDevy() has populated the numbered
    // slot picks. Their presence is the signal that values are fully computed.
    await page.waitForFunction(
      () => {
        const arr = (window as unknown as { playersArray?: KTCWindowPlayer[] }).playersArray;
        return Array.isArray(arr) && arr.some((p) => /Pick \d\.\d/.test(p.playerName));
      },
      { timeout: 45000 },
    );

    const raw = await page.evaluate(() => {
      const arr = (window as unknown as { playersArray?: KTCWindowPlayer[] }).playersArray ?? [];
      return arr.map((p) => ({
        playerName: p.playerName,
        position: p.position,
        team: p.team,
        age: p.age,
        value: p.superflexValues ? Math.round(p.superflexValues.value) : 0,
      }));
    });

    const players = raw.filter((p) => p.playerName && p.value > 0);
    const numberedPicks = players.filter((p) => /Pick \d\.\d/.test(p.playerName)).length;
    const tierPicks = players.filter((p) => p.position === 'RDP' && !/Pick \d\.\d/.test(p.playerName)).length;
    console.log(`  Read ${players.length} entries (${numberedPicks} numbered slot picks, ${tierPicks} tier picks)`);
    return players;
  } finally {
    await browser.close();
  }
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

  // Fallback: try posting to local dev server using the admin secret as cookie
  const adminSecret = process.env.EVW_ADMIN_SECRET?.trim() || '002023';
  const devUrl = 'http://localhost:3000/api/admin/upload-ktc';
  console.log(`\nTrying local dev server at ${devUrl}...`);
  try {
    const resp = await fetch(devUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `evw_admin=${adminSecret}`,
      },
      body: payload,
    });
    if (resp.ok) {
      const data = await resp.json();
      console.log(`Uploaded via dev server: ${data.players} players stored at ${data.key}`);
      console.log('\nDone. The trade analyzer will now use this KTC data.');
      return;
    }
    console.warn(`Dev server returned ${resp.status}: ${await resp.text()}`);
  } catch (e) {
    console.warn('Dev server not reachable:', e instanceof Error ? e.message : String(e));
  }

  // Try production Vercel deployment (has valid R2 creds even when local creds are stale)
  const prodUrl = 'https://east-v-west-website.vercel.app/api/admin/upload-ktc';
  console.log(`\nTrying production endpoint at ${prodUrl}...`);
  try {
    const resp = await fetch(prodUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `evw_admin=${adminSecret}`,
      },
      body: payload,
    });
    if (resp.ok) {
      const data = await resp.json();
      console.log(`Uploaded via production: ${data.players} players stored at ${data.key}`);
      console.log('\nDone. The trade analyzer will now use this KTC data.');
      return;
    }
    console.warn(`Production returned ${resp.status}: ${await resp.text()}`);
  } catch (e) {
    console.warn('Production upload failed:', e instanceof Error ? e.message : String(e));
  }

  // Last resort: save locally and print curl instructions
  const localPath = path.resolve(__dirname, 'ktc-data.json');
  writeFileSync(localPath, payload);
  console.log(`\nSaved locally: ${localPath}`);
  console.log('To upload manually:');
  console.log(`  curl -X POST ${prodUrl} -H "Content-Type: application/json" --cookie "evw_admin=${adminSecret}" -d @"${localPath.replace(/\\/g, '/')}"`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

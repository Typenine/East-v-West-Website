#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { neon } from '@neondatabase/serverless';

const doc = {
  "userId": "866793409938104320",
  "team": "Belleview Badgers",
  "version": 4,
  "updatedAt": "2025-10-30T02:08:22.845Z",
  "votes": {
    "suggestions": {
      "1761179609797-8zk124": 1
    }
  },
  "tradeBlock": [
    { "type": "player", "playerId": "2216" },
    { "type": "player", "playerId": "3321" },
    { "type": "player", "playerId": "4037" }
  ],
  "tradeWants": { "text": "", "positions": ["1st", "2nd"] }
};

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) { console.error('[upsert-user-doc] missing DATABASE_URL'); process.exit(1); }
  const sql = neon(url);
  const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : new Date();
  await sql`insert into user_docs (user_id, team, version, updated_at, votes, trade_block, trade_wants)
            values (${doc.userId}, ${doc.team}, ${doc.version}, ${updatedAt}, ${doc.votes ?? null}, ${doc.tradeBlock ?? null}, ${doc.tradeWants ?? null})
            on conflict (user_id) do update set team = excluded.team, version = excluded.version, updated_at = excluded.updated_at, votes = excluded.votes, trade_block = excluded.trade_block, trade_wants = excluded.trade_wants`;
  console.log('[upsert-user-doc] upserted for', doc.userId);
}

main().catch((e) => { console.error(e); process.exit(1); });

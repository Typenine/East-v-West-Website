#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[db:seed] DATABASE_URL missing');
    process.exit(1);
  }
  const sql = neon(url);
  // users
  await sql`INSERT INTO users (email, display_name, role) VALUES ('admin@evw.local','Admin','admin') ON CONFLICT (email) DO NOTHING;`;
  // teams
  await sql`INSERT INTO teams (name, abbrev) VALUES ('East All-Stars','EAS') ON CONFLICT (abbrev) DO NOTHING;`;
  await sql`INSERT INTO teams (name, abbrev) VALUES ('West All-Stars','WES') ON CONFLICT (abbrev) DO NOTHING;`;
  // players
  await sql`INSERT INTO players (name, position, nfl_team) VALUES ('John Doe','QB','NE') ON CONFLICT DO NOTHING;`;
  await sql`INSERT INTO players (name, position, nfl_team) VALUES ('Max Speed','RB','KC') ON CONFLICT DO NOTHING;`;
  console.log('[db:seed] Seeded minimal data');
}

main().catch((e) => { console.error(e); process.exit(1); });

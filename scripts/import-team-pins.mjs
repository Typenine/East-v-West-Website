#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { neon } from '@neondatabase/serverless';

const pinsText = `{
  "Belltown Raptors": {
    "hash": "Je7wcFAwRVe3ZGaErZvM+mgI0OvEsejy9OA2ofNVypF9Cc0/mNeWL0huGSBk9BgvshvKLKKTIb4f3oIHzdEORg==",
    "salt": "dQOqJs94VPmVufjIqQsdAA==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.120Z"
  },
  "Double Trouble": {
    "hash": "G0dw+BmDsfiKKI6iYoCENx+Hw8//E6Oe9/Div2FQnGeAylR4v0TscDKv+EaItAs8poAEpoFVdSKqWqsDP8q1gw==",
    "salt": "2rDVEEmMISIeVuewTVJVKQ==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.178Z"
  },
  "Elemental Heroes": {
    "hash": "7eYuqyD7T7x8svgrO5qHpkmFeZpl50gR518xlrblPn+zzoG6sDs7YhnEHkJLd/ARJzOy798JLF1G3NGM3qJ+gQ==",
    "salt": "/p/99uRhoEDLJWrlrKb0eg==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.246Z"
  },
  "Mt. Lebanon Cake Eaters": {
    "hash": "/Qh7YFIToXN46r9XmgE7Uydlu+nDjbhwYfVzijh6mZy/dlUAF7IlKy5H8Uw/h6of/Mi2LwzbqIWLKluLTKr2Uw==",
    "salt": "MqJP+X7CvhSBI8lxw0x1rA==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.316Z"
  },
  "Belleview Badgers": {
    "hash": "+586EItP4NcG7JnT9p6yRk1riaRWObGx5XLkj8tTk0N9wmZwMFyvs4fTAF8nZo202ig+0lUxRJpnu59c4sqnxg==",
    "salt": "2EObNqKGAfAd/h9YsTesdA==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.386Z"
  },
  "BeerNeverBrokeMyHeart": {
    "hash": "ckysuWFFWVR/d967L72oVWD6mNiw0o2/9JmM4mOdwLdlG3GRTLuMq/2UViVGygmnRMkihRSTgniL3Tt88+DQsQ==",
    "salt": "xUilZZ1X8pIyoDFy3r24aA==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.440Z"
  },
  "Detroit Dawgs": {
    "hash": "dPwsDh7KJi99yVyU4xPE3SzdXl+73zZlAlnk94FLUIq/eWCYgS7T0liPIRe5biC0k4PpStmfGjxm7HPvE1ZdEg==",
    "salt": "3KDEn3wOIHTYeMizIYprOA==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.493Z"
  },
  "bop pop": {
    "hash": "ezEO2yETVXd3ZjgTe1FqYCMD6/OyHOJQE3b04Ub5FErLGCg0qNdm0pNu7EaOewF67pLzyDhtSlJ+AGtcwtPeow==",
    "salt": "rdpnj62iJD/mL4cdo8RS5A==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.545Z"
  },
  "Minshew's Maniacs": {
    "hash": "Yg/3zXIeA3WVzxdXaQ9UmyvUBuJ7mhWC6inzcMnL3abusuzdCjH9y2ynLmMH47Jwc1VM61S4AcRWMwjqYRN0fw==",
    "salt": "Ax91oIEhZy8uV0PePUAiRg==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.598Z"
  },
  "Red Pandas": {
    "hash": "b2mwY/KE97suxCiwaNbbHJPZ+wF155y/Kuw758BjAtmmY5qmzFD9eH0P3GlMaoJkD+0mWoSadvImKg2CFEnPvw==",
    "salt": "ZJVFNZcNbVJy9jE8I4yUDg==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.652Z"
  },
  "The Lone Ginger": {
    "hash": "dER6kuplEBGsOnfylIx/OGJIYtOXsM9XnT3d3ye0NfJQfmORWYgeikcO3A4CR7z7gMRuEsWBkGso3dFXCigwhQ==",
    "salt": "tjimmTEw2/qTpNrzgeJ2LA==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.705Z"
  },
  "Bimg Bamg Boomg": {
    "hash": "TkP6JeWpfmX/UW+zBz+Q4sll16MdHBMMMxYcsfGIcH8rwGQiBvP/jX77ETHp/Z+ZmVYLwOGXMJMoCAc+kJG1UA==",
    "salt": "a6Ridq9LYxPfFZJLBqOAWw==",
    "pinVersion": 1,
    "updatedAt": "2025-10-23T22:58:02.758Z"
  }
}
`;

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) { console.error('[import-pins] missing DATABASE_URL'); process.exit(1); }
  const sql = neon(url);
  let obj;
  try { obj = JSON.parse(pinsText); } catch { console.error('[import-pins] failed to parse JSON'); process.exit(1); }
  const entries = Object.entries(obj);
  let upserted = 0;
  for (const [team, val] of entries) {
    if (!val || typeof val !== 'object') continue;
    const hash = String(val.hash || '');
    const salt = String(val.salt || '');
    const pinVersion = Number(val.pinVersion || 1);
    const updatedAt = val.updatedAt ? new Date(val.updatedAt) : new Date();
    if (!hash || !salt) continue;
    const teamSlug = slugify(team);
    await sql`insert into team_pins (team_slug, hash, salt, pin_version, updated_at) values (${teamSlug}, ${hash}, ${salt}, ${pinVersion}, ${updatedAt}) on conflict (team_slug) do update set hash = excluded.hash, salt = excluded.salt, pin_version = excluded.pin_version, updated_at = excluded.updated_at`;
    upserted++;
  }
  console.log(`[import-pins] upserted=${upserted}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

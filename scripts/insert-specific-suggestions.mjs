#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { neon } from '@neondatabase/serverless';

const items = [
  {
    id: '1761304775259-5siwui',
    content: `Expansion and Clarification of Taxi Squad Eligibility\n\nProposed Change: \nExpand the taxi squad to allow **up to 5 players**, maintaining the eligibility restriction to **first- and second-year players only**.\n\nRevised Rule Language:  \nEach team may designate up to **five (5)** players for their taxi squad. Eligible players must be in their **rookie (Year 1)** or **sophomore (Year 2)** NFL season. Taxi squad players may not be started unless formally promoted to the active roster. Once promoted, they cannot return to the taxi squad.\n\n\n✅ Rationale for the Amendment\n\n1. 🎯 Encourages Long-Term Strategy\n- Expanding the taxi squad gives managers more flexibility to invest in developmental prospects.  We draft up to 4 rookies per year so over 2 years that is 8 prospects that you will likely have to drop by year 2 if they have not broken out. \n- It rewards scouting and draft-day foresight, especially in dynasty or keeper formats.\n\n2. 🧠 Enhances League Depth and Engagement\n- More taxi slots mean deeper rosters and more meaningful late-round draft picks.\n- Managers stay engaged throughout the season tracking player development and potential promotions.\n\n3. 🛡️ Protects Against Early-Career Volatility\n- First- and second-year players often face unpredictable usage or injuries.\n- A larger taxi squad allows teams to hold onto promising talent without sacrificing competitive roster spots.\n\n4. 🔄 Promotes Fairness and Balance\n- All teams benefit equally from the expanded flexibility.\n- It reduces the pressure to prematurely drop young players due to roster constraints.\n\n5. 📈 Aligns with NFL Trends\n- NFL teams increasingly rotate and develop young talent across multiple seasons.\n- This rule mirrors real-world roster management and adds realism to the league.`,
    category: null,
    createdAt: '2025-10-24T11:19:35.259Z',
  },
  {
    id: '1761253193268-pw0a3r',
    content: `West Suggestions: \n\nSAN DIEGO\nMontana\nOregon Coast (Seaside/Cannon Beach)\nHawaii\nColorado (Rocky Mountains)\nAlaska \nSalt Lake City/ Utah/ MOUNTAINS\nVegas\n\nRyans moms house`,
    category: 'Other',
    createdAt: '2025-10-23T20:59:53.268Z',
  },
  {
    id: '1755295013649-ypkpvc',
    content: `Denver, Hawaii, lake Tahoe, Vancouver, san Diego, Utah?\nSan Diego, Vancouver, Montana, Denver, Utah, Vegas, Oregon Coast.`,
    category: null,
    createdAt: '2025-08-15T21:56:53.647Z',
  },
  {
    id: '1755457976967-v2eumu',
    content: `Super bowl location selection committee\n\nIncrease payout for the toilet bowl champ, or remove the loser of that game needing to ship the trophy. You are playing to possibly win $20, but by losing you could owe $30+\n\n6 team playoffs\n\nChampions Dinner: The dinner menu for draft day is selected by that years champ, or the dinner on Friday is picked by the previous champion.\n\nStart voting for draft location around actual NFL Draft. Have Air BnB chosen booked and revealed at draft trip`,
    category: null,
    createdAt: '2025-08-17T19:12:56.965Z',
  },
  {
    id: '1755457995297-tbuyys',
    content: `Increase dues to help pay for for misc. League expenses\n\nMore rosters spots. 6 Team Playoffs. Loser punishment wheel`,
    category: null,
    createdAt: '2025-08-17T19:13:15.297Z',
  },
];

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) { console.error('[insert-specific] missing DATABASE_URL'); process.exit(1); }
  const sql = neon(url);
  let ok = 0, skipped = 0;
  for (const it of items) {
    const text = String(it.content || '').trim();
    if (!text) { skipped++; continue; }
    const created = it.createdAt ? new Date(it.createdAt) : null;
    const category = typeof it.category === 'string' && it.category.trim() ? it.category.trim() : null;
    // skip if same text+created_at already exists
    const keyIso = created ? created.toISOString() : '';
    const existing = await sql`select 1 from suggestions where text = ${text} and (${keyIso} = '' or created_at = ${created}) limit 1`;
    if (existing.length > 0) { skipped++; continue; }
    if (created) await sql`insert into suggestions (text, category, created_at) values (${text}, ${category}, ${created})`;
    else await sql`insert into suggestions (text, category) values (${text}, ${category})`;
    ok++;
  }
  console.log(`[insert-specific] inserted=${ok} skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

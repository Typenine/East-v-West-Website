#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { neon } from '@neondatabase/serverless';

const raw = `
{"id":"1761699948251-zf5sjr","content":"Thumbs up and down on submitted suggestions","category":"Website","createdAt":"2025-10-29T01:05:48.251Z"}



{"id":"1761304775259-5siwui","content":"Expansion and Clarification of Taxi Squad Eligibility\n\nProposed Change: \nExpand the taxi squad to allow **up to 5 players**, maintaining the eligibility restriction to **first- and second-year players only**.\n\nRevised Rule Language:  \nEach team may designate up to **five (5)** players for their taxi squad. Eligible players must be in their **rookie (Year 1)** or **sophomore (Year 2)** NFL season. Taxi squad players may not be started unless formally promoted to the active roster. Once promoted, they cannot return to the taxi squad.\n\n\n✅ Rationale for the Amendment\n\n1. 🎯 Encourages Long-Term Strategy\n- Expanding the taxi squad gives managers more flexibility to invest in developmental prospects.  We draft up to 4 rookies per year so over 2 years that is 8 prospects that you will likely have to drop by year 2 if they have not broken out. \n- It rewards scouting and draft-day foresight, especially in dynasty or keeper formats.\n\n2. 🧠 Enhances League Depth and Engagement\n- More taxi slots mean deeper rosters and more meaningful late-round draft picks.\n- Managers stay engaged throughout the season tracking player development and potential promotions.\n\n3. 🛡️ Protects Against Early-Career Volatility\n- First- and second-year players often face unpredictable usage or injuries.\n- A larger taxi squad allows teams to hold onto promising talent without sacrificing competitive roster spots.\n\n4. 🔄 Promotes Fairness and Balance\n- All teams benefit equally from the expanded flexibility.\n- It reduces the pressure to prematurely drop young players due to roster constraints.\n\n5. 📈 Aligns with NFL Trends\n- NFL teams increasingly rotate and develop young talent across multiple seasons.\n- This rule mirrors real-world roster management and adds realism to the league.","createdAt":"2025-10-24T11:19:35.259Z"}


{"id":"1761257281276-tg3rx1","content":"Ban the freaking taxi squad. It is dumb and should be replaced with 3 bench spots","createdAt":"2025-10-23T22:08:01.275Z"}


{"id":"1761253193268-pw0a3r","content":"West Suggestions: \n\nSAN DIEGO\nMontana\nOregon Coast (Seaside/Cannon Beach)\nHawaii\nColorado (Rocky Mountains)\nAlaska \nSalt Lake City/ Utah/ MOUNTAINS\nVegas\n\nRyans moms house","category":"Other","createdAt":"2025-10-23T20:59:53.268Z"}


{"id":"1761251740353-yz9ykd","content":"Dates for thanksgiving call: I’m free all day on the 29th and 30th. 28th I have a game against Phoenix","category":"Other","createdAt":"2025-10-23T20:35:40.353Z"}


{"id":"1761179609797-8zk124","content":"Make sure that the suggestion notification settings are working.","category":"Website","createdAt":"2025-10-23T00:33:29.796Z"}


{"id":"1759962930656-j7gzz7","content":"The draft page should have a round by round recap or draft board with the picks in order, not just what team drafted whom.","category":"Website","createdAt":"2025-10-08T22:35:30.656Z"}


{"id":"1758157489962-k1ggcr","content":"A tracker showing which teams still haven't beaten a specific opponent. Ie. Patrick never haven't beaten Noah and when it finally happens, that matchup drops off the board","category":"Website","createdAt":"2025-09-18T01:04:49.962Z"}




{"id":"1758157138734-4ohdso","content":"Should be able to pull the results for the old schedules? Like who did I play in week 4 of 2023, oh it was Jericho and I destroyed him because I always do","category":"Website","createdAt":"2025-09-18T00:58:58.734Z"}


{"id":"1758157138734-4ohdso","content":"Should be able to pull the results for the old schedules? Like who did I play in week 4 of 2023, oh it was Jericho and I destroyed him because I always do","category":"Website","createdAt":"2025-09-18T00:58:58.734Z"}


{"id":"1758157138734-4ohdso","content":"Should be able to pull the results for the old schedules? Like who did I play in week 4 of 2023, oh it was Jericho and I destroyed him because I always do","category":"Website","createdAt":"2025-09-18T00:58:58.734Z"}


{"id":"1757991962160-qsfx2k","content":"Website is fucking incredible I love it and feel like im criticizing it by making a suggestion even though I don't want to do that at all but how easy would it be to add every team instead of just top 5 to the leaderboards page? I want to see how far behind everyone else I am and to be able to talk shit when someone else eventually has worse stats","category":"Website","createdAt":"2025-09-16T03:06:02.159Z"}


{"id":"1755295013649-ypkpvc","content":"Denver, Hawaii, lake Tahoe, Vancouver, san Diego, Utah?\nSan Diego, Vancouver, Montana, Denver, Utah, Vegas, Oregon Coast.","createdAt":"2025-08-15T21:56:53.647Z"}


{"id":"1755457976967-v2eumu","content":"Super bowl location selection committee\n\nIncrease payout for the toilet bowl champ, or remove the loser of that game needing to ship the trophy. You are playing to possibly win $20, but by losing you could owe $30+\n\n6 team playoffs\n\nChampions Dinner: The dinner menu for draft day is selected by that years champ, or the dinner on Friday is picked by the previous champion.\n\nStart voting for draft location around actual NFL Draft. Have Air BnB chosen booked and revealed at draft trip","createdAt":"2025-08-17T19:12:56.965Z"}



{"id":"1755457995297-tbuyys","content":"Increase dues to help pay for for misc. League expenses\n\nMore rosters spots. 6 Team Playoffs. Loser punishment wheel","createdAt":"2025-08-17T19:13:15.297Z"}


{"id":"1756923070378-jm7kfu","content":"Podcast tab","category":"Website","createdAt":"2025-09-03T18:11:10.378Z"}
`;

function parseBlocks(text) {
  const parts = text.split(/\r?\n\s*\r?\n+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    try { out.push(JSON.parse(p)); } catch {}
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) { console.error('[sync] missing DATABASE_URL'); process.exit(1); }
  const sql = neon(url);
  const want = parseBlocks(raw).filter((o) => o && o.content);
  // Fetch existing suggestions content+createdAt
  const existing = await sql`select text, created_at from suggestions`;
  const have = new Set(existing.map((r) => `${r.text}\n@${new Date(r.created_at).toISOString()}`));
  let inserted = 0, skipped = 0;
  for (const it of want) {
    const text = String(it.content).trim();
    const createdIso = it.createdAt ? new Date(it.createdAt).toISOString() : '';
    const key = `${text}\n@${createdIso || ''}`;
    if (have.has(key)) { skipped++; continue; }
    const category = typeof it.category === 'string' && it.category.trim() ? it.category.trim() : null;
    if (createdIso) {
      await sql`insert into suggestions (text, category, created_at) values (${text}, ${category}, ${new Date(createdIso)})`;
    } else {
      await sql`insert into suggestions (text, category) values (${text}, ${category})`;
    }
    have.add(key);
    inserted++;
  }
  console.log(`[sync] inserted=${inserted} skipped=${skipped} target=${want.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

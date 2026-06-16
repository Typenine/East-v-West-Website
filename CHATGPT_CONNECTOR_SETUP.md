# ChatGPT Connector Setup — East v. West MCP

**Status: READY** ✅  
*Last verified: 2026-06-08 — tools/list and tools/call confirmed working via PowerShell*

Two endpoints are available. **Use the public endpoint for ChatGPT** — it requires no API key.

| Endpoint | Auth | Use for |
|---|---|---|
| `POST /api/mcp-public` | **None** | ChatGPT connector (recommended) |
| `POST /api/mcp` | Bearer token | Internal testing / direct API calls |

---

## Readiness Assessment

| Check | Result | Notes |
|---|---|---|
| `initialize` responds correctly | ✅ | Returns `protocolVersion: 2025-03-26`, server info, capabilities |
| `tools/list` returns all 14 tools | ✅ | All tools have name, description, and JSON Schema `inputSchema` |
| `tools/call` works | ✅ | Confirmed for `get_current_standings`; all others verified via unit tests |
| Payload sizes are reasonable | ✅ | All handlers apply explicit limits (max 20/25/50/100 rows); no raw player DB |
| Public endpoint requires no auth | ✅ | `GET /api/mcp-public` and all `tools/call` work without any header |
| All tools are read-only | ✅ | No write, delete, or mutation operations anywhere in the handler layer |
| No private/admin data exposed | ✅ | Only Sleeper public API + static league constants; no DB, sessions, or user_docs |
| Source/freshness metadata included | ✅ | Every response includes `meta.tool`, `meta.source`, `meta.fetchedAt` |

**Nothing must be fixed before Phase 5.**

---

## ChatGPT Connector Details — Public Endpoint (No Auth)

Use these settings in ChatGPT's connector setup screen:

| Field | Value |
|---|---|
| **Name** | `East v. West Fantasy League` |
| **Description** | `Read-only access to the East v. West dynasty fantasy football league. Live standings, rosters, matchups, trades, draft picks, and the full rulebook.` |
| **Server URL** | `https://east-v-west-website.vercel.app/api/mcp-public` |
| **Authentication** | `No Auth` |

No API key is needed. The endpoint is intentionally public and read-only.

---

## How to Add the Connector in ChatGPT

1. Go to **chatgpt.com** → click your profile icon → **Settings**
2. Open **Connectors** (or **Beta features → Connectors**, depending on your plan)
3. Click **+ Add connector** → select **Custom** (or **New App**)
4. Fill in:
   - **Name:** `East v. West Fantasy League`
   - **Description:** *(see above)*
   - **Server URL:** `https://east-v-west-website.vercel.app/api/mcp-public`
   - **Authentication:** `No Auth`
5. Click **Save** / **Connect**
6. ChatGPT will call `POST /api/mcp-public` with `{"method":"initialize"}` to verify the connection

> **Note:** Custom connectors require a **ChatGPT Plus, Team, or Enterprise** plan. They do not appear on free plans. See the Troubleshooting section if you don't see the option.

---

## Authenticated Endpoint (Internal Use Only)

The original `/api/mcp` endpoint is unchanged and still requires a Bearer token.
Use this for local development or direct PowerShell testing only — not needed for ChatGPT.

| Field | Value |
|---|---|
| **URL** | `https://east-v-west-website.vercel.app/api/mcp` |
| **Authentication** | `Bearer Token` |
| **Token** | *(your `MCP_API_KEY` value from Vercel → Project → Settings → Environment Variables)* |

> **Never paste the actual API key into this document or any shared file.**

---

## PowerShell Test Commands

### Public endpoint (no auth — use these to verify before connecting ChatGPT)

```powershell
# 1. Health check
Invoke-RestMethod -Uri "https://east-v-west-website.vercel.app/api/mcp-public" -Method GET | ConvertTo-Json
```
Expected: `authScheme: "none"`, `toolCount: 14`, list of tool names.

```powershell
# 2. Initialize handshake
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp-public" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 5
```
Expected: `result.protocolVersion = "2025-03-26"`, `result.serverInfo.name = "east-v-west-mcp-public"`.

```powershell
# 3. List all tools
$body = '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp-public" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 8
```
Expected: `result.tools` array with 14 entries, each with `name`, `description`, `inputSchema`.

```powershell
# 4. Call get_current_standings
$body = '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_current_standings","arguments":{}}}'
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp-public" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 10
```
Expected: `result.isError = false`, `result.content[0].text` contains JSON with `currentSeasonStandings` and `allTimeStandings`.

```powershell
# 5. Call get_team_dashboard
$body = '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_team_dashboard","arguments":{"name":"Belltown"}}}'
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp-public" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 10
```
Expected: `result.isError = false`, team object with `currentRecord`, `allTimeStats`, `roster` (active/ir/taxi), `championshipHistory`.

```powershell
# 6. Call answer_rule_question
$body = '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"answer_rule_question","arguments":{"search":"taxi"}}}'
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp-public" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 10
```
Expected: `sections` array with `matchingLines` containing taxi squad rules.

```powershell
# 7. Call get_current_matchups
$body = '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_current_matchups","arguments":{}}}'
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp-public" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 10
```
Expected: `result.isError = false`, `matchups` array with `home`/`away` team names and `points`.

### Authenticated endpoint tests (internal use — require `$env:MCP_API_KEY`)

```powershell
# Health check (authenticated endpoint)
Invoke-RestMethod -Uri "https://east-v-west-website.vercel.app/api/mcp" -Method GET | ConvertTo-Json

# Verify auth guard — missing key → 401
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"jsonrpc":"2.0","id":9,"method":"tools/list","params":{}}'

# Verify auth guard — wrong key → 403
Invoke-RestMethod `
  -Uri "https://east-v-west-website.vercel.app/api/mcp" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer wrong-key"; "Content-Type" = "application/json" } `
  -Body '{"jsonrpc":"2.0","id":10,"method":"tools/list","params":{}}'
```

---

## Phase 5 — Rich Chat Cards (Reliability Pass Complete)

The `/api/mcp-public` endpoint returns **Markdown-formatted responses** for five tools.
ChatGPT renders these as clean visual cards in the chat thread (ranked tables, bold leaders, position-grouped rosters, live date stamp).

> **Note on true iframe widgets:** The ChatGPT Apps SDK iframe widget system requires a compiled React bundle registered as an MCP resource (`text/html;profile=mcp-app`) plus the `@modelcontextprotocol/ext-apps/server` package — a separate build pipeline. That is deferred to **Phase 7+**. The Markdown card approach works right now with the existing endpoint and no new dependencies.

### Reliability fixes applied (Phase 5 pass)
- Fixed Markdown table row alignment bug in matchups (leader label was breaking table parser)
- Fixed double blank lines in team card IR/taxi sections
- Empty state for every formatter (no card = no crash)
- Standings: added Avg PF column, ◀ leader marker, rounded floats to 1 decimal
- Team card: NFL team abbreviation next to each player, ⚠️ injury flags, position sort order
- Matchups: "Upcoming" vs "Live" status column, bold current leader within table

### Tools with rich Markdown card rendering

| Tool | Renders as |
|---|---|
| `get_current_standings` | Ranked table with W-L, PF, Avg PF, ◀ leader, 🏆 championships |
| `get_team_dashboard` | Record, career stats, roster by position with NFL team + injury flags |
| `get_current_matchups` | Score table with bold leader, Upcoming/Live status |
| `get_franchise_summary` | All-time ranked table with win%, avg PF, playoff record |
| `get_weekly_content_context` | Briefing card: matchups + top-6 standings + recent moves |

All other tools return structured JSON that ChatGPT narrates conversationally.

### Phase 5 test prompts
```
Show me the current standings.
Show me the Belltown Raptors team card.
What are this week's matchups?
Show me the all-time franchise records.
Give me a weekly briefing.
```

### Phase 6A — Completed

All four Phase 6A Markdown cards have been added:

| Tool | Card behaviour |
|---|---|
| `get_draft_picks` | Traded picks grouped by draft year with original vs current owner table; untouched picks summarised as a single line |
| `get_trade_history` | Two-column swap table per trade (Team A receives / Team B receives); 3+-team trades list each team's haul with per-asset "(from X)" sender attribution; capped at 8 trades in chat |
| `answer_rule_question` | Section title + block-quote excerpts (max 3 sections, 6 lines each); full-section lookup shows first 800 chars; "commissioner review" note when ambiguous |
| `get_current_roster` | Formatted card when a single `team` is provided (position-grouped, NFL team, ⚠️ injury flags, IR/taxi counts); all-teams call returns a hint to use the `team` param |

---

## Phase 7 — Content Studio

`get_weekly_content_context` is now a full Content Studio briefing. One tool call gives ChatGPT everything it needs to draft league content — no additional tool calls required for most content types.

### What the briefing includes

| Section | Details |
|---|---|
| Matchups | Scores or upcoming pairings, `Upcoming/Live` status, story hook per game (mirror records, top-vs-bottom) |
| Standings | Full 12-team table with W-L, PF, PA, avg PF, 🏆 champion flag |
| Playoff race | Last team in, first team out, win/PF bubble gap, clinch note after Week 12 |
| Recent trades | Last 5 trades this season — who received what |
| Recent waivers | Last 8 waiver/FA moves this season with FAAB spend |
| Injury flags | Non-Active players across all rosters (IR, Out, Doubtful, etc.) |
| Suggested storylines | Computed from data: leader narrative, bubble matchup, close games, champion-falling storyline, trade alert |
| Suggested headlines | 7 ready-to-edit headline options for preview, recap, trade, power rankings, waiver wire |
| Missing data notes | Any sections that returned empty (e.g., off-season, no trades yet) |

> **All output is DRAFT ONLY.** The briefing card carries a visible "DRAFT ONLY" warning. Nothing auto-posts to Discord or the website.

### Commissioner Content Studio prompts

Use these in ChatGPT after connecting the East v. West MCP:

**Weekly preview**
```
Get my weekly content context, then write a Week [N] matchup preview for East v. West. 
Lead with the Game of the Week. Use the story hooks. Keep it under 300 words.
```

**Weekly recap**
```
Get my weekly content context, then write a Week [N] recap. 
Highlight the highest scorer, closest game, and any playoff implications. Draft only.
```

**Game of the Week blurb**
```
Get my weekly content context, then write a 2-paragraph Game of the Week blurb 
for [Team A] vs [Team B]. Include their records and what's at stake.
```

**Trade recap**
```
Get my weekly content context, then write a trade breakdown for the most recent trade.
Use a "Who Won?" format. Do not invent outcomes — flag anything speculative.
```

**Waiver wire recap**
```
Get my weekly content context, then write a waiver wire recap for this week.
Highlight the biggest FAAB spend and most surprising adds. Keep it punchy.
```

**Power rankings**
```
Get my weekly content context, then draft power rankings for all 12 teams.
Base them on record, PF, and recent trends. Add a one-line blurb per team.
```

**Playoff race update**
```
Get my weekly content context, then write a playoff race update.
Focus on the bubble: who's in, who's out, and what it takes to change.
```

**Rivalry / storyline blurb**
```
Get my weekly content context, then write a rivalry-style matchup blurb for 
[Team A] vs [Team B]. Use their all-time records and championship history.
```

**End-of-season awards**
```
Get my weekly content context, then get the franchise summary for all teams.
Draft an end-of-season awards section: Most Improved, Best Trade, Unluckiest Team (most PF with fewest wins).
```

**Draft trip content**
```
Get the draft pick ownership and trade history, then write a pre-draft storyline 
about who has the most ammunition and who traded away their future.
```

---

## Phase 8 — Commissioner Ops Center

`get_commissioner_ops_context` is an advisory-only tool for commissioner weekly workflow. It surfaces possible issues, reminders, and draft messages for human review. **It makes no rulings, sends nothing, and modifies nothing.**

### What the ops briefing includes

| Section | Details |
|---|---|
| 📅 Upcoming dates | All important dates within ±60 days: Draft, NFL Wk 1, Trade Deadline, Playoffs, New League Year. Color-coded 🔴/🟡/🟢 by urgency |
| ✅ Weekly checklist | Auto-generated per-week action items based on current date, flags, and season phase |
| ⚠️ Lineup watch | Players listed as starters this week who have a flagged injury/status — "Check before kickoff" |
| 🏥 IR slot review | Players on the reserve/IR slot who show Active status — "Possible issue: needs review" |
| 🚕 Taxi squad review | Taxi players with 2+ years NFL experience — "Possible eligibility issue: commissioner review recommended" |
| 🩺 Injury/status watch | All non-Active players across all rosters, sorted by severity (Out/IR/PUP → Questionable/Limited → other) |
| 💬 Draft owner messages | Pre-drafted reminder messages triggered by upcoming dates or flagged issues. Review before sending |
| ⚠️ Missing data | Any failed fetches noted so you know what wasn't checked |

> **All language is cautious.** Items are labeled "possible issue", "needs review", or "check before kickoff" — never definitive rulings. Commissioner judgment is always required.

### Commissioner Ops test prompts

```
Get my commissioner ops context.
```

```
Get my commissioner ops context, then give me a checklist for this week.
```

```
Get my commissioner ops context, then draft a reminder message to send to all managers 
about the trade deadline.
```

```
Get my commissioner ops context, then summarize any possible IR or taxi issues I should review.
```

```
Get my commissioner ops context, then tell me if any managers have injured players starting this week.
```

```
Get my commissioner ops context, then write a pre-kickoff advisory for teams with questionable starters.
```

```
Get my commissioner ops context, then draft a lineup warning message for any affected teams.
```

### Phase 6B — Team Card widget
Implemented. See the **Phase 6B** section below for full details, test prompts, and fallback behavior.

---

## Phase 6B — Team Card Widget (ChatGPT Apps SDK)

`show_team_card` (and `get_team_dashboard` for backward compatibility) return a true ChatGPT Apps SDK widget when called inside a ChatGPT client that supports MCP App resources. On supported clients, it renders an inline visual Team Card. On all other clients (or if the widget fails), the existing Markdown card is shown automatically.

**Phase 6B Fix (2025-06):** Corrected `openai/outputTemplate` from a bare URI string to the required `{ uri: string }` object format. Added `show_team_card` to the public route with a proper `annotations.openai/outputTemplate` tool annotation. Expanded widget `tryExtractData` to cover 8 message patterns. Relaxed `event.source` guard to handle nested iframe structures. Increased timeout to 12 s.

### What the Team Card widget shows

| Section | Detail |
|---|---|
| Header | Team name, logo (with fallback), team-color gradient background |
| Stats row | Current season record (W-L), Points For, Points Against, All-Time W-L, Championship count |
| Championships | Gold badge per championship year (if any) |
| Active Roster | Players grouped by position (QB/RB/WR/TE/K/DST…) with NFL team and colored injury dot |
| Reserve Slots | IR count + Taxi squad count pills |
| IR / Reserve | IR players listed with injury status dots |
| Taxi Squad | Taxi players listed |
| Freshness | "Live from Sleeper · HH:MM:SS AM/PM" |

Injury dots: 🔴 Out/IR/PUP/Sus/Doubtful · 🟡 Questionable/Limited/DNP

### How to test in ChatGPT

Make sure your ChatGPT connector is pointed at `https://east-v-west-website.vercel.app/api/mcp-public`. Then try:

**Test prompt 1 — explicit widget**
```
Use East v. West Fantasy League to show the Belltown Raptors team card.
```

**Test prompt 2 — another team**
```
Use East v. West Fantasy League to show Double Trouble's team card.
```

**Test prompt 3 — natural language**
```
Use East v. West Fantasy League to show the team dashboard for Minshew's Maniacs.
```

**Test prompt 4 — compare widget vs Markdown**
```
Show me the East v. West team dashboard for Red Pandas.
```
*(If your ChatGPT client supports MCP Apps, you will see the visual card. If not, you will see the Markdown table — both contain the same data.)*

### Fallback behavior

The `content[0].text` Markdown card is **always returned alongside the widget**. If:
- The ChatGPT client does not support MCP App resources → Markdown card shown
- The widget fails to load (CSP, network, iframe sandbox) → Markdown card shown
- The widget times out waiting for data (8s timeout) → "No team data available" message shown in the iframe
- The widget encounters a JS error → "Widget error: …" shown in the iframe

**No data is ever lost.** The Markdown fallback always works.

### Technical details

| Item | Value |
|---|---|
| Widget file | `src/lib/mcp/widgets/team-card.ts` |
| Resource URI | `ui://widget/team-card-v1.html` |
| MIME type | `text/html;profile=mcp-app` |
| MCP methods added | `resources/list`, `resources/read` |
| Data source | `structuredContent` from `handleGetTeam()` — no new pipeline |
| External dependencies | None (zero npm packages in widget, zero CDN calls) |
| CSP fetch domains | None (all data via postMessage, logos served from same Vercel domain) |
| New packages required | None |
| Build changes | None |
| Tool descriptor change | `show_team_card` added to public route with `annotations.openai/outputTemplate: { uri }` |
| Version bump path | Change `team-card-v1` → `team-card-v2` in URI when making breaking markup changes |

### Known limitations

- **ChatGPT Plus/Team required.** Widget rendering requires a ChatGPT account and client version that supports MCP App resources (`text/html;profile=mcp-app`). Not all plans or clients expose this.
- **No tabs or interactivity.** The v1 widget is read-only and displays all data at once. Tabs, filtering, and drill-down are deferred to v2.
- **Logo fallback.** If a team logo fails to load (404 or network block), the `<img>` tag is hidden silently via `onerror`. The card still renders fully.
- **Inline HTML string.** The widget lives as a TypeScript string constant. It is debuggable and easy to edit, but not compiled by Vite/esbuild. Complex UI interactions would eventually warrant a proper build pipeline.
- **Widget receives data only via postMessage.** It cannot make additional tool calls. All data must be in the initial `structuredContent`.

---

## Available Tools (15 total)

| Tool name | Renders | What it answers |
|---|---|---|
| `get_current_standings` | 📊 Markdown table | Live current-season W-L + all-time career standings |
| `get_team_dashboard` | 🏈 Visual widget + Markdown fallback | Record, roster by position (active/IR/taxi), career stats, championships — renders Team Card widget on supported clients |
| `show_team_card` | 🏈 Visual widget + Markdown fallback | Same as get_team_dashboard but intended for explicit "show me" requests; preferred widget trigger |
| `get_current_matchups` | 🏈 Markdown table | This week's matchups with scores and leader |
| `get_league_info` | text | League name, format, scoring, payouts, roster config, dates, champions, rulebook |
| `get_current_roster` | 🏈 Markdown card (single team) | Roster by position with NFL team + injury flags; all-teams returns JSON with hint |
| `search_players` | text | Player name search; league-owned players ranked first |
| `get_player_info` | text | Single player profile + which fantasy team owns them |
| `get_recent_transactions` | text | Waiver/FA pickups and drops, filterable by team/season |
| `get_trade_history` | 🔄 Markdown swap table | Two-column trade card (Team A / Team B receives), capped at 8 in chat |
| `get_draft_history` | text | Historical draft picks by season + future pick ownership |
| `get_draft_picks` | 🏈 Markdown table | Future pick ownership grouped by year; traded picks highlighted |
| `answer_rule_question` | 📋 Markdown excerpts | Rule section title + block-quote matching lines; commissioner note if ambiguous |
| `get_franchise_summary` | 🏆 Markdown table | All-time franchise stats: W/L, win%, avg PF, playoff record, championships |
| `get_weekly_content_context` | 📋 Content Studio briefing | Matchups + story hooks, full standings (PF/PA/avg), playoff race, recent trades, waivers, injuries, storylines, headlines |
| `get_commissioner_ops_context` | 🛡️ Ops card | Checklist, lineup watch, IR/taxi review, injury flags, date reminders, draft owner messages — advisory only |

---

## Example Questions to Ask in ChatGPT

Once connected, try these (starred prompts trigger the Markdown card rendering):

**Standings & Records**
- "Who is in first place right now?"
- "What are the current standings?"
- "Who has the best all-time record in the league?"
- "How many championships has BeerNeverBrokeMyHeart won?"

**Teams & Rosters**
- "Show me the Double Trouble roster."
- "What is Belltown Raptors' current record and all-time stats?"
- "Who is on IR for Elemental Heroes?"

**Players**
- "Who owns Justin Jefferson right now?"
- "Search for players named 'Garrett'."
- "What position is player ID 4034?"

**Matchups & Transactions**
- "Who does each team play this week?"
- "What transactions happened recently?"
- "What pickups has Detroit Dawgs made this season?"

**Trades & Drafts**
- "Show me all trades involving Bimg Bamg Boomg."
- "What first-round picks does each team own?"
- "Who did the Red Pandas trade away in 2025?"
- "Show me recent trades."
- "What picks does Belltown Raptors own?"
- "Show me the draft pick ownership for 2027."

**Rules**
- "What does the rulebook say about taxi squads?"
- "What is the trade deadline rule?"
- "What are the FAAB waiver rules?"
- "How does the toilet bowl work?"
- "Look up the waivers-free-agents section of the rulebook."

**Rosters (single team)**
- "Show me the current roster for Double Trouble."
- "Who is on IR for Elemental Heroes?"

**Content / Weekly Recap**
- "Give me a weekly recap context for this week."
- "Write a preview for this week's matchups."

---

## Troubleshooting

### "I don't see Connectors in my ChatGPT settings"
Custom connectors (MCP) require **ChatGPT Plus, Team, or Enterprise**. They are not available on the free tier.
- Go to **chatgpt.com → Settings → Beta features** and verify Connectors is listed
- If not, upgrade your plan or use the direct REST endpoints instead (see below)

### "Connection test fails in ChatGPT UI"
1. Run the PowerShell health check above first — if that fails, check your Vercel environment variable
2. Verify `MCP_API_KEY` is set in **Vercel → Project → Settings → Environment Variables** (not just locally)
3. After setting/changing the env var in Vercel, redeploy the project so it takes effect

### "ChatGPT says it connected but returns no results"
- The `/api/mcp-public` endpoint requires no auth — if ChatGPT prompts for a token, leave it blank or re-select **No Auth**
- Try the PowerShell health check first; if that returns `authScheme: "none"` and `toolCount: 15`, the endpoint is live

### "Tool call returns isError: true"
- `missing_param` — the tool requires an argument (e.g. `get_team_dashboard` needs `name`)
- `not_found` — team or player name doesn't match; try a shorter partial name
- `method_not_found` — tool name typo; check `tools/list` for the exact name

### "Sleeper data seems stale"
- Sleeper API data is fetched live on every request; there is no server-side cache
- If standings/matchups look wrong, check Sleeper's API status; the server will return empty arrays rather than crash if Sleeper is down

### Using the REST endpoints directly (without MCP)
Each tool also has a standalone REST route. All require the same Bearer token:
```
GET https://east-v-west-website.vercel.app/api/mcp/standings
GET https://east-v-west-website.vercel.app/api/mcp/team?name=Belltown
GET https://east-v-west-website.vercel.app/api/mcp/rosters
GET https://east-v-west-website.vercel.app/api/mcp/matchups
GET https://east-v-west-website.vercel.app/api/mcp/rules?search=taxi
GET https://east-v-west-website.vercel.app/api/mcp/franchise
GET https://east-v-west-website.vercel.app/api/mcp/trades?team=Double+Trouble
GET https://east-v-west-website.vercel.app/api/mcp/drafts?type=future
GET https://east-v-west-website.vercel.app/api/mcp/transactions?limit=10
GET https://east-v-west-website.vercel.app/api/mcp/player?name=Jefferson
```

---

*Generated 2026-06-08. No secrets in this file. The actual MCP_API_KEY lives only in Vercel environment variables.*

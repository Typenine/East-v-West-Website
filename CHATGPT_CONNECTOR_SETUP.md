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

## Phase 5 — Proof of Concept: Rich Chat Cards

The `/api/mcp-public` endpoint now returns **Markdown-formatted responses** for three tools.
ChatGPT renders these as clean visual cards in the chat thread (table, bold headers, live date stamp).

> **Note on full iframe widgets:** The ChatGPT Apps SDK iframe widget system (embedded React components) requires a compiled frontend bundle registered as an MCP resource (`text/html;profile=mcp-app`) plus the `@modelcontextprotocol/ext-apps/server` package. That is a separate build pipeline and is Phase 6+. The Markdown card approach used here works right now with the existing endpoint.

### Tools with rich Markdown card rendering

| Tool | Renders as |
|---|---|
| `get_current_standings` | Ranked table with W-L, PF, and 🏆 championship counts |
| `get_team_dashboard` | Team header, season record, roster grouped by position, career stats |
| `get_current_matchups` | Matchup table with scores and bold leader indicator |

All other tools return structured JSON text that ChatGPT narrates conversationally.

### Test prompts for the Markdown cards

```
Show me the current standings.
Show me the Belltown Raptors team card.
What are this week's matchups?
```

---

## Available Tools (14 total)

| Tool name | Renders | What it answers |
|---|---|---|
| `get_current_standings` | 📊 Markdown table | Live current-season W-L + all-time career standings |
| `get_team_dashboard` | 🏈 Markdown card | Record, full roster by position (active/IR/taxi), career stats, championships |
| `get_current_matchups` | 🏈 Markdown table | This week's matchups with scores and leader |
| `get_league_info` | text | League name, format, scoring, payouts, roster config, dates, champions, rulebook |
| `get_current_roster` | text | All rosters or one team's roster with names, positions, status, slot |
| `search_players` | text | Player name search; league-owned players ranked first |
| `get_player_info` | text | Single player profile + which fantasy team owns them |
| `get_recent_transactions` | text | Waiver/FA pickups and drops, filterable by team/season |
| `get_trade_history` | text | All trades with player names and pick descriptions |
| `get_draft_history` | text | Historical draft picks by season + future pick ownership |
| `get_draft_picks` | text | Future pick ownership only |
| `get_franchise_summary` | text | All-time franchise stats: W/L, win%, PF/PA, playoff record, championships |
| `answer_rule_question` | text | Full rulebook plain text; keyword search and section lookup |
| `get_weekly_content_context` | text | Matchups, standings, recent moves, champions — for weekly recap/preview |

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

**Rules**
- "What does the rulebook say about taxi squads?"
- "What is the trade deadline rule?"
- "What are the FAAB waiver rules?"
- "How does the toilet bowl work?"

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
- Try the PowerShell health check first; if that returns `authScheme: "none"` and `toolCount: 14`, the endpoint is live

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

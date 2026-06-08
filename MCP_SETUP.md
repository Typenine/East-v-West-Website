# East v. West MCP Server — Setup & Testing Guide

## Overview

The MCP server exposes all East v. West league data as read-only tools that ChatGPT (or any MCP client) can call in real-time.

**Endpoint:** `POST /api/mcp`  
**Protocol:** [MCP HTTP Transport 2025-03-26](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/)  
**Auth:** `Authorization: Bearer <MCP_API_KEY>`  

---

## 1. Environment Setup

### Required environment variable

Add to `.env.local` (local dev) and Vercel project settings (production):

```
MCP_API_KEY=your-secret-key-here
```

Generate a strong key:

```bash
openssl rand -hex 32
```

Without `MCP_API_KEY` set, all `/api/mcp` requests return `503 mcp_not_configured`. The rest of the website is unaffected.

---

## 2. Available Tools (14 total)

| Tool | What it answers |
|------|----------------|
| `get_league_info` | League name, format, scoring, payouts, dates, champions — static, instant |
| `get_current_standings` | Live W/L standings (current season) + all-time career records |
| `get_team_dashboard` | One team's record, full roster, all-time stats, championship history |
| `get_current_roster` | Current-season rosters with player names, positions, injury status |
| `search_players` | Player name search across full database (league-owned ranked first) |
| `get_player_info` | Single player profile by Sleeper ID + current fantasy owner |
| `get_current_matchups` | This week's matchups with current/final scores |
| `get_recent_transactions` | Recent waiver/FA adds — filterable by team/season |
| `get_trade_history` | All trades with player + pick asset breakdown |
| `get_draft_history` | Historical draft picks by season + future pick ownership |
| `get_draft_picks` | Current future pick ownership (shortcut for `get_draft_history?type=future`) |
| `get_franchise_summary` | All-time W/L, win%, PF/PA, playoff record per team |
| `answer_rule_question` | Rulebook plain text search and section lookup |
| `get_weekly_content_context` | Everything for weekly content writing: matchups + standings + transactions |

---

## 3. Connecting ChatGPT

### Step 1 — Deploy with MCP_API_KEY set

The MCP endpoint must be on a public HTTPS URL. Deploy to Vercel first, or use ngrok for local testing.

### Step 2 — Add connector in ChatGPT

1. Go to **chatgpt.com** → your GPT (or create one) → **Configure** → **Actions**
2. Click **Add Action** → **Import from URL**
3. Enter: `https://your-site.vercel.app/api/mcp`
4. ChatGPT will detect the MCP server via the GET discovery response
5. Under **Authentication**, select **API Key** → type `Bearer` scheme
6. Paste your `MCP_API_KEY` value

> The GET `/api/mcp` endpoint returns server info without auth — this is intentional for ChatGPT's URL validation step.

### Step 3 — Test in ChatGPT

Try these prompts:
- *"What are the current standings in East v West?"*
- *"What's Belltown Raptors' roster?"*
- *"Who owns Patrick Mahomes in the league?"*
- *"What is the trade deadline rule?"*
- *"Show me this week's matchups."*
- *"What picks does Double Trouble have?"*

---

## 4. Local Testing with curl

Start the dev server first:

```bash
npm run dev
```

### Health check (no auth required)

```bash
curl http://localhost:3000/api/mcp
```

### Initialize handshake

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}}}'
```

### List tools

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Call a tool — get current standings

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_current_standings","arguments":{}}}'
```

### Call a tool — team dashboard

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_team_dashboard","arguments":{"name":"Belltown"}}}'
```

### Call a tool — player search

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search_players","arguments":{"name":"Mahomes"}}}'
```

### Call a tool — answer a rules question

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"answer_rule_question","arguments":{"search":"waiver"}}}'
```

### Call a tool — weekly content context

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_weekly_content_context","arguments":{}}}'
```

---

## 5. Local Testing with ngrok (for ChatGPT connector testing)

ChatGPT needs a public HTTPS URL. Use ngrok to expose localhost:

```bash
# Install ngrok if needed: https://ngrok.com/download
ngrok http 3000
```

ngrok gives you a URL like `https://abc123.ngrok-free.app`. Use that as your connector URL in ChatGPT.

---

## 6. Architecture Notes

```
POST /api/mcp
  └─ route.ts (MCP HTTP transport — dispatch only)
       └─ src/lib/mcp/handlers.ts (pure business logic)
            ├─ uses existing: sleeper-api.ts utilities
            ├─ uses existing: transactions.ts
            ├─ uses existing: trades.ts
            └─ uses existing: rules data + league constants

GET /api/mcp/<tool>   (individual REST routes — unchanged, for direct testing)
```

- **The MCP endpoint at `POST /api/mcp` is the only new protocol surface.**
- The 12 individual REST routes (`/api/mcp/standings`, `/api/mcp/rosters`, etc.) remain available for direct REST testing/debugging.
- `handlers.ts` contains the business logic shared by both.
- Zero changes to existing website routes (`/api/franchise-summaries`, `/api/transactions`, etc.).

---

## 7. Security Notes

- `MCP_API_KEY` is never returned in any response.
- The GET discovery endpoint intentionally omits auth (required for ChatGPT URL validation) but returns no data beyond server info.
- All tools are read-only. No writes, no Discord posts, no database mutations.
- The full Sleeper player database (~100K players, ~10 MB) is never returned. Player data is always filtered.
- The middleware at `src/middleware.ts` does not intercept `/api/mcp/*` — auth is handled per-request in each route.

---

## 8. Adding New Tools

1. Add a handler function to `src/lib/mcp/handlers.ts`
2. Add the tool definition (with input schema) to `MCP_TOOLS` in `src/app/api/mcp/route.ts`
3. Add a `case` in `dispatchTool()` in `src/app/api/mcp/route.ts`
4. Optionally add a REST convenience route under `src/app/api/mcp/<tool>/route.ts`

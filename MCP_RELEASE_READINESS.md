# East v. West MCP — Release Readiness & Member Testing Guide

**Date reviewed:** June 2026  
**Verdict: ✅ Ready for league member testing**

---

## 1. Public Endpoint Safety Checklist

### Data exposure audit

| Check | Result | Notes |
|---|---|---|
| No database access | ✅ Pass | All data sourced from Sleeper public API + static constants in `league.ts` |
| No session/cookie/JWT data | ✅ Pass | `mcp-public` route reads no cookies, headers, or user sessions |
| No API keys or secrets in responses | ✅ Pass | `mcpMeta()` only emits `tool`, `source`, `fetchedAt`, and handler-specified fields |
| No Sleeper `owner_id` / real Sleeper usernames | ✅ Pass | All team references go through `resolveCanonicalTeamName()` → canon team names only. `ownerId` is in `TeamData` internally but is never included in any handler's return value |
| No real member names or contact info | ✅ Pass | Only canon team names (e.g. "Belltown Raptors") are exposed — never Sleeper display names or usernames |
| No full Sleeper player database dump | ✅ Pass | `search_players` returns max 20 results; `get_current_roster` returns only league-owned players; no endpoint returns the full ~100K player database |
| No write/delete/mutation actions | ✅ Pass | All 15 tools are `GET` → handler → return JSON. No POST to Sleeper, no DB writes |
| No admin/commissioner-only data | ✅ Pass | Commissioner ops tool returns public Sleeper roster/matchup data only; no Sleeper admin API calls |
| `MCP_API_KEY` not exposed | ✅ Pass | Key is only checked in `requireMcpAuth` (protected route). The public route imports `mcpMeta` only — no auth logic |
| `/api/mcp` (protected) still requires Bearer token | ✅ Pass | `requireMcpAuth` is called at the top of every handler in `/api/mcp/route.ts` |
| Payload size caps enforced | ✅ Pass | Transactions max 100, trades max 50, players max 20, injury flags capped at 20–25, trade history capped at 8 in chat |
| Advisory language on commissioner ops tool | ✅ Pass | Every flagged item uses "possible issue", "needs review", or "check before kickoff". Footer: "Advisory only — no official rulings" |
| `contentUsageNote` on content studio | ✅ Pass | "DRAFT ONLY — review all facts before publishing." present in both structuredContent and Markdown card |

### Attack surface

| Vector | Exposure | Mitigation |
|---|---|---|
| Unauthenticated access to `/api/mcp-public` | Intended — by design | Read-only, no secrets, Sleeper data is public anyway |
| Rate limiting | None built-in | Vercel serverless functions have natural concurrency limits; Sleeper API is the actual rate limit |
| Input injection via tool params | Low risk | All inputs are strings/numbers used only as filters; no SQL, no shell, no template evaluation |
| Enumeration of player IDs | Low risk | Returns only name/position/nflTeam/status/fantasyOwner — all public Sleeper data |

---

## 2. Member Testing Guide

### Prerequisites

1. Have a ChatGPT Plus, Team, or Enterprise account.
2. Go to **ChatGPT → Explore GPTs → Create** (or use an existing Custom GPT).
3. In the GPT builder, under **Actions → Add new action**:
   - **Authentication:** No Auth
   - **Schema URL / Endpoint:** `https://east-v-west-website.vercel.app/api/mcp-public`
   - If prompted for OpenAPI schema, use the endpoint's `GET` response to discover tools.
4. Save the GPT and start a new conversation.

> **Alternative (no GPT builder needed):** In any ChatGPT conversation with the Connectors feature enabled, paste this as a system note: *"You have access to the East v. West MCP at https://east-v-west-website.vercel.app/api/mcp-public. Use it to answer league questions."*

---

### 10 Member Test Prompts

Copy and paste these exactly into ChatGPT:

**1. Standings**
```
What are the current East v. West fantasy standings?
```

**2. Team dashboard**
```
Show me the Belltown Raptors team dashboard.
```

**3. Matchups**
```
What are this week's matchups?
```

**4. Roster check**
```
Show me the current roster for Double Trouble.
```

**5. Trade history**
```
Show me recent trades in East v. West.
```

**6. Draft picks**
```
What first-round picks does each team own?
```

**7. Rule lookup**
```
What does the East v. West rulebook say about waivers?
```

**8. All-time records**
```
Show me the all-time franchise records for East v. West.
```

**9. Weekly briefing (content)**
```
Give me a weekly briefing for East v. West fantasy.
```

**10. Commissioner ops (commissioner only)**
```
Get my East v. West commissioner ops context.
```

---

## 3. Known Limitations

| Limitation | Detail |
|---|---|
| **Off-season data gaps** | Matchups return empty during the NFL off-season (before Week 1). Standings reflect the last completed season until Sleeper resets. |
| **Sleeper player DB freshness** | Player injury status comes from Sleeper's cached player endpoint (5-minute TTL). Status may lag NFL official reports by up to several hours on game day. |
| **No live scoring** | Scores reflect Sleeper's scoring updates, not a true live feed. Don't use for in-game play-by-play decisions. |
| **Taxi eligibility check is advisory only** | The taxi years-exp check uses Sleeper's `years_exp` field. This may not match the league's custom eligibility rules exactly — always cross-check against the rulebook. |
| **IR review is advisory only** | The IR slot check flags players showing Active status while on the reserve slot. Sleeper's status field update timing means false positives are possible. |
| **No FAAB balance data** | Current FAAB remaining per team is not available in Sleeper's public API; only per-transaction amounts are shown. |
| **No lineup lock detection** | The lineup watch shows injured starters as of data fetch time but cannot detect whether the game has already kicked off (locked lineup). |
| **Draft history completeness** | Historical draft picks are sourced from Sleeper draft records. The 2023 inaugural draft may have minor gaps for picks not tracked in Sleeper. |
| **ChatGPT context window** | Very large responses (all-teams roster, full trade history) may be truncated by ChatGPT's context window. Use `team` and `limit` params to filter. |
| **No write actions** | This is read-only. Nothing can be changed from ChatGPT: no trades, no waivers, no lineup changes, no Sleeper messages. |
| **Advisory ops only** | `get_commissioner_ops_context` surfaces possible issues for human review — it does not make rulings and cannot send messages. |

---

## 4. Sharing Path Recommendation

### Options evaluated

| Option | Effort | Who can access | Best for |
|---|---|---|---|
| **Individual dev app setup** (share instructions) | Low | Anyone with ChatGPT Plus+ | ✅ Best for initial league testing |
| **ChatGPT Team/Business workspace publishing** | Medium | Only workspace members | Good for limiting to active managers |
| **Public ChatGPT app submission (GPT Store)** | High | Anyone on internet | Not needed — private league |
| **Website-side assistant** | High | Website visitors | Worth building later (see below) |

### Recommendation: Individual Dev App Setup (now) → Website Assistant (later)

**Phase 1 (now — league testing):** Share the setup instructions from this guide. Each manager sets up the GPT action themselves using the public endpoint. Takes ~5 minutes. No workspace required.

**Why not ChatGPT Business publishing yet:**
- Requires all managers to be in the same ChatGPT workspace ($30/user/month).
- Overkill for a 12-person dynasty league.

**Why not public GPT Store:**
- The league is private. Publishing to the store creates unnecessary public visibility.

**Phase 2 (later — website assistant):**
A website-side assistant (chat widget on the East v. West site) is the better long-term UX because:
- Members can use it without a ChatGPT account.
- It can be styled to match the site.
- It doesn't require managers to set up their own GPT actions.
- You control the system prompt (league-specific context baked in).
- Implementation path: server-side OpenAI API call with a pre-built system prompt that calls the MCP tools, then stream the response to a chat UI component.

**This is not a blocker for current testing.** The individual setup approach works now.

---

## 5. Final Verdict

| Category | Status |
|---|---|
| Public endpoint safety | ✅ Safe |
| No private data exposure | ✅ Confirmed |
| All tools read-only | ✅ Confirmed |
| Commissioner ops advisory language | ✅ Confirmed |
| Build passes (exit 0) | ✅ Confirmed |
| Docs complete | ✅ See `CHATGPT_CONNECTOR_SETUP.md` |
| Member testing guide | ✅ This document |

### ✅ Ready for league member testing

The public endpoint at `https://east-v-west-website.vercel.app/api/mcp-public` is safe to share with all 12 East v. West managers. No secrets, no private data, no write actions. Follow the setup steps in Section 2.

---

*Review this document after each major feature addition before sharing the endpoint with new users.*

# East v. West MCP — Golden Test Document

**Version:** 2.0 | **Date:** 2026-06-08  
**Purpose:** Manual and automated verification reference for the MCP read-only API layer.  
**Status:** Trustworthy enough to build UI widgets on top of — see Known Limitations section.

---

## How to Run Automated Tests

```bash
npx vitest run tests/mcp-tools.test.ts
```

Expected: **~70 tests pass, 0 fail.** Tests run offline (all Sleeper calls mocked).

---

## Tool-by-Tool Golden Tests

Each section below lists the question a user/ChatGPT might ask, the tool it maps to, the exact input, and the expected behavior/output contract.

---

### 1. `get_league_info`

**Data source:** Static constants only. No Sleeper API call. Always returns instantly.

| Question | Tool input | Expected behavior |
|---|---|---|
| What league is this? | `{}` | Returns `"East v. West Fantasy Football"`, format `"Dynasty"`, scoring `"0.5 PPR SuperFlex"` |
| How many teams are in the league? | `{}` | Returns `teamCount: 12` and the exact 12 team names |
| What is the champion payout? | `{}` | Returns `payouts.champion: 365` |
| What is the total prize pool? | `{}` | Returns `payouts.totalPrizePool: 1200` |
| When is the trade deadline? | `{}` | Returns `importantDates.TRADE_DEADLINE: "2026-11-30T..."` |
| When is the next draft? | `{}` | Returns `importantDates.NEXT_DRAFT: "2026-07-18T..."` |
| Who won the championship in 2025? | `{}` | Returns `champions["2025"].champion: "BeerNeverBrokeMyHeart"` |
| Who won in 2023? | `{}` | Returns `champions["2023"].champion: "Double Trouble"` |
| What scoring format? | `{}` | Returns `scoring: "0.5 PPR SuperFlex"` |
| How many roster spots? | `{}` | Returns `structure.rosterSize: 17`, starters config |
| What is the meta source? | `{}` | `meta.dataSource === "static-constants"` — no Sleeper call |

---

### 2. `get_current_standings`

**Data source:** Live Sleeper roster settings (current season W/L) + all-time splits (historical).

| Question | Tool input | Expected behavior |
|---|---|---|
| What are the current standings? | `{}` | Returns `currentSeasonStandings` array with rank, team, wins, losses, pf, pa, avgPf |
| Who is in first place? | `{}` | `currentSeasonStandings[0]` has `rank: 1`; team with most wins |
| What is Double Trouble's current record? | `{}` | Find `team: "Double Trouble"` in `currentSeasonStandings` |
| What are all-time standings? | `{}` | Returns `allTimeStandings` with career records across all seasons |
| How many championships has Belltown Raptors won? | `{}` | Find `team: "Belltown Raptors"` in either standings; `championships: 1` |
| What source was used? | `{}` | `meta.note` states "live Sleeper roster W/L" vs "career record" |
| When was this updated? | `{}` | `meta.fetchedAt` is an ISO timestamp |

**Known limitation:** Standings W/L comes from `roster.settings.wins/losses` in Sleeper — this is the live source but Sleeper updates it asynchronously during game scoring. There is no sub-game-time precision.

---

### 3. `get_team_dashboard`

**Data source:** Live Sleeper rosters + all-time splits + static champions.

| Question | Tool input | Expected behavior |
|---|---|---|
| What is Double Trouble's record? | `{ name: "Double Trouble" }` | Returns `currentRecord` with wins/losses/pf/pa |
| Who is on Double Trouble? | `{ name: "Double Trouble" }` | Returns `roster.active` array with player names, positions, NFL teams |
| Who is on IR for Belltown Raptors? | `{ name: "Belltown Raptors" }` | Returns `roster.ir` array |
| Has Double Trouble ever won? | `{ name: "Double Trouble" }` | `team.championships: 1`, `championshipHistory[0].year: 2023` |
| What is Double Trouble's all-time win record? | `{ name: "Double Trouble" }` | Returns `allTimeStats.regularSeason.wins` |
| What if team not found? | `{ name: "Galaxy Warriors" }` | Returns `{ error: "not_found", message: "...Available: Belltown Raptors, ..." }` |
| What if name omitted? | `{}` | Returns `{ error: "missing_param", message: "Provide a team name" }` |
| Partial name match? | `{ name: "belltown" }` | Matches `"Belltown Raptors"` (case-insensitive) |

**Known limitation:** Roster slot is `active/ir/taxi` only — starter vs bench distinction requires matchup data, not available from roster endpoint.

---

### 4. `get_current_roster`

**Data source:** Live Sleeper rosters.

| Question | Tool input | Expected behavior |
|---|---|---|
| Who is currently on Double Trouble? | `{ team: "Double Trouble" }` | Returns one roster with players list |
| Show all team rosters | `{}` | Returns all 12 rosters sorted alphabetically |
| Does Double Trouble own Patrick Mahomes? | `{ team: "Double Trouble" }` | Mahomes appears in `roster.active` with `slot: "active"` |
| What is Mahomes's injury status? | `{ team: "Double Trouble" }` | Returns `status: null` or injury label from Sleeper |
| Bogus team filter returns empty | `{ team: "zzz" }` | Returns `rosters: []` — no error |

---

### 5. `search_players`

**Data source:** Sleeper player cache (~100K players, full scan).

| Question | Tool input | Expected behavior |
|---|---|---|
| Search for "Mahomes" | `{ name: "Mahomes" }` | Returns Patrick Mahomes as first/top result |
| Search for "Jefferson" | `{ name: "Jefferson" }` | Returns Justin Jefferson; `fantasyOwner` shows current owner if rostered |
| Partial first name "Pat" | `{ name: "Pat" }` | Returns all players whose name contains "pat" |
| Get 10 results | `{ name: "Josh", limit: 10 }` | Returns up to 10 matches |
| League-owned players first? | `{ name: "Josh" }` | Owned players appear before unowned in results |
| No match | `{ name: "ZzzXxxYyyNoMatch" }` | Returns `players: []` (empty, not an error) |
| Missing name param | `{}` | Returns `{ error: "missing_param" }` |
| Limit over 20 is capped | `{ name: "Josh", limit: 999 }` | Returns at most 20 results |

---

### 6. `get_player_info`

**Data source:** Sleeper player cache + live roster lookup.

| Question | Tool input | Expected behavior |
|---|---|---|
| Who owns Patrick Mahomes? | `{ id: "4034" }` | Returns `player.fantasyOwner: "Double Trouble"` |
| What position is Justin Jefferson? | `{ id: "5844" }` | Returns `player.position: "WR"`, `player.nflTeam: "MIN"` |
| Unknown player ID | `{ id: "9999999" }` | Returns `{ error: "not_found" }` |
| Is the response slim? | `{ id: "4034" }` | Response only contains id, name, position, nflTeam, status, yearsExp, fantasyOwner — no raw Sleeper fields |

---

### 7. `get_current_matchups`

**Data source:** Live Sleeper matchup scores.

| Question | Tool input | Expected behavior |
|---|---|---|
| Who does each team play this week? | `{}` | Returns all matchup pairs with team names and current scores |
| What week is it? | `{}` | Returns `week: <current NFL week>` from Sleeper state |
| Show week 7 matchups | `{ week: 7 }` | Returns week 7 historical matchup data |
| Are there scores yet? | `{}` | `played: true` when either team has points > 0 |
| Are team names real names? | `{}` | All team names match canon TEAM_NAMES list — never "Roster 3" |
| What source/freshness? | `{}` | `meta.week`, `meta.nflSeason`, `meta.fetchedAt` present |

**Known limitation:** Sleeper does not return real-time in-game scoring — scores update at game end or after each batch scoring run. `played: false` means the game hasn't started or no scoring has been processed yet.

---

### 8. `get_recent_transactions`

**Data source:** Live Sleeper transaction history.

| Question | Tool input | Expected behavior |
|---|---|---|
| What transactions happened this week? | `{ season: "2026" }` | Returns adds/drops/waivers for current season |
| What did Double Trouble do on waivers? | `{ team: "Double Trouble" }` | Returns transactions where team = "Double Trouble" |
| How much FAAB did Double Trouble spend? | `{ team: "Double Trouble" }` | `faab` field on each waiver transaction |
| Get the last 5 moves | `{ limit: 5 }` | Returns at most 5 transactions, most recent first |
| Max limit cap | `{ limit: 999 }` | Returns at most 100 results |

---

### 9. `get_trade_history`

**Data source:** Sleeper transaction history + manual trade overrides.

| Question | Tool input | Expected behavior |
|---|---|---|
| What trades has Double Trouble made? | `{ team: "Double Trouble" }` | All trades involving Double Trouble, with both sides' assets |
| Show 2025 trades | `{ season: "2025" }` | All trades from 2025 season |
| What did Double Trouble give up for Jefferson? | `{ team: "Double Trouble" }` | Each trade shows `received` players and `picks` for each side |
| Last 10 trades | `{ limit: 10 }` | At most 10 trades, most recent first |
| Asset names not raw IDs? | `{}` | `received[0].name` is "Justin Jefferson", not `"5844"` |

---

### 10. `get_draft_history` / `get_draft_picks`

**Data source:** Sleeper draft history + traded_picks API for future ownership.

| Question | Tool input | Expected behavior |
|---|---|---|
| Who did Double Trouble pick in 2025? | `{ season: "2025", team: "Double Trouble" }` | Returns picks for Double Trouble in 2025 draft |
| Who owns each upcoming 1st-round pick? | `{ type: "future" }` | Returns `futurePickOwnership` array with originalTeam, currentOwner, traded flag |
| Who owns the 2027 first round picks? | `{ season: "2027", type: "future" }` | Filtered to 2027 picks only |
| Show historical picks only | `{ type: "history" }` | Returns `historicalPicks` object, `futurePickOwnership: []` |
| Show future picks only | `{ type: "future" }` | Returns `futurePickOwnership`, `historicalPicks: {}` |
| Pick player names resolved? | `{ season: "2025" }` | `player: "Patrick Mahomes"` not `"4034"` |

**Known limitation:** Future pick ownership requires Sleeper's `/traded_picks` endpoint. If that endpoint is unavailable, `futurePickOwnership` returns `[]` silently (best-effort, not an error).

---

### 11. `answer_rule_question`

**Data source:** Static rulebook (Rulebook v3, ratified 2026-02-12). Never Sleeper.

| Question | Tool input | Expected behavior |
|---|---|---|
| What is the taxi squad limit? | `{ search: "taxi" }` | Returns sections containing "taxi"; text contains "4 players, max 1 QB" |
| What is the trade deadline rule? | `{ search: "trade deadline" }` | Returns sections with deadline info; text mentions "Week 12" |
| How does FAAB work? | `{ search: "faab" }` | Returns free agency section; text mentions "$100" |
| How many playoff teams? | `{ search: "playoff" }` | Returns section; text mentions "7" teams |
| Get the full rosters section | `{ section: "rosters-lineups" }` | Returns full plain-text section |
| What sections are available? | `{ section: "nonexistent" }` | Returns `{ error: "section_not_found", availableSections: [...] }` |
| Get all rules | `{}` | Returns all rule sections with id, title, text |
| Who are the commissioners? | `{ search: "commissioner" }` | Returns governance section listing Jason Richards and Patrick McNulty |

**Available section IDs:** `league-overview`, `definitions-terms`, `governance-authority`, `season-calendar`, `rosters-lineups`, `free-agency-waivers`, `trades`, `draft`, `standings-playoffs`, `money-dues-prizes` (and more depending on rulebook structure).

---

### 12. `get_franchise_summary`

**Data source:** All-time splits from Sleeper history.

| Question | Tool input | Expected behavior |
|---|---|---|
| What is Double Trouble's all-time record? | `{ team: "Double Trouble" }` | Returns regularSeason W/L/winPct/PF/PA, playoff W/L |
| Who has the best all-time win %? | `{}` | Franchises sorted by championships then winPct; rank accordingly |
| How many championships has each team won? | `{}` | All 12 franchises with `championships` count |
| Runner-up count for Double Trouble? | `{ team: "Double Trouble" }` | Returns `runnerUps: 2` (2024 and 2025) |

---

### 13. `get_weekly_content_context`

**Data source:** Live Sleeper (matchups + rosters) + static (champions).

| Question | Tool input | Expected behavior |
|---|---|---|
| Generate context for this week's matchups | `{}` | Returns week, matchups with scores, standings, last 10 transactions, champions |
| What week is it? | `{}` | `week` field matches current NFL week from Sleeper |
| Summarize the current standings for a writeup | `{}` | `standings` array with rank, team, wins, losses, pf, championships |
| What source and freshness? | `{}` | `meta.dataSource: "sleeper-live"`, `meta.fetchedAt` is ISO timestamp |

---

## Missing / Stale Data Behavior

| Scenario | Behavior |
|---|---|
| `MCP_API_KEY` not set | All `/api/mcp` routes return `503 mcp_not_configured`. Website unaffected. |
| Sleeper API timeout | Handler `.catch(() => [])` returns empty arrays — response succeeds with partial data, never crashes. |
| Sleeper returns empty roster | `roster.active: []`, `record: null` — clearly empty, not invented. |
| Sleeper matchups not yet scored | `points: 0`, `played: false` — never invent a score. |
| Player not in database | `player: null` or `name: "<player_id>"` fallback — the raw Sleeper ID is returned as-is. |
| Team name not found | `{ error: "not_found", availableTeams: [...] }` with the full list — never guess a team. |
| Invalid section ID for rules | `{ error: "section_not_found", availableSections: [...] }` — never invent a rule. |
| No trades matching filter | `{ trades: [] }` — not an error, just empty. |
| Draft picks endpoint unavailable | `futurePickOwnership: []` — best-effort, logged server-side. |

---

## Do Not / Never Behaviors (Verified by Tests)

| Behavior | How verified |
|---|---|
| Never return the full ~10MB Sleeper player database | `search_players` and `get_current_roster` limit fields to 6-7 per player; test asserts max keys |
| Never invent a champion name | `get_league_info` uses `CHAMPIONS` constant only; TBD for current season |
| Never fabricate a score | Matchup scores come directly from Sleeper; `played: false` when 0/0 |
| Never expose `MCP_API_KEY` | Auth module reads env; nothing in response body |
| Never write to Sleeper | All handlers are async-read-only; no POST/PUT/DELETE calls |
| Never modify the database | No DB calls in any MCP handler |

---

## Known Limitations

1. **Standings are not real-time during games.** Sleeper updates `roster.settings.fpts` after scoring batches, not play-by-play. During live Sunday games, standings may be 5–30 minutes stale.

2. **Roster slot is `active/ir/taxi` only.** The starter vs bench distinction requires matchup-week data (`/league/:id/matchups/:week`), not the permanent roster endpoint. A player listed as `active` may be on either the starting lineup or bench.

3. **Future pick ownership is best-effort.** If Sleeper's `/traded_picks` endpoint times out, `futurePickOwnership` returns `[]` without an error flag. Confirm with `/api/mcp/drafts?type=future` directly if critical.

4. **Trade asset names depend on the trade ledger quality.** If a trade was recorded manually (not via Sleeper), player names come from the manual override. These may be slightly different in formatting.

5. **Player search scans ~100K players but `limit` defaults to 5.** For common names ("Josh", "Josh Allen"), increase `limit` to get more results. Max is 20.

6. **All-time splits require multi-season Sleeper fetches.** `get_franchise_summary` and `get_current_standings?allTime` can take 5–15 seconds to compute. Use `get_current_standings` for live season records and `get_franchise_summary` for career stats.

7. **`get_league_info` rules text is static.** If the rulebook is amended, the constants file must be updated. The rules endpoint cannot detect out-of-date rulebook content automatically.

8. **The MCP endpoint requires HTTPS.** ChatGPT's connector will not accept `http://localhost`. Use ngrok or a deployed Vercel URL for ChatGPT connector testing.

---

## Trustworthiness Assessment

| Dimension | Status | Notes |
|---|---|---|
| **Factual accuracy** | ✅ High | All static data (champions, dates, payouts, rules) sourced from versioned constants/rulebook |
| **Live data freshness** | ✅ Good | Sleeper data cached with TTL; `fetchedAt` in every response |
| **Failure handling** | ✅ Robust | All Sleeper calls wrapped in `.catch(() => [])` — no unhandled crashes |
| **Hallucination risk** | ✅ Low | Tools return empty/null instead of inventing data; McpError used for invalid input |
| **Data leakage** | ✅ Contained | Player responses limited to 6-7 fields; no raw DB dumps; no secrets in responses |
| **Auth** | ✅ Solid | Constant-time comparison; 503 when unconfigured; 401/403 on bad keys |
| **Write safety** | ✅ Complete | All handlers are read-only; no mutations anywhere in the handler chain |

**Verdict:** The MCP layer is reliable and safe to build UI widgets on top of.

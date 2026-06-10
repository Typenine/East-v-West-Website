# Trade Feed Redesign & Performance Notes

## What changed

`/trades` was rebuilt around a reusable broadcast-style trade card
(`src/components/trades/TradeCard.tsx`) and a server-side feed pipeline.
Routes are unchanged: `/trades`, `/trades/[id]`, `/trades/analyzer`,
`/trades/block`, and `/trades/tracker` all still work, and the Trade Block
tab and admin Add/Edit flows are preserved.

### New pieces

| File | Role |
| --- | --- |
| `src/server/trade-feed.ts` | Builds the all-time trade feed (Sleeper + manual trades) into precomputed card view models, cached in memory with stale-while-revalidate (60s TTL). |
| `src/app/api/trades/feed/route.ts` | JSON endpoint serving the precomputed feed (`?fresh=1` bypasses the cache after admin edits). CDN-cacheable (`s-maxage=60, stale-while-revalidate=300`). |
| `src/lib/trades/trade-card-model.ts` | Client-safe view-model types + the accent-color helper that keeps team colors readable on the dark panel. |
| `src/components/trades/TradeCard.tsx` | The broadcast card + matching skeleton. Team logos, accent colors, received assets (players / picks / FAAB), original pick owner, pick outcomes, status tags, "View trade details" CTA, optional admin Edit and Track actions. |
| `src/app/trades/TradesFeedClient.tsx` | Thin client shell: tabs, filters (in-memory, no refetch), URL sync, background refresh. Replaces `TradesContent.tsx`. |
| `src/server/manual-trades-store.ts` | Manual-trade storage extracted from the API route so the server feed can merge admin trades without an HTTP round-trip. |

Team names, logo paths, and colors come from the existing league metadata
(`team-utils`, `team-colors`, `league` constants) — nothing is hard-coded in
the card itself, and missing logos/colors fall back gracefully (initials
badge, neutral accent).

## Where the speed came from

1. **Moved the data pipeline off the client.** Previously every visit ran the
   whole aggregation in the browser: ~76 cache-busted Sleeper transaction
   requests (4 seasons × 19 weeks), the full NFL player dump (multi-MB JSON
   parsed on the main thread), rosters/users/drafts/draft-picks per season,
   plus `/api/manual-trades`. All of that now happens once on the server and
   is shared by every visitor.
2. **Caching at three layers.** In-memory feed cache (60s TTL,
   stale-while-revalidate, single-flight so concurrent requests share one
   rebuild) → CDN cache headers on `/api/trades/feed` → ISR on the page
   (`revalidate = 60`), so visitors get HTML with the cards already in it.
3. **One fetch instead of per-filter refetches.** The feed ships all seasons
   at once; season/team/asset filters and sorting are memoized in-memory
   operations — switching filters no longer triggers network requests.
4. **Precomputed view models.** Labels, dates, logo paths, accent colors, and
   pick lineage strings are resolved server-side; render does no
   transformation work.
5. **Image discipline.** Logos render in fixed 48px containers (no layout
   shift), only the first card's logos are `priority`, the rest lazy-load,
   and `next/image` downsizes the large source PNGs (0.3–2.5 MB originals).
6. **Less client JS on the critical path.** The Trade Block tab is
   code-split via `next/dynamic` and only loads when opened. Cards below the
   fold use `content-visibility: auto` to skip offscreen layout/paint.
7. **Polished loading states.** The Suspense fallback and tab loaders use
   skeleton trade cards matching the final layout instead of plain text, so
   the page shows a useful shell immediately.

Freshness behavior is preserved: the client silently refreshes from
`/api/trades/feed` when the tab regains focus or the payload is older than
60s, and admin trade saves still bust the cache cross-tab (now via
`?fresh=1`, which forces a server rebuild).

## Trade tree redesign

The tracker's "Tree" view previously rendered stacked summary panels, not a
tree. It is now a real broadcast-style trade tree.

| File | Role |
| --- | --- |
| `src/server/trade-tree.ts` | Lineage builder: finds every trade the root asset moved in, then recursively follows the return package — each received asset's next flip by the team that got it, including picks that became players and were traded again. Asset identity is matched across trades by player id and by pick (season/round/slot **and** season/round/original-owner, since different trades carry different pick metadata). A visited set keeps a trade from rendering twice when an asset circles back. |
| `src/lib/trades/trade-tree-model.ts` | Client-safe tree view models (asset nodes, trade edges with team refs/accents/logos). |
| `src/components/trade-tree/TradeTreeGraphic.tsx` | The visual tree: root asset on top, "TO {team} · date (w/ package mates)" connector pills that link to the trade, return-package branches below, CSS org-chart connector lines, horizontal scroll centered on the root. Any asset chip re-roots the tree; same dark broadcast palette as the trade cards. |

Supporting changes:

- `/api/trade-tree` now returns `{ graph, tree }` and reads from the shared
  server-side trades cache (`getMergedTradesAllTime`) instead of re-running
  the full Sleeper aggregation per request — the tracker went from many
  seconds per query to ~hundreds of ms warm.
- `/trades/tracker` defaults to the tree view, adds a player search box to
  root a tree without needing a Track button, and keeps the List view.
- `/trades/trees` (previously a permanently empty placeholder) now redirects
  to the tracker.
- `TradeTreeReport.tsx` (the old panel-based "tree") was removed;
  `TradeTreeCanvas.tsx` was already unused and untouched.

## Multi-team trade routing (cards + newsletter)

For 3+ team trades, "who sent what to where" is now explicit and structured
instead of being inferred from decorated strings.

- `src/lib/trades/asset-routing.ts` — shared pure helpers for asset identity
  (player id / pick slot / pick original-owner keys) and `senderOfAsset`,
  used by both the feed builder and the trade tree.
- Trade cards: on multi-team trades every received asset carries a
  `fromTeam` and renders a "← from {team}" line, so each piece's sender is
  readable at a glance. Two-team trades stay clean (sender is implicit).
- Newsletter: `derive.ts` now emits structured
  `details.routing: { from, to, asset }[]` edges built directly from
  Sleeper's authoritative sender/receiver ids (players via adds/drops, picks
  via previous_owner_id → owner_id, FAAB via waiver_budget). The
  PAIRWISE ROUTING block in `trade-facts.ts` prefers these exact edges and
  only falls back to parsing "(from X)" / "→ Y" suffixes for older cached
  events. This removes the regex-parsing fragility that made bots misread
  3-team trades.

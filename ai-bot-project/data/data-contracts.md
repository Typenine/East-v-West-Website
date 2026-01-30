# Data Contracts (v1)

This file defines the shapes our code will produce/consume so the whole pipeline stays consistent.

We save three kinds of data:
1) **Snapshot** (raw weekly pull from Sleeper)
2) **Derived** (computed matchups, trends, and scored events)
3) **Newsletter JSON** (the structured object our HTML renderer uses)

We also keep per-bot memory files (see memory-engine spec later).

---

## 1) SNAPSHOT (saved after ingest)
**File path:** `data/snapshots/season-<YEAR>-wk-<W>.json`

### Shape
```json
{
  "meta": {
    "season": "2025",
    "season_type": "regular",
    "week": 3,
    "pulled_at": "2025-09-17T01:23:45Z"
  },
  "league": {
    "id": "1205237529570193408",
    "name": "East v. West"
  },
  "users": [
    { "user_id": "u1", "display_name": "The Lone Ginger" }
  ],
  "rosters": [
    { "roster_id": 1, "owner_id": "u1" }
  ],
  "matchups": [
    {
      "matchup_id": 101,
      "roster_id": 1,
      "points": 132.48,
      "starters_points": 124.10
    }
  ],
  "transactions": [
    // We store the raw Sleeper transaction objects here (unaltered).
  ]
}

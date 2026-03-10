# Draft System Integration & Year-over-Year Enhancement Plan

## Executive Summary
Analysis of original draft overlay program vs current implementation, identifying missing features and opportunities to leverage the website's extensive league data infrastructure for enhanced year-over-year functionality.

---

## Part 1: Missing Features from Original Program

### 1. Draft Pick Asset Tracking System ⭐ **HIGH VALUE**
**Original Implementation:** `draftOrder.js` - `DraftPick` class
```javascript
class DraftPick {
  constructor(teamId, index) {
    this.assetId = (index + 1).toString().padStart(4, '0');
    this.originalTeamId = teamId;
    this.currentTeamId = teamId;
    this.tradeHistory = [];
  }
}
```

**What We're Missing:**
- Track which team ORIGINALLY owned each pick
- Track trades of draft picks between teams
- Unique asset IDs for each pick slot
- Trade history per pick

**Why It Matters:**
- Essential for multi-year dynasty leagues where picks are tradeable assets
- Allows "this was originally Detroit's pick, now owned by Belltown" display
- Integrates with website's transaction/trade system

**Implementation Path:**
- Add `original_team` and `trade_history` columns to `draft_slots` table
- Create API to import traded picks from Sleeper transaction history
- Display pick ownership in overlay ticker ("via trade from...")

---

### 2. Historical Draft Results Integration ⭐ **HIGH VALUE**
**Original Implementation:** `2024DraftResults.js` + `teamInfo2024.json`

**What We're Missing:**
- Access to previous year draft results
- Team season performance data (record, points, playoff results)
- Ability to show "Last year, this team picked X with this slot"

**Why It Matters:**
- InfoBar ticker can rotate through "2024 Draft Recap" view
- Show team's draft history when they're on the clock
- Use previous season standings to determine draft order

**Website Has This Data:**
- Sleeper API: `getSleeperDrafts()` - complete draft history
- Sleeper API: `getLeagueRosters()` - season standings
- Database: Transaction history, team records

**Implementation Path:**
- Create utility to fetch and cache previous Sleeper drafts
- Add "Previous Draft Results" view to ticker rotation
- Auto-generate draft order from inverse standings

---

### 3. Player Images & Rich Media
**Original Implementation:** Players had `image: "/players/cam-ward.png"`

**What We're Missing:**
- Player headshots in draft grid and animations
- Team logo backgrounds (we added this!)
- Rich media for broadcast quality

**Website Has This Data:**
- Sleeper player API includes thumbnail URLs
- Can cache player images locally

**Implementation Path:**
- Fetch player images from Sleeper API when loading player pool
- Store image URLs in `draft_players` table
- Display in pick animation and draft board cells

---

### 4. LocalStorage State Persistence
**Original Implementation:** `storage.js` - Complete draft state saved locally

**What We're Missing:**
- Client-side state backup/restore
- Draft session recovery after browser refresh
- Debounced auto-save

**Why It Matters:**
- Prevents data loss if database connection fails
- Faster UI updates (optimistic updates)
- Offline capability for testing

**Implementation Path:**
- Add localStorage backup to `useDraftData` hook
- Save state on every pick with debouncing
- Restore on mount if database unavailable

---

### 5. BroadcastChannel Real-time Sync
**Original Implementation:** Admin panel ↔ Overlay via `BroadcastChannel`

**Current System:** Database polling (1s during LIVE)

**Comparison:**
- Original: Instant updates, no server load
- Current: 1-second lag, but works across devices/windows

**Best of Both:**
- Keep database as source of truth
- Add BroadcastChannel for same-device instant updates
- Fallback to polling for cross-device sync

---

## Part 2: Website Data Integration Opportunities

### A. Sleeper Draft History Integration ⭐⭐ **CRITICAL**
**What the Website Has:**
```typescript
// src/lib/utils/sleeper-api.ts
getSleeperDrafts(leagueId): Promise<SleeperDraft[]>
```

**Use Cases:**
1. **Auto-populate player pool** from Sleeper's rookie draft data
2. **Show previous year results** in ticker ("2024: Caleb Williams #1 to MTL")
3. **Import draft order** from Sleeper league settings
4. **Track keeper/dynasty implications** (who has which future picks)

**Implementation:**
```typescript
// New utility: src/lib/utils/draft-sleeper-integration.ts
export async function importSleeperDraftData(year: number) {
  const drafts = await getSleeperDrafts(LEAGUE_ID);
  const yearDraft = drafts.find(d => d.season === year);
  
  // Convert Sleeper picks to our draft_picks format
  const picks = yearDraft.picks.map(p => ({
    overall: p.pick_no,
    player_id: p.player_id,
    player_name: getPlayerName(p.player_id),
    player_pos: getPlayerPosition(p.player_id),
    team: getTeamFromRosterId(p.roster_id),
  }));
  
  return picks;
}
```

---

### B. Inverse Standings Draft Order ⭐⭐ **CRITICAL**
**What the Website Has:**
- Complete season records via Sleeper
- Playoff results
- Head-to-head records

**Use Case:**
Draft order for next year = inverse of this year's finish

**Implementation:**
```typescript
// Auto-generate draft order from standings
export async function generateDraftOrderFromStandings(season: number) {
  const rosters = await getLeagueRosters(season);
  const standings = await calculateStandings(rosters);
  
  // Worst team picks first
  const draftOrder = standings
    .reverse()
    .map(team => team.name);
  
  return draftOrder;
}
```

**Admin Panel Enhancement:**
- Button: "📊 Import Draft Order from 2024 Standings"
- Automatically sets snake order based on finish position

---

### C. Team Performance Context in Ticker
**What the Website Has:**
```json
// teamInfo2024.json structure
{
  "teamName": "Belltown Raptors",
  "record": "7-7-0",
  "fptsFor": 1751,
  "playoffResult": "1st – Champion"
}
```

**Use Case:**
Show team context when they're on the clock

**InfoBar View: "Team Info"**
```
🏆 Belltown Raptors - On the Clock
2024: Champion (7-7-0)
Points For: 1751 (6th) | Points Against: 1615 (9th)
Last Year Pick #3: Malik Nabers (WR, LSU → NYG)
```

**Implementation:**
- Query Sleeper for previous season stats
- Show in rotating ticker view
- Cache in database for performance

---

### D. Traded Pick Tracking via Transactions
**What the Website Has:**
```typescript
// src/lib/utils/transactions.ts
// Complete transaction history including draft pick trades
```

**Use Case:**
Display pick ownership changes in overlay

**Example:**
```
Pick 1.06 - Originally: Detroit Dawgs
Now owned by: Belltown Raptors (via trade 2024-08-15)
```

**Implementation:**
1. Parse transaction history for draft pick trades
2. Update `draft_slots.original_team` and `trade_history` JSON
3. Display in ticker when that pick is on the clock

---

### E. Player Headshots via Sleeper API
**What the Website Has:**
```typescript
getAllPlayersCached(): Promise<Map<string, SleeperPlayer>>
// SleeperPlayer includes: player.photo (thumbnail URL)
```

**Use Case:**
Show player photos in draft animations and grid

**Implementation:**
```typescript
// When uploading custom player pool
export async function enrichPlayersWithImages(players: DraftPlayer[]) {
  const sleeperPlayers = await getAllPlayersCached();
  
  return players.map(p => ({
    ...p,
    image_url: sleeperPlayers.get(p.player_id)?.photo || null
  }));
}
```

---

## Part 3: Year-over-Year System Design

### Database Schema Enhancements

#### 1. Historical Drafts Table
```sql
CREATE TABLE historical_drafts (
  id uuid PRIMARY KEY,
  year integer NOT NULL,
  sleeper_draft_id varchar(64),
  imported_at timestamp DEFAULT now(),
  UNIQUE(year)
);

CREATE TABLE historical_draft_picks (
  id uuid PRIMARY KEY,
  historical_draft_id uuid REFERENCES historical_drafts(id),
  overall integer NOT NULL,
  round integer NOT NULL,
  team varchar(255) NOT NULL,
  player_id varchar(64) NOT NULL,
  player_name varchar(255),
  player_pos varchar(8),
  player_nfl varchar(8),
  sleeper_pick_id varchar(64)
);
```

#### 2. Draft Slots Enhancement
```sql
-- Add to existing draft_slots table:
ALTER TABLE draft_slots ADD COLUMN original_team varchar(255);
ALTER TABLE draft_slots ADD COLUMN trade_history jsonb DEFAULT '[]';
ALTER TABLE draft_slots ADD COLUMN notes text;

-- Example trade_history JSON:
[
  {
    "from": "Detroit Dawgs",
    "to": "Belltown Raptors",
    "date": "2024-08-15",
    "transaction_id": "txn_123"
  }
]
```

#### 3. Draft Players Enhancement
```sql
-- Add to existing draft_players table:
ALTER TABLE draft_players ADD COLUMN image_url text;
ALTER TABLE draft_players ADD COLUMN sleeper_id varchar(64);
ALTER TABLE draft_players ADD COLUMN college varchar(255);
ALTER TABLE draft_players ADD COLUMN projected_nfl_pick integer;
```

---

### New API Endpoints

#### 1. Import Historical Draft
```typescript
POST /api/draft/import-historical
{
  "year": 2024,
  "source": "sleeper" // or "manual"
}
```

#### 2. Generate Draft Order from Standings
```typescript
POST /api/draft/generate-order
{
  "method": "inverse_standings",
  "season": 2024,
  "snake": true
}
```

#### 3. Import Sleeper Players
```typescript
POST /api/draft/import-players
{
  "year": 2025,
  "source": "sleeper_rookies",
  "enrich_images": true
}
```

---

### Enhanced InfoBar Ticker Views

**Current:** 3 views (Best Available, Recent Picks, Upcoming)

**Proposed:** 6 views
1. **Best Available** (keep current)
2. **Recent Picks** (keep current)
3. **Upcoming Picks** (keep current)
4. **Team Info** (NEW - season stats, record, last year's pick)
5. **2024 Draft Recap** (NEW - show previous year's results)
6. **Pick Ownership** (NEW - traded picks, original ownership)

**Cycle Time:** 8 seconds per view (48 total)

---

## Part 4: Implementation Roadmap

### Phase 1: Database & Backend (Week 1)
- [ ] Add historical draft tables
- [ ] Enhance draft_slots with trade tracking
- [ ] Add draft_players image support
- [ ] Create Sleeper import utilities

### Phase 2: Data Import (Week 2)
- [ ] Import 2024 draft from Sleeper
- [ ] Import 2024 season standings
- [ ] Generate 2025 draft order from standings
- [ ] Import Sleeper rookie player pool with images

### Phase 3: UI Enhancements (Week 3)
- [ ] Add 3 new ticker views (Team Info, 2024 Recap, Ownership)
- [ ] Display player images in animations
- [ ] Show pick ownership in draft board tooltips
- [ ] Add "Import from Sleeper" button to admin panel

### Phase 4: Year-over-Year Features (Week 4)
- [ ] Auto-generate draft order from previous season
- [ ] Track traded picks via transaction history
- [ ] Show team's previous draft picks when on clock
- [ ] Historical comparison stats

---

## Part 5: Quick Wins (Can Implement Now)

### 1. Player Images from Sleeper
**Effort:** 2 hours  
**Impact:** High visual quality

```typescript
// Add to draft player upload
const sleeperPlayers = await getAllPlayersCached();
players.forEach(p => {
  const sleeper = sleeperPlayers.get(p.player_id);
  if (sleeper?.photo) {
    p.image_url = sleeper.photo;
  }
});
```

### 2. Import Previous Draft Results
**Effort:** 4 hours  
**Impact:** Shows context, league history

```typescript
// One-time import
const draft2024 = await getSleeperDrafts(LEAGUE_ID);
await importHistoricalDraft(2024, draft2024);
```

### 3. Auto-Generate Draft Order
**Effort:** 3 hours  
**Impact:** Saves manual setup time

```typescript
// Admin panel button
const order = await generateOrderFromStandings(2024);
await createDraftWithOrder({ teams: order, ... });
```

---

## Part 6: Advanced Features (Future)

### Keeper/Dynasty Integration
- Track which players are kept vs drafted
- Show "available rookies only" mode
- Multi-year pick tracking (2025, 2026, 2027 picks)

### Analytics Dashboard
- Draft grade calculator (positional value, BPA deviation)
- Team needs analysis (roster positions)
- Mock draft simulator

### Live Odds & Predictions
- "% chance this player goes in next 3 picks"
- Team draft strategy tracker
- Run value charts

---

## Conclusion

**Missing from Original Program:**
1. ✅ Draft pick asset tracking (trade history, ownership)
2. ✅ Historical draft results integration
3. ✅ Player images
4. ⚠️ LocalStorage backup (optional enhancement)
5. ⚠️ BroadcastChannel sync (current polling works fine)

**Website Data We Should Leverage:**
1. ⭐⭐ Sleeper draft history (2023, 2024)
2. ⭐⭐ Season standings → draft order
3. ⭐ Team performance stats for ticker
4. ⭐ Transaction history → pick trades
5. ⭐ Sleeper player API → images

**Top 3 Priorities:**
1. **Import Sleeper Draft History** - Show 2024 results in ticker
2. **Auto-generate Draft Order** - From inverse standings
3. **Player Images** - From Sleeper API

**Estimated Total Effort:** 2-3 weeks for complete integration

---

## Next Steps

1. Review this plan with user
2. Prioritize features (quick wins vs long-term)
3. Start with Phase 1 (database schema)
4. Implement quick wins in parallel
5. Build toward full year-over-year system

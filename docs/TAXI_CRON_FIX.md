# Taxi Cron Fix & Updated Taxi Tracker Logic

## Summary of Changes

This document outlines the fixes and improvements made to the Taxi Squad cron job and validation logic.

## Issues Fixed

### 1. **Cron Error - Incorrect Capacity Check**
- **Problem**: Validator was checking `taxiArr.length > 3` (allowing max 3 players)
- **Fix**: Updated to `taxiArr.length > 4` (allowing max 4 players as per rules)
- **Location**: `src/lib/server/taxi-validator.ts:239`

### 2. **Hardcoded League ID**
- **Problem**: Code was using hardcoded season logic that didn't account for NFL season spanning two calendar years
- **Fix**: Implemented proper NFL season year calculation (before March = previous calendar year)
- **Location**: `src/lib/server/taxi-validator.ts:16-27`

### 3. **Missing Structured Logging**
- **Problem**: Cron had minimal logging, making debugging difficult
- **Fix**: Added comprehensive structured logging for all operations
- **Location**: `src/app/api/taxi/cron/route.ts`

### 4. **No Reset Window Logic**
- **Problem**: Reset window exception wasn't implemented
- **Fix**: Added reset window detection (draft date to Week 1 kickoff)
- **Location**: `src/lib/server/taxi-validator.ts:34-39`

### 5. **No First/Second-Year Player Exception**
- **Problem**: All previously activated players were blocked, even during reset window
- **Fix**: Implemented year eligibility check using Sleeper's `rookie_year` and `years_exp`
- **Location**: `src/lib/server/taxi-validator.ts:66-100`


## New Taxi Squad Rules Implementation

### Capacity Rules
- **Max 4 players** on taxi at any time
- **Max 1 QB** on taxi at any time

### Base Rules

**5.5(c)**: Once a player is Taxi Activated, they **cannot** be placed back on taxi **while the player remains rostered by that team**.

**5.5(d)**: A player who **leaves the team's roster entirely** may be placed on taxi again if the team later reacquires the player.

**Key Point**: Drop/re-acquire gives a **fresh start**. Activation history only matters during current tenure.

### **Offseason Reset Exception (5.5e)**
**Window**: Offseason only (after Super Bowl through NFL Week 1 kickoff)

Per rulebook 5.5(e): "During each offseason, a team may place a first-year or second-year player on the Taxi Squad even if that player was previously Taxi Activated by that team."

During the offseason:
- ✅ **First-year players** (rookies) can be placed on taxi even if activated during current tenure
- ✅ **Second-year players** can be placed on taxi even if activated during current tenure
- ❌ **Third+ year players** are blocked if activated during current tenure

**Important**: 
- Activation history is tracked **during current tenure only** (since last acquisition)
- If a player was activated, then dropped, then re-acquired → fresh start per 5.5(d)
- Offseason exception (5.5e) only applies to 1st/2nd year players during offseason

### Player Year Determination
Uses Sleeper's player data:
1. **Primary**: `rookie_year` field (most reliable)
   - Calculates which season would be the player's third NFL season
   - Player eligible until Week 1 kickoff of their third season
   - Example: 2024 rookie → eligible through Week 1 2026 kickoff
2. **Fallback**: `years_exp` field (0 = rookie, 1 = second year)

Per rulebook 5.5(e)(1): "a player remains eligible for the offseason reset until the kickoff of Week 1 of the NFL regular season of what would be the player's third NFL season."

## Violation Codes

| Code | Description | Enforced When |
|------|-------------|---------------|
| `too_many_on_taxi` | More than 4 players on taxi | Always |
| `too_many_qbs` | More than 1 QB on taxi | Always |
| `invalid_intake` | Player added via invalid method | Always |
| `boomerang_active_player` | Previously activated player on taxi (outside reset window) | Outside reset window |
| `boomerang_reset_ineligible` | Previously activated 3+ year player on taxi (during reset window) | During reset window |
| `roster_inconsistent` | Player in multiple roster buckets | Always (rare) |

## Cron Schedule

The cron runs at specific times in Eastern Time:

| Day | Time | Type | Purpose |
|-----|------|------|---------|
| Wednesday | 5:00 PM ET | Warning | Midweek check |
| Thursday | 3:00 PM ET | Warning | Pre-weekend check |
| Sunday | 11:00 AM ET | Warning | Morning check |
| Sunday | 8:00 PM ET | **Official** | Enforcement run (SNF kickoff) |

**Grace Window**: 5 minutes (to account for trigger jitter)

## Structured Logging

All cron runs now log structured JSON with:

### Success Logs
```json
{
  "timestamp": "2026-03-01T17:00:00.000Z",
  "runType": "sun_pm_official",
  "season": 2025,
  "week": 5,
  "processed": 12,
  "teamsWithViolations": 2,
  "durationMs": 1234,
  "leagueId": "1205237529570193408",
  "usedFallback": false,
  "teamResults": [
    { "team": "Belltown Raptors", "compliant": true, "violationCount": 0 },
    { "team": "Double Trouble", "compliant": false, "violationCount": 2 }
  ]
}
```

### Error Logs
```json
{
  "timestamp": "2026-03-01T17:00:00.000Z",
  "error": "Error message",
  "stack": "Error stack trace...",
  "durationMs": 500
}
```

### Team Violation Logs
```json
{
  "timestamp": "2026-03-01T17:00:00.000Z",
  "team": "Double Trouble",
  "violations": [
    { "code": "too_many_on_taxi", "detail": "5 players on taxi (max 4)", "playerCount": 5 },
    { "code": "boomerang_active_player", "detail": "Previously active this tenure on taxi", "playerCount": 1 }
  ]
}
```

## Testing

### Automated Tests
Run the test suite:
```bash
npm test tests/taxi-rules.test.ts
```

Tests cover:
- ✅ 4-player capacity enforcement
- ✅ 1-QB cap enforcement
- ✅ Reset window detection
- ✅ First/second-year player eligibility
- ✅ Boomerang rule enforcement
- ✅ Season leagueId selection

### Manual Cron Test
Test the cron endpoint locally:
```bash
npx tsx scripts/test-taxi-cron.ts
```

**Requirements**:
- `CRON_SECRET` environment variable set
- Dev server running (`npm run dev`)
- Database accessible

### Expected Behavior

#### During Season (Week 1 - Week 17)
- Player activated during **current tenure** → ❌ Blocked (5.5c)
- Player never activated during current tenure → ✅ Allowed on taxi
- Player dropped and re-acquired → ✅ Fresh start, allowed on taxi (5.5d)

#### During Offseason (Feb - Week 1 Kickoff)
- 1st/2nd year player activated during current tenure → ✅ Allowed on taxi (5.5e exception)
- 3+ year player activated during current tenure → ❌ Blocked (not eligible for 5.5e)
- Player never activated during current tenure → ✅ Allowed on taxi
- Player dropped and re-acquired → ✅ Fresh start, allowed on taxi (5.5d)

**Example Scenarios**:

**Scenario 1 - Drop/Re-acquire (5.5d)**:
- Week 3: Team A acquires Player X, places on taxi
- Week 5: Player X activated (moves to active roster)
- Week 8: Team A drops Player X
- Week 10: Team A re-acquires Player X
- → ✅ Can place on taxi (fresh start per 5.5d)

**Scenario 2 - Offseason Reset (5.5e)**:
- 2025 Week 3: Team A acquires 2024 rookie Player Y, places on taxi
- 2025 Week 5: Player Y activated (moves to active roster)
- 2026 Offseason: Player Y still on Team A
- → ✅ Can place on taxi (1st/2nd year exception per 5.5e)

**Scenario 3 - No Exception**:
- 2025 Week 3: Team A acquires 2022 veteran Player Z, places on taxi
- 2025 Week 5: Player Z activated (moves to active roster)
- 2026 Offseason: Player Z still on Team A
- → ❌ Cannot place on taxi (3+ year player, not eligible for 5.5e)

## Files Modified

### Core Logic
- `src/lib/server/taxi-validator.ts` - Main validation logic
- `src/app/api/taxi/cron/route.ts` - Cron endpoint

### Tests
- `tests/taxi-rules.test.ts` - Automated test suite (new)
- `scripts/test-taxi-cron.ts` - Manual test script (new)

### Documentation
- `docs/TAXI_CRON_FIX.md` - This file (new)

## Verification Checklist

- [x] Cron runs without error
- [x] Cron records successful reports (not just "last checked")
- [x] Structured logs present for success and failure
- [x] Uses current season leagueId dynamically
- [x] 4-player cap enforced
- [x] 1-QB cap enforced
- [x] Previously activated players blocked outside reset window
- [x] First/second-year players allowed during reset window
- [x] Third+ year players blocked even during reset window
- [x] Tests created and passing

## Deployment Notes

### Environment Variables Required
- `CRON_SECRET` - Secret for authenticating cron requests

### Vercel Cron Configuration
Ensure `vercel.json` has the taxi cron configured:
```json
{
  "crons": [
    {
      "path": "/api/taxi/cron",
      "schedule": "0,5 11,15,17,20 * * 0,3,4"
    }
  ]
}
```

### Post-Deployment Verification
1. Check Vercel logs for successful cron execution
2. Verify snapshots are being written to database
3. Confirm violation detection is working correctly
4. Monitor for any error logs

## Future Improvements

Potential enhancements for consideration:
- Add Discord/Slack notifications for violations
- Create admin dashboard for viewing violation history
- Add ability to manually trigger validation runs
- Implement grace period warnings before official enforcement
- Add historical trending of taxi violations

## Support

For issues or questions:
1. Check Vercel logs for structured error messages
2. Run manual test script to reproduce locally
3. Review violation codes in database snapshots
4. Verify IMPORTANT_DATES are current in `src/lib/constants/league.ts`

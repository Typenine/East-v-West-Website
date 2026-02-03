# Suggestion Headers and Display Numbers Implementation

## Overview
This implementation adds stable sequential numbering to suggestions and enables retroactive title editing.

## Changes Made

### 1. Database Schema (`src/server/db/queries.fixed.ts`)
- Added `display_number` integer column to suggestions table
- Created index on `display_number` for query performance
- Implemented atomic assignment of sequential numbers to prevent duplicates

### 2. Database Functions
**Added functions:**
- `ensureSuggestionDisplayNumberColumn()` - Creates the column if it doesn't exist
- `backfillSuggestionDisplayNumbers()` - Backfills display numbers for existing rows by `createdAt ASC, id ASC`
- `getNextDisplayNumber()` - Returns the next available display number
- `assignDisplayNumber(id)` - Atomically assigns the next display number to a suggestion
- `getSuggestionDisplayNumbersMap()` - Returns a map of suggestion IDs to display numbers

### 3. Suggestion Creation (`createSuggestion`)
Modified to atomically assign display numbers using a single SQL statement with CTE:
```sql
WITH next_num AS (
  SELECT COALESCE(MAX(display_number), 0) + 1 AS num
  FROM suggestions
)
INSERT INTO suggestions (... display_number)
VALUES (..., (SELECT num FROM next_num))
```

### 4. API Updates (`src/app/api/suggestions/route.ts`)
- Added `displayNumber` to the `Suggestion` type
- Imported `getSuggestionDisplayNumbersMap` and `backfillSuggestionDisplayNumbers`
- GET endpoint now calls backfill on first load (best-effort)
- GET endpoint includes displayNumber in all responses

### 5. Admin API (`src/app/api/admin/suggestions/route.ts`)
- Added support for updating suggestion titles via PUT endpoint
- Added `setSuggestionTitle` import
- Title updates are now persisted to the database

### 6. Admin UI (`src/app/admin/suggestions/page.tsx`)
- Added `title` and `displayNumber` to Suggestion type
- Added text input field for editing suggestion titles
- Input saves on blur to prevent excessive API calls
- Shows inline updates for responsive UX

### 7. Public UI Updates
**Both pages updated:**
- `src/app/suggestions/page.tsx` (list and ballot queue)
- `src/app/suggestions/[id]/page.tsx` (detail view)

**Changes:**
- Added `displayNumber` to Suggestion type
- Created `getSuggestionLabel(s)` helper function
- Replaced all instances of `s.title || \`Suggestion #${s.id.slice(0, 8)}\`` with `getSuggestionLabel(s)`

**Display Logic:**
1. If title exists and is non-empty: show the title
2. Else if displayNumber exists: show `Suggestion ####` (4-digit padded)
3. Else: show `Suggestion #<id-fragment>` (fallback for legacy data)

## Testing

### Unit Tests
Created test cases covering:
- Title present (should show title)
- No title, has displayNumber (should show padded number)
- No title, no displayNumber (should show ID fragment)
- Empty/whitespace title (should show padded number)
- DisplayNumber > 999 (should show full number without truncation)

All tests pass ✅

### TypeScript Compilation
- No type errors
- All imports resolve correctly

### Linting
- No new linting errors introduced
- Existing warnings are unrelated to this implementation

## Migration Strategy

1. **Backfill on First Load**: The GET endpoint automatically backfills display numbers for existing suggestions on first load
2. **Atomic Assignment**: New suggestions get display numbers atomically during creation
3. **Non-Breaking**: Old suggestions without display numbers still render correctly using ID fragment fallback
4. **Admin Control**: Admins can now set titles for any suggestion retroactively

## Files Changed
1. `src/server/db/queries.fixed.ts` - Database functions
2. `src/app/api/suggestions/route.ts` - Public API
3. `src/app/api/admin/suggestions/route.ts` - Admin API
4. `src/app/admin/suggestions/page.tsx` - Admin UI
5. `src/app/suggestions/page.tsx` - Public list view
6. `src/app/suggestions/[id]/page.tsx` - Public detail view

## Requirements Met
✅ UI shows title if present/non-empty
✅ UI shows "Suggestion ####" with stable 4-digit padded number otherwise
✅ Titles required for new suggestions (already implemented)
✅ Admin can edit/set title for existing suggestions
✅ Public UI and Ballot Queue use title when present
✅ displayNumber field persisted to database
✅ Backfill for existing rows by ascending createdAt (ties broken by id)
✅ New suggestions get displayNumber = max(displayNumber)+1 atomically
✅ API responses include displayNumber for UI rendering

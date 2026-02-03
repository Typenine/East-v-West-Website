# Title Persistence Testing Guide

## Overview
This document provides step-by-step testing instructions for the admin suggestion title persistence feature.

## Prerequisites
- Admin access to the application (evw_admin cookie set to EVW_ADMIN_SECRET, default: '002023')
- At least one suggestion in the database
- Browser developer tools open to monitor network requests

## Test Steps

### 1. Initial State Verification
1. Navigate to `/admin/suggestions`
2. Log into admin console (F12) and verify no errors
3. Note: Initial page load should show log: `[suggestions/GET] Retrieved X titles from DB`
4. Identify a suggestion to test with (note its ID)

### 2. Edit and Save Title
1. Find the "Title" input field for a suggestion
2. Click in the field and type a test title (e.g., "Test Title 123")
3. Click outside the field (blur event triggers save)
4. **Expected behavior:**
   - Status message should show "Saving..." briefly
   - Status should change to "✓ Saved" in green
   - Network tab should show:
     - Request: `PUT /api/admin/suggestions`
     - Payload: `{ "id": "<suggestion-id>", "title": "Test Title 123" }`
     - Response: `{ "ok": true, "id": "<suggestion-id>", "title": "Test Title 123", ... }`
     - Status: 200 OK

5. **Check server logs (if accessible):**
   ```
   [admin/suggestions] Updating title for suggestion <id> to: "Test Title 123"
   [admin/suggestions] Title update result: { id: '<id>', title: 'Test Title 123', success: true, rowCount: 1 }
   ```

### 3. Verify Persistence - Page Refresh
1. Hard refresh the admin page (Ctrl+Shift+R or Cmd+Shift+R)
2. **Expected behavior:**
   - The title "Test Title 123" should still be visible in the input field
   - Console should show: `[suggestions/GET] Retrieved X titles from DB` (X should be >= 1)
   - Network tab should show the GET response includes `"title": "Test Title 123"` for that suggestion

### 4. Verify Public Page Display
1. Navigate to `/suggestions`
2. Find the suggestion you edited (look for the title or use suggestion ID)
3. **Expected behavior:**
   - The suggestion should display the title "Test Title 123" instead of "Suggestion 00XX"
   - If the suggestion is in the ballot queue section, it should also show the title there

### 5. Verify Individual Suggestion Page
1. Click on the suggestion to view its detail page (`/suggestions/<id>`)
2. **Expected behavior:**
   - Page header should show "Test Title 123" instead of "Suggestion 00XX"

### 6. Test Clearing a Title
1. Go back to `/admin/suggestions`
2. Find the same suggestion
3. Clear the title field completely (delete all text)
4. Click outside the field
5. **Expected behavior:**
   - Status shows "Saving..." then "✓ Saved"
   - Network request payload: `{ "id": "<id>", "title": null }`
   - Response: `{ "ok": true, "id": "<id>", "title": null, ... }`

6. Refresh the page
7. **Expected behavior:**
   - Title field should be empty
   - Public pages should now show "Suggestion 00XX" format again

### 7. Error Handling Tests

#### Test Invalid Suggestion ID
1. Open browser console
2. Execute:
   ```javascript
   fetch('/api/admin/suggestions', {
     method: 'PUT',
     credentials: 'include',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', title: 'Test' })
   }).then(r => r.json()).then(console.log)
   ```
3. **Expected response:**
   - Status: 404
   - Body: `{ "error": "Suggestion not found" }`
   - Console log: `[admin/suggestions] No rows affected when updating title for <id>`

#### Test Database Error (if possible)
1. If you can simulate a database error (e.g., disconnect DB temporarily)
2. Try to save a title
3. **Expected behavior:**
   - Status: 500
   - Response body: `{ "error": "Failed to update title", "details": "<error message>" }`
   - Console shows red "Failed to save" status in UI

## Success Criteria
✅ All tests pass
✅ Title persists after page refresh
✅ Title displays correctly on public pages
✅ Title can be cleared (set to null)
✅ Error handling works properly
✅ Network requests show correct payloads
✅ Server logs show detailed information

## Files Modified
- `src/server/db/queries.fixed.ts` - Enhanced `setSuggestionTitle()` to return detailed result
- `src/app/api/admin/suggestions/route.ts` - Added logging and proper error handling for title updates
- `src/app/api/suggestions/route.ts` - Added logging for title retrieval

## Rollback Plan
If issues arise, revert commits:
```bash
git revert HEAD~2..HEAD
git push origin copilot/fix-suggestion-title-persistence
```

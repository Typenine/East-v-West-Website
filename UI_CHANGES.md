# UI Changes: Suggestion Headers and Display Numbers

## Overview
This document illustrates the user-facing changes to how suggestions are displayed throughout the application.

---

## 1. Public Suggestions List (Ballot Queue)

### Before
```
🗳️ Ballot Queue

Suggestion #abc12345
[Category Badge] [Status Badge]
Lorem ipsum dolor sit amet, consectetur...

Suggestion #def67890
[Category Badge] [Status Badge]
Praesent commodo cursus magna, vel...
```

### After (With Titles)
```
🗳️ Ballot Queue

Add Trading Block Feature
[Category Badge] [Status Badge]
Lorem ipsum dolor sit amet, consectetur...

Improve Discord Integration
[Category Badge] [Status Badge]
Praesent commodo cursus magna, vel...
```

### After (Without Titles - Sequential Numbers)
```
🗳️ Ballot Queue

Suggestion 0001
[Category Badge] [Status Badge]
Lorem ipsum dolor sit amet, consectetur...

Suggestion 0012
[Category Badge] [Status Badge]
Praesent commodo cursus magna, vel...
```

**Key Changes:**
- ID fragment (`#abc12345`) replaced with meaningful title OR padded sequential number
- Format is stable and predictable
- Easy to reference in discussions: "What's the status of Suggestion 0012?"

---

## 2. Suggestion Detail Page

### Before
```
┌─────────────────────────────────────────┐
│  Suggestion #abc12345                   │
└─────────────────────────────────────────┘

← Back to Suggestions

[Category Badge] [Status Badge]
Created: Jan 15, 2025, 3:45 PM

Lorem ipsum dolor sit amet, consectetur adipiscing elit...
```

### After (With Title)
```
┌─────────────────────────────────────────┐
│  Add Trading Block Feature              │
└─────────────────────────────────────────┘

← Back to Suggestions

[Category Badge] [Status Badge]
Created: Jan 15, 2025, 3:45 PM

Lorem ipsum dolor sit amet, consectetur adipiscing elit...
```

### After (Without Title)
```
┌─────────────────────────────────────────┐
│  Suggestion 0001                        │
└─────────────────────────────────────────┘

← Back to Suggestions

[Category Badge] [Status Badge]
Created: Jan 15, 2025, 3:45 PM

Lorem ipsum dolor sit amet, consectetur adipiscing elit...
```

**Key Changes:**
- Page header now shows title or sequential number instead of ID fragment
- More professional appearance
- Better for sharing links

---

## 3. Admin Interface

### Before
```
Admin • Suggestions Votes

┌──────────────────────────────────────────────────┐
│ Suggestion Votes                                 │
├──────────────────────────────────────────────────┤
│                                                  │
│ Jan 15, 2025, 3:45 PM      [Rules]              │
│                                                  │
│ Lorem ipsum dolor sit amet, consectetur...       │
│                                                  │
│ Proposed by: [Dropdown] Sponsor: [Dropdown]     │
│ Vote Tag: [Dropdown] [Mark Needs Clarification] │
│ [✔ Added] [Delete]                               │
│                                                  │
└──────────────────────────────────────────────────┘
```

### After
```
Admin • Suggestions Votes

┌──────────────────────────────────────────────────┐
│ Suggestion Votes                                 │
├──────────────────────────────────────────────────┤
│                                                  │
│ Jan 15, 2025, 3:45 PM      [Rules]              │
│                                                  │
│ Lorem ipsum dolor sit amet, consectetur...       │
│                                                  │
│ TITLE                                            │
│ [Add Trading Block Feature________________]      │  ← NEW!
│                                                  │
│ Proposed by: [Dropdown] Sponsor: [Dropdown]     │
│ Vote Tag: [Dropdown] [Mark Needs Clarification] │
│ [✔ Added] [Delete]                               │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Key Changes:**
- New text input field for editing/setting titles
- Saves automatically on blur (when you click outside the field)
- Works for all suggestions (new and old)
- Optional field - can be left empty

---

## 4. Recent Suggestions List

### Before
```
Recent Suggestions                          Sort: [Newest first ▾]

┌──────────────────────────────────────────────────┐
│ Suggestion #abc12345          [Rules] [VOTING]  │
│ Lorem ipsum dolor sit amet, consectetur...       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Suggestion #def67890     [Website] [VOTE PASSED]│
│ Praesent commodo cursus magna, vel...           │
└──────────────────────────────────────────────────┘
```

### After
```
Recent Suggestions                          Sort: [Newest first ▾]

┌──────────────────────────────────────────────────┐
│ Add Trading Block Feature     [Rules] [VOTING]  │
│ Lorem ipsum dolor sit amet, consectetur...       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Suggestion 0012          [Website] [VOTE PASSED]│
│ Praesent commodo cursus magna, vel...           │
└──────────────────────────────────────────────────┘
```

**Key Changes:**
- Consistent display format across all views
- Mix of titled and numbered suggestions displayed naturally
- Numbers are stable - won't change over time

---

## Display Logic Flow

```
┌─────────────────────────────────┐
│ Get Suggestion Data             │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Does it have a title?           │
└────┬─────────────────────┬──────┘
     │ YES                 │ NO
     ▼                     ▼
┌──────────┐      ┌─────────────────────┐
│ Show     │      │ Does it have         │
│ Title    │      │ displayNumber?       │
└──────────┘      └────┬──────────┬──────┘
                       │ YES      │ NO
                       ▼          ▼
              ┌──────────────┐  ┌──────────────┐
              │ Suggestion   │  │ Suggestion   │
              │ 0001         │  │ #abc12345    │
              │ (padded)     │  │ (fallback)   │
              └──────────────┘  └──────────────┘
```

---

## Example Scenarios

### Scenario 1: Brand New Suggestion
```javascript
{
  id: "9f8e7d6c-5b4a-3210-9876-fedcba543210",
  title: "Enable Dark Mode",
  displayNumber: 47,
  content: "Add a dark mode toggle..."
}
```
**Displays as:** `Enable Dark Mode`

---

### Scenario 2: Old Suggestion (Pre-Migration)
```javascript
{
  id: "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
  title: undefined,
  displayNumber: 12,  // Assigned during backfill
  content: "Legacy suggestion without title..."
}
```
**Displays as:** `Suggestion 0012`

---

### Scenario 3: Very Old Suggestion (Edge Case)
```javascript
{
  id: "aaaa-bbbb-cccc-dddd-eeee",
  title: undefined,
  displayNumber: undefined,  // Backfill failed or not yet run
  content: "Ancient suggestion..."
}
```
**Displays as:** `Suggestion #aaaa-bbb` (graceful fallback)

---

## User Benefits

### For League Members
- **Easier Communication**: "What about Suggestion 0042?" vs "What about Suggestion #9f8e7d6c?"
- **Better Context**: Titles provide immediate understanding of what the suggestion is about
- **Professional Look**: Clean, consistent formatting across the site

### For Admins
- **Retroactive Titling**: Can add descriptive titles to old suggestions
- **Flexible Workflow**: Titles are optional, can be added anytime
- **Easy Management**: Clear labeling makes suggestion management simpler

### For Everyone
- **Stable References**: Display numbers never change, safe to reference in Discord/email
- **Logical Ordering**: Sequential numbers reflect chronological order
- **Non-Breaking**: Old links and references still work

---

## Migration Impact

### Immediate (On First API Call)
1. All existing suggestions get display numbers automatically
2. Oldest suggestion → #0001, newest → #N
3. Numbers assigned by `createdAt ASC, id ASC` (ties broken consistently)

### Ongoing
1. New suggestions automatically get next sequential number
2. Admins can add/edit titles anytime
3. Display updates instantly when title added/removed

### No User Action Required
- Everything happens automatically
- No data loss
- No breaking changes
- Fully backward compatible

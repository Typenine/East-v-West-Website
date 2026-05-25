# League Setup Wizard

## Overview

When a new user deploys this template, they go through a setup wizard to configure their league. The first user becomes the admin.

## Setup Flow

### Step 1: League Identity
- **League Name** (becomes site title)
- **League Slug** (URL-friendly, auto-generated from name)
- **Short Name** (optional, e.g., "EvW")
- **Founded Year** (optional)

### Step 2: Sleeper Integration
- **Current Season Sleeper League ID** (required)
- **Historical League IDs** (optional, keyed by year)
- Validate IDs by fetching from Sleeper API
- Show league info preview (team count, roster settings)

### Step 3: Branding
- **Primary Color** (color picker)
- **Secondary Color** (color picker)
- **League Logo** (file upload to R2, optional)

### Step 4: Team Colors (Optional)
- After Sleeper import, show list of teams
- For each team, allow setting:
  - Primary color
  - Secondary color
  - Tertiary color (optional)
  - Quaternary color (optional)
- Can skip and use defaults

### Step 5: Rules Document (Optional)
- Upload PDF or paste markdown/HTML
- Stored in R2 or database
- Can skip and add later

### Step 6: Admin Account
- **Email** (for notifications)
- **Password** (for admin access)
- Creates first user with admin role

### Step 7: Team Authentication Setup
Choose one:
- **Option A: Default PIN per team** - Admin sets a default PIN, teams change on first login
- **Option B: Invite links** - Generate unique signup links per team
- **Option C: Open signup** - Teams claim their roster by verifying Sleeper username

## Database Changes Needed

### Extend `leagues` table
Already has most fields. Add:
- `setup_completed` boolean (default false)
- `team_colors` jsonb (team name -> colors mapping)
- `rules_content` text (markdown/HTML rules)
- `rules_file_key` text (R2 key if PDF uploaded)

### New `league_invites` table (for Option B)
```sql
CREATE TABLE league_invites (
  id uuid PRIMARY KEY,
  league_id uuid REFERENCES leagues(id),
  team_name varchar(255) NOT NULL,
  roster_id integer,
  invite_code varchar(64) UNIQUE NOT NULL,
  claimed_at timestamptz,
  claimed_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);
```

### Extend `users` table
- Add `league_id` uuid (which league they belong to)
- Add `team_name` varchar (their team in the league)
- Add `sleeper_user_id` varchar (for verification)

## API Routes

- `POST /api/setup/league` - Create/update league basics
- `POST /api/setup/sleeper` - Validate and save Sleeper IDs
- `POST /api/setup/branding` - Save colors and logo
- `POST /api/setup/team-colors` - Save per-team colors
- `POST /api/setup/rules` - Save rules content
- `POST /api/setup/admin` - Create admin account
- `POST /api/setup/complete` - Mark setup done

- `GET /api/invite/:code` - Get invite details
- `POST /api/invite/:code/claim` - Claim team invite

## UI Pages

- `/setup` - Wizard container (redirects if setup complete)
- `/setup/league` - Step 1
- `/setup/sleeper` - Step 2
- `/setup/branding` - Step 3
- `/setup/teams` - Step 4
- `/setup/rules` - Step 5
- `/setup/admin` - Step 6
- `/setup/auth` - Step 7
- `/setup/complete` - Success page

- `/join/:code` - Team invite claim page
- `/claim` - Open signup page (if enabled)

## Middleware

- If `setup_completed = false` and not on `/setup/*`, redirect to `/setup`
- If `setup_completed = true` and on `/setup/*`, redirect to `/`

## Migration Strategy

For existing East v. West deployment:
- Set `setup_completed = true` on default league
- Existing data continues to work
- New deployments start with setup wizard

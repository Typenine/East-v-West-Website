# AI League Newsletter — Project Plan (v1 → v2)

## Scope (v1)
- Output: single **HTML** newsletter file each week.
- Sections (v1): Intro, Matchup Recaps, Waiver Wire & FA Moves, Trades (if any), Spotlight Team, Next Week’s Forecast, Final Word.
- Out of scope (for now): Power Rankings, Discord posts, Voice, Email send/PDF.

## Scope (v2)
- Power Rankings (side-by-side bots, tiers, discrepancy dialogue)
- Narrative Tag Framework across sections
- Callback Tracker + Weekly Narrative Tracker (visible in copy)
- Injury Reaction Commentary, deeper Trade Mode
- Email send + PDF export

## Architecture (high level)
- Ingest (Sleeper) → Derive (pairs, trends) → Relevance (what gets coverage) →
  Memory Engine (capsules, trust/frustration, mood w/ decay) →
  Dual Personality (sliders + tone templates + variability) →
  Composer (builds "Newsletter JSON") → HTML Renderer → Persist outputs/memory.

## Data/State (v1)
- /data/snapshots : weekly raw pulls
- /data/derived   : matchup pairs, trends, scored events
- /data/memory    : per-bot relationship capsules
- /out            : generated HTML issues

## Acceptance Criteria (v1)
- Produces one HTML file in /out with all v1 sections.
- Each section includes **both bots** (Entertainer + Analyst).
- Waivers: every waiver claim gets ≥1 line; FA pickups covered only if relevance ≥ threshold.
- Trades: context + letter grades per team; bots may agree/disagree if justified.
- Spotlight: references at least one memory element (trust/frustration or tag history).
- Forecast: both bots pick winners + one bold player each; predictions logged for later comparison.
- Memory updates each run (trust/frustration, mood with decay); visible tonal changes over time.
- No repeated openers within a section (variability guard).

## Milestones
M0  Docs + configs
M1  Ingest & Derived (spec → code)
M2  Relevance Engine (starter rules)
M3  Dual Personality core (sliders, tone templates, variability, blurts)
M4  Memory Engine (lite) + overlap resolver
M5  Composer + HTML renderer
M6  QA pass + first real issue (v1)
M8  Power Rankings (v2)
M9  Special editions + delivery (v2)

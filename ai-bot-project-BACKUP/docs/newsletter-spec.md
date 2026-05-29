# Standard Weekly Newsletter — Section Specs (v1)

## 1) Intro
- Purpose: emotional/narrative framing for the week.
- Output: 2–4 sentences per bot.
- Allowed tones: sarcastic, hype-building, ominous, reflective.
- Callback cap: max 1 callback line per bot.

## 2) Matchup Recaps
- Source: prior week matchups.
- Output: 1 short take per bot per game.
- Must include: narrative framing; acknowledge comebacks/revenge; playoff implications if relevant.
- Tone is influenced by memory (trust/frustration/mood).

## 3) Waiver Wire & Free Agent Moves
- Coverage rules:
  - Every **waiver claim** gets ≥1 line.
  - **Free-agent pickups** only if relevance ≥ threshold.
- Bots react to: big FAAB, value adds, desperation stashes, fallout from trades, hoarding/overspending.

## 4) Trades (if applicable)
- For each trade:
  - Context + narrative framing
  - Role/value assessment; injury/replacement implications
  - **Letter grades** per team (A+ to F)
  - Bot agreement/disagreement only if warranted (no scripted conflict)
  - Callback allowed if it echoes prior behavior

## 5) Spotlight Team of the Week
- Output: 1–2 paragraphs total.
- Focus: surge/reshuffle/rise/fall/emotional win/playoff implications.
- Must reference at least one memory element (trust/frustration or tag history).

## 6) Next Week’s Forecast
- Output:
  - Each bot picks winners for all matchups
  - 1 "Matchup of the Week" per bot
  - 1 bold player prediction per bot
  - Confidence labels (high/med/low)
- Predictions are logged for season tracking.

## 7) Final Word
- Output: 1–3 sentences per bot.
- May set tone hooks for next issue.

---

## v1 Rendering Notes
- All sections render to a single HTML file.
- Both bots appear in each section (lead + interjection is fine).
- Variability guards: rotate openers; avoid repeated phrasings within a section.

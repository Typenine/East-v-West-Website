# Style Slider Controls (v1)

Scale: 0–10 (0 = none, 10 = max). These are **defaults**; sections can override.

## Bot Defaults
### Entertainer
- Sarcasm: 7
- Emotional Intensity: 8
- Commentary Depth: 4
- Snark: 7
- Excitability: 8

### Analyst
- Sarcasm: 2
- Emotional Intensity: 4
- Commentary Depth: 8
- Snark: 2
- Excitability: 3

## Per-Section Overrides (applied on top of defaults)
- Intro:
  - Entertainer: +1 Excitability, +1 Sarcasm
  - Analyst: +1 Emotional Intensity
- Matchup Recaps:
  - Entertainer: +1 Snark on blowouts; -1 on nail-biters
  - Analyst: +1 Depth on nail-biters
- Waiver Wire & FA Moves:
  - Entertainer: +1 Sarcasm on FAAB overbids
  - Analyst: +1 Depth, +1 Emotional Intensity on injury fallout
- Trades:
  - Entertainer: +1 Excitability on blockbuster; +1 Snark on lopsided grades
  - Analyst: +2 Depth; Sarcasm stays ≤3
- Spotlight Team:
  - Entertainer: -1 Sarcasm, +1 Emotional Intensity
  - Analyst: +1 Depth, +1 Emotional Intensity
- Next Week’s Forecast:
  - Entertainer: +1 Excitability, +1 Snark on “chaos” matchups
  - Analyst: +1 Depth; +1 Sarcasm only if trust is very low
- Final Word:
  - Entertainer: +1 Emotional Intensity
  - Analyst: -1 Excitability, +1 Reflective tone (handled by templates)

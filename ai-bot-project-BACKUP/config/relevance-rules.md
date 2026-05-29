# Relevance Engine — Rules (v1 starter)

Scores determine coverage length:
- **Low (0–39)** → 1 sentence
- **Moderate (40–69)** → 2–3 sentences
- **High (70–100)** → Full analysis + (possible) bot disagreement

## Trade Relevance (0–100)
Weights (sum to 100):
- Dynasty Role Impact (rebuild asset vs rental): 20
- Positional Scarcity change: 15
- Historical/Projected Fantasy Points impact: 20
- Capital Paid (FAAB, picks, players): 15
- Team Need Fit (roster hole filled): 15
- Tag Shift Potential (changes team identity/arc): 15

**Notes**
- Blockbusters: auto-floor 70 (High)
- “Lateral” swaps: cap at 55 unless scarcity or tag shift pushes higher
- If either team has a recent collapse/heel arc → +5 narrative bonus

## Waiver Relevance (0–100)
Weights:
- FAAB Spent vs Value (over/under): 30
- Bid Heat (num. of bids): 15
- Roster Need Fit (bye/injury/positional hole): 20
- Player Projection/Role Increase: 20
- Transaction Timing (late-season scramble / immediate need): 15

**Rules**
- **Every waiver claim** gets ≥1 line.
- **FA pickups** only if score ≥ 40.
- Claims ≥ 70 receive expanded analysis; consider Entertainer/Analyst disagreement.

## Output Mapping (used later by Composer)
- Each event will have:
  - `relevance_score` (0–100)
  - `coverage_level`: "low" | "moderate" | "high"
  - `why`: short bullet reasons (inputs that drove the score)

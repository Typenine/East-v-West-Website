# Draft Card Corrections — Verified 2023-2025 Stat Blocks 

This version is rebuilt for the Windsurf handoff. It uses full 2023-2025 stat blocks where available, includes source URLs, and flags #1 and #82 as missing because those screenshots were not provided. Use the **Final corrected full stat block to use** section for each player.

## Rules for Windsurf

1. Update each player card from the **Final corrected full stat block to use** section.
2. Do not replace a full career/three-year card with a 2025-only card unless the player truly has no relevant listed production in the earlier years.
3. Preserve rankings, NFL teams, NFL pick numbers, positions, UI, auth, notes, board behavior, and persistence.
4. Search each scouting report for claims tied to the old wrong stats and revise them.
5. Use the source URLs for verification. If the codebase or a source conflicts with this file, flag that player instead of guessing.
6. After editing, search for the original wrong stat strings so stale duplicates do not survive.

## Missing / not reviewed

- Card #1 was not included in the provided screenshot batches.
- Card #82 was not included in the provided screenshot batches. The last reviewed card was #81, Deion Burks.

## Player corrections

Note: For players whose corrected card only has 2025 production, earlier seasons should be shown as “No relevant FBS offensive production listed” only if the codebase/card format requires a 2023/2024/2025 row. Do not invent 2023/2024 lines if the source page has no offensive production for that year.

### 2. Jeremiyah Love (RB)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
RUSH — 2023: 71-385-1TD (5.4) | 2024: 163-1125-17TD (6.9) | 2025: 199-1372-18TD (6.9)
REC — 2023: 8-67-0TD | 2024: 28-237-2TD | 2025: 27-280-3TD
MISC — 2 KR TDs (2024), 1 PR TD (2025), Doak Walker Award (2025)
```

Final corrected full stat block to use:
```text
RUSH — 2023: 71-385-1TD (5.4) | 2024: 163-1125-17TD (6.9) | 2025: 199-1372-18TD (6.9)
REC — 2023: 8-77-1TD | 2024: 28-237-2TD | 2025: 27-280-3TD
KR — 2023: 2-42-0TD | 2024: 1-0-0TD | 2025: no return production listed
MISC — Doak Walker Award winner, unanimous All-American, 21 offensive TDs in 2025. Remove unsupported 2024 KR TD / 2025 PR TD notes.
```

What changed / why:
```text
2023 receiving was 8-77-1, not 8-67-0. 2024 and 2025 rushing/receiving were otherwise fine. Return notes were wrong: CFBStats shows no 2024 KR TD and no 2025 return production.
```

Scouting report correction:
```text
Scouting can keep three-down RB framing, but avoid unsupported 2025 PR/KR TD claims.
```

Sources:
- https://cfbstats.com/2025/player/513/2001340/index.html
- https://www.sports-reference.com/cfb/players/jeremiyah-love-1.html

### 3. Carnell Tate (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2023: 18-264-1TD (14.7) | 2024: 52-733-4TD (14.1) | 2025: 52-895-9TD (17.2)
RUSH — 3 jet-sweep attempts, 28 yds (career)
MISC — 9 catches of 40+ yds in 2025, 2nd-team AA
```

Final corrected full stat block to use:
```text
REC — 2023: 18-264-1TD (14.7) | 2024: 52-733-4TD (14.1) | 2025: 51-875-9TD (17.2)
RUSH — 2025: 2-16-0TD
MISC — Ohio State boundary/downfield WR. Remove unsupported 9 catches of 40+ yards unless separately sourced.
```

What changed / why:
```text
2025 receiving total is 51-875-9, not 52-895-9. Rushing should be 2-16-0 in 2025, not 3-28 career unless using a separate career source.
```

Scouting report correction:
```text
Change any 12-touchdown reference to 9 receiving TDs if this card is discussing 2025 production.
```

Sources:
- https://cfbstats.com/2025/player/518/2000093/index.html
- https://cfbstats.com/2025/player/518/2000093/receiving/situational.html

### 4. Jordyn Tyson (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2022 (CU): 22-470-5TD (21.4) | 2023: knee injury, DNP | 2024 (ASU): 75-1101-10TD (14.7) | 2025 (ASU): 61-711-8TD (11.7)
RUSH — 5-42-0TD (2024), 3-19-0TD (2025)
MISC — Led Big 12 in rec (136) over 2024-25
```

Final corrected full stat block to use:
```text
REC — 2023: DNP/knee injury | 2024 (ASU): 75-1101-10TD (14.7) | 2025 (ASU): 61-711-8TD (11.7)
RUSH — 2024: 5-42-0TD | 2025: 2-4-1TD
PASS — 2025: 0-for-1
MISC — Arizona State WR; do not describe 2024-25 as two 1,000-yard seasons.
```

What changed / why:
```text
2025 receiving is correct, but 2025 rushing is wrong and should include the rushing TD.
```

Scouting report correction:
```text
Keep injury/context language, but avoid saying two full 1,000-yard seasons if the card also shows 711 yards in 2025.
```

Sources:
- https://cfbstats.com/2025/player/28/1177365/index.html

### 5. Ty Simpson (QB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
PASS — 2023-24: backup (29 att total) | 2025: 3,567 yds, 28 TD, 5 INT, 64.5%
RUSH — 2025: 62-287-5TD (4.6 avg)
MISC — 5-star recruit, sat behind Milroe for 2 years, CFP semifinal
```

Final corrected full stat block to use:
```text
PASS — 2023: 11-20, 179 yds, 0 TD, 0 INT, 55.0% | 2024: 14-25, 167 yds, 0 TD, 0 INT, 56.0% | 2025: 305-473, 3567 yds, 28 TD, 5 INT, 64.5%
RUSH — 2023: 14-86-2TD | 2024: 8-44-1TD | 2025: 90-93-2TD
MISC — Alabama starter; 2025 fantasy value is passing-based, not the inflated rushing line shown on the card.
```

What changed / why:
```text
Backup passing attempts were 20 in 2023 and 25 in 2024, not 29 total. 2025 rushing was 90-93-2, not 62-287-5.
```

Scouting report correction:
```text
Remove the 'five rushing touchdowns' fantasy hook. His fantasy profile is primarily passing-based.
```

Sources:
- https://cfbstats.com/2025/player/8/1173932/index.html

### 6. Kenyon Sadiq (TE)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2023: 5-24-1TD | 2024: 24-308-2TD (12.8) | 2025: 51-560-8TD (11.0)
RUSH — 1-4-0TD (career gadget)
MISC — 6'3" 241 lbs, Big Ten TE of the Year (2025), 2nd-team AA
```

Final corrected full stat block to use:
```text
REC — 2023: 5-24-1TD | 2024: 24-308-2TD (12.8) | 2025: 51-560-8TD (11.0)
RUSH — 2024: 5-24-0TD | 2025: 3-6-0TD
MISC — Oregon receiving TE, 8-TD breakout. Fix height/athletic testing language before publishing.
```

What changed / why:
```text
Receiving lines were right. Rushing/gadget line should not be listed as 1-4 career; he had documented 2024 and 2025 rushing usage.
```

Scouting report correction:
```text
Fix the internal height contradiction: card says 6'3, scouting says 6'6.
```

Sources:
- https://cfbstats.com/2025/player/529/2000759/index.html

### 7. Makai Lemon (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2023: 6-88-0TD (14.7) | 2024: 52-764-6TD (14.7) | 2025: 79-1156-11TD (14.6) — Biletnikoff
RUSH — 7-58-0TD (career)
KR — 19-514 (27.1 avg), long 80 yds
MISC — 1st-team AA in 2025, Biletnikoff Award winner
```

Final corrected full stat block to use:
```text
REC — 2023: 6-88-0TD (14.7) | 2024: 52-764-3TD (14.7) | 2025: 79-1156-11TD (14.6)
RUSH — 2025: 9-4-2TD
PR — 2025: 6-71-0TD
KR — 2024: 19-514-0TD | 2025: 8-144-0TD
PASS — 2025: 1-1, 24 yds, 1 TD
MISC — USC high-volume receiver; 2024 receiving TDs were 3, not 6.
```

What changed / why:
```text
2024 receiving TDs were wrong. 2025 receiving was right. Rushing/return/passing lines should be included because he had gadget/return usage.
```

Scouting report correction:
```text
Keep safe-WR profile if desired, but avoid unsupported award/return specifics unless sourced.
```

Sources:
- https://www.sports-reference.com/cfb/players/makai-lemon-1.html

### 8. KC Concepcion (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023 (NCST): 64-767-10TD (12.0) | 2024 (NCST): 53-460-6TD (8.7) | 2025 (TAMU): 61-919-12TD (15.1)
RUSH — 2023: 38-297-2TD | 2024: 22-59-0TD | 2025: 5-41-0TD
PR — 2023: 12-148-1TD | 2024: 8-72-0TD
MISC — ACC Rookie of the Year (2023), consensus AA all-purpose (2025)
```

Final corrected full stat block to use:
```text
REC — 2023 (NCST): 71-839-10TD | 2024 (NCST): 53-460-6TD (8.7) | 2025 (TAMU): 61-919-9TD (15.1)
RUSH — 2023: 41-320-0TD | 2024: 19-36-2TD | 2025: 10-75-1TD
PR — 2024: 5-45-0TD | 2025: 25-456-2TD
MISC — NC State → Texas A&M, Paul Hornung/all-purpose profile, 12 total TDs in 2025.
```

What changed / why:
```text
2025 receiving TDs, rushing, and punt-return production are wrong/incomplete. He had 9 receiving TDs, plus 1 rushing TD and 2 PR TDs.
```

Scouting report correction:
```text
Update from gadget-only framing to legitimate all-purpose production with 12 total TDs.
```

Sources:
- https://cfbstats.com/2025/player/697/2000861/index.html
- https://cfbstats.com/2025/player/697/2000861/puntreturn/split.html

### 9. Omar Cooper Jr. (WR)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2023: 18-267-2TD (14.8) | 2024: 28-594-7TD (21.2) | 2025: 69-937-13TD (13.6)
RUSH — 75-yd rush TD (2025), longest by IU WR since 2014
MISC — PFF 87.8 grade in 2025, led Indiana national championship team in targets/catches/yards
```

Final corrected full stat block to use:
```text
REC — 2023: 18-267-2TD (14.8) | 2024: 28-594-7TD (21.2) | 2025: 69-937-13TD (13.6)
RUSH — 2024: 2-23-1TD | 2025: 3-74-1TD
MISC — Indiana lead receiver; include the actual rushing TD production rather than only mentioning a 75-yard rushing TD.
```

What changed / why:
```text
Receiving lines were mostly right. Rushing production needed to be added as actual stat lines.
```

Scouting report correction:
```text
Keep developmental arc, but source or soften PFF and record claims.
```

Sources:
- https://cfbstats.com/2025/player/306/1174514/index.html
- https://cfbstats.com/2025/team/306/receiving/index.html

### 10. Jadarian Price (RB)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
RUSH — 2023: Achilles, DNP | 2024: 108-746-7TD (6.9) | 2025: 113-674-11TD (6.0)
REC — 2024: 14-112-0TD | 2025: 22-187-2TD
MISC — Achilles tear Oct 2023, returned Aug 2024
```

Final corrected full stat block to use:
```text
RUSH — 2023: 47-272-3TD (5.8) | 2024: 120-746-7TD (6.2) | 2025: 113-674-11TD (6.0)
REC — 2023: 5-65-1TD | 2024: 4-10-0TD | 2025: 6-87-2TD
KR — 2025: 12-450-2TD (37.5)
MISC — Missed 2022 with Achilles injury; he did not DNP in 2023.
```

What changed / why:
```text
The card put the Achilles/DNP note in the wrong year, understated 2024 rushing attempts, and badly overstated 2024/2025 receiving volume.
```

Scouting report correction:
```text
Keep medical-risk framing, but also mention return-game value if the full profile is being used.
```

Sources:
- https://cfbstats.com/2025/player/513/1175080/index.html
- https://cfbstats.com/2025/team/513/rushing/index.html

### 11. De'Zhaun Stribling (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023 (WSU): 63-729-4TD (11.6) | 2024: 34-488-3TD (14.4) | 2025: 54-800-6TD (14.8)
RUSH — 2-11-0TD (career)
MISC — WSU → Ole Miss transfer, dip in 2024 with new QB
```

Final corrected full stat block to use:
```text
REC — 2023 (OKST): 14-198-1TD (14.1) | 2024 (OKST): 52-882-6TD (17.0) | 2025 (Ole Miss): 55-811-6TD (14.7)
RUSH — No 2023-25 rushing production listed
MISC — Washington State → Oklahoma State → Ole Miss transfer path.
```

What changed / why:
```text
2025 is slightly understated, but bigger issue is transfer/school history: he went WSU → Oklahoma State → Ole Miss, not directly WSU → Ole Miss.
```

Scouting report correction:
```text
Rewrite production arc to account for Oklahoma State year and the actual 2025 line.
```

Sources:
- https://cfbstats.com/2025/player/433/1122869/index.html
- https://www.sports-reference.com/cfb/players/dezhaun-stribling-1.html

### 12. Denzel Boston (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2023: 5-51-0TD | 2024: 63-834-9TD (13.2) | 2025: 60-821-12TD (13.7)
RUSH — 2-(-3)-0TD (career)
MISC — 21 TDs in 2 seasons after waiting behind Odunze/McMillan/Polk, elite red-zone rate
```

Final corrected full stat block to use:
```text
REC — 2023: 5-51-0TD | 2024: 63-834-9TD (13.2) | 2025: 62-881-11TD (14.2)
PR — 2024: 12-80-0TD | 2025: 8-104-1TD
PASS — 2025: 2-2, 15 yds, 1 TD
MISC — 20 receiving TDs over 2024-25; 21 total TDs if including 2025 punt-return TD.
```

What changed / why:
```text
2025 receiving should be 62-881-11. The 12-TD number is total TDs if the punt-return TD is included, not receiving TDs.
```

Scouting report correction:
```text
Change 21 receiving TDs to 20 receiving TDs over 2024-25 unless counting punt/pass TDs separately.
```

Sources:
- https://cfbstats.com/2025/player/756/1175644/index.html
- https://cfbstats.com/2025/player/756/1175644/puntreturn/split.html

### 13. Germie Bernard (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023 (UW): 41-419-1TD (10.2) | 2024 (UW): 50-685-5TD (13.7) | 2025 (BAMA): 60-813-7TD (13.6)
RUSH — 3-22-0TD (career)
KR/PR — 2024: 8-167-0TD KR | 2025: limited
```

Final corrected full stat block to use:
```text
REC — 2023 (Washington): 34-419-2TD (12.3) | 2024 (Alabama): 50-794-2TD (15.9) | 2025 (Alabama): 64-862-7TD (13.5)
RUSH — 2023: 13-43-2TD | 2024: 4-37-1TD | 2025: 18-101-2TD
KR/PR — 2023: 10 KR-233-0TD, 3 PR-43-0TD | 2024-25: no meaningful return production listed
PASS — 2025: 2-2, 15 yds
MISC — Michigan State → Washington → Alabama; versatile WR with real 2025 rushing contribution.
```

What changed / why:
```text
The card had wrong schools/stats for 2024 and incorrect rushing/return context.
```

Scouting report correction:
```text
Keep versatility angle and include rushing contribution.
```

Sources:
- https://cfbstats.com/2025/player/8/1174817/index.html

### 14. Eli Stowers (TE)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2024: 50-644-5TD (12.9) | 2025: 62-769-4TD (12.4)
RUSH — 2-8-0TD (career)
MISC — Texas A&M → Vandy, Mackey Award winner (2025), 1st-team AA
```

Final corrected full stat block to use:
```text
REC — 2024: 49-638-5TD (13.0) | 2025: 62-769-4TD (12.4)
RUSH — 2024: 6-7-0TD | 2025: 2-2-0TD
MISC — Texas A&M/New Mexico State → Vanderbilt path if full transfer history is listed; Mackey Award profile.
```

What changed / why:
```text
2024 receiving should be 49-638-5, not 50-644-5. Add the real rushing lines.
```

Scouting report correction:
```text
Scouting profile is mostly fine if award claims are verified elsewhere.
```

Sources:
- https://cfbstats.com/2025/player/736/1122654/index.html
- https://www.reuters.com/sports/vanderbilt-te-eli-stowers-return-final-season-2025-01-09/

### 15. Nate Boerkircher (TE)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2024: 18-178-2TD | 2025: 24-218-3TD
MISC — Blocking-first TE, limited receiving ceiling
```

Final corrected full stat block to use:
```text
REC — 2024 (Nebraska): 6-102-0TD | 2025 (Texas A&M): 19-198-3TD (10.4)
RUSH — 2025: 3-5-1TD
MISC — Blocking TE with short-yardage/gadget usage.
```

What changed / why:
```text
2024 and 2025 receiving were inflated on the card. 2025 rushing TD was missing.
```

Scouting report correction:
```text
Blocking-first conclusion can remain, but production should be 19-198-3 plus 1 rushing TD.
```

Sources:
- https://cfbstats.com/2025/player/697/1112393/index.html

### 16. Marlin Klein (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 32-428-3TD (13.4)
MISC — German import, basketball background, raw but athletic
```

Final corrected full stat block to use:
```text
REC — 2025: 24-248-1TD (10.3)
MISC — German-born Michigan TE, honorable mention All-Big Ten, developmental/inline profile.
```

What changed / why:
```text
2025 receiving was badly inflated. Actual line is 24-248-1, not 32-428-3.
```

Scouting report correction:
```text
Tone down production-based upside. Still athletic, but the statistical breakout was smaller.
```

Sources:
- https://cfbstats.com/2025/player/418/1180022/index.html
- https://mgoblue.com/sports/football/roster/marlin-klein/26727

### 17. Max Klare (TE)

Accuracy: **Clean**  
Severity: **Clean**

Original screenshot text:
```text
REC — 2024 (PUR): 51-685-4TD (13.4) | 2025 (OSU): 43-448-2TD (10.4)
MISC — Purdue → OSU, 1st-team All-Big Ten (2025), crowded OSU target share
```

Final corrected full stat block to use:
```text
REC — 2024 (Purdue): 51-685-4TD (13.4) | 2025 (Ohio State): 43-448-2TD (10.4)
MISC — Purdue → Ohio State, crowded target share. Stat block looked clean.
```

What changed / why:
```text
No meaningful stat correction identified.
```

Scouting report correction:
```text
No rewrite required unless you want to soften first-team award language.
```

Sources:
- https://cfbstats.com/2025/player/518/1180195/index.html

### 18. Carson Beck (QB)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
PASS — 2024 (UGA): 3,485 yds, 28 TD, 12 INT, 64.2% | 2025 (Miami): 3,813 yds, 30 TD, 12 INT, 72.4%
RUSH — 2024: 28-(-18)-0TD | 2025: 34-12-1TD
MISC — Georgia → Miami transfer, classic pocket passer
```

Final corrected full stat block to use:
```text
PASS — 2024 (Georgia): 290-448, 3485 yds, 28 TD, 12 INT, 64.7% | 2025 (Miami): 338-467, 3813 yds, 30 TD, 12 INT, 72.4%
RUSH — 2024: 55-71-1TD | 2025: 62-43-2TD
REC — 2025: 1-14-1TD
MISC — Georgia → Miami transfer, pocket passer with minimal rushing value.
```

What changed / why:
```text
Passing is correct. Rushing is wrong: actual 2025 rushing was 62-43-2, not 34-12-1.
```

Scouting report correction:
```text
Do not say he had only one career rushing TD or zero rushing floor based on the displayed wrong line.
```

Sources:
- https://cfbstats.com/2025/player/415/1111386/index.html

### 19. Sam Roush (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 38-423-3TD (11.1)
MISC — Stanford legacy, possession TE profile
```

Final corrected full stat block to use:
```text
REC — 2025: 49-545-2TD (11.1)
MISC — Stanford possession TE; led ACC tight ends in receiving yards per Stanford bio.
```

What changed / why:
```text
Catches/yards/TDs are wrong. Actual is 49-545-2, not 38-423-3.
```

Scouting report correction:
```text
Replacement-level framing should be softened. 545 yards is a real TE receiving season.
```

Sources:
- https://cfbstats.com/2025/player/674/1175342/index.html
- https://gostanford.com/sports/football/roster/player/sam-roush

### 20. Antonio Williams (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023: 20-351-4TD (17.6) | 2024: 75-904-11TD (12.1) | 2025: 55-604-4TD (11.0)
RUSH — 3-17-0TD (career)
PR — 2024: 10-89-0TD | 2025: 8-61-0TD
```

Final corrected full stat block to use:
```text
REC — 2023: 22-224-2TD (10.2) | 2024: 75-904-11TD (12.1) | 2025: 55-604-4TD (11.0)
RUSH — 2023: 0-0-0TD | 2024: 7-101-1TD | 2025: 13-78-1TD
PR — 2023: 3-14-0TD | 2024: 17-164-0TD | 2025: 4-44-0TD
PASS — 2025: 1-1, 75 yds, 1 TD
MISC — Clemson slot/return/gadget profile.
```

What changed / why:
```text
Receiving is right, but rushing and punt-return lines are wrong. Card also misses 75-yard passing TD.
```

Scouting report correction:
```text
Keep regression language if desired, but add rushing/passing gadget context.
```

Sources:
- https://cfbstats.com/2025/player/147/1174156/index.html

### 21. Oscar Delp (TE)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2023: 24-284-2TD | 2024: 21-248-4TD | 2025: 20-261-1TD
MISC — UGA TE, 70-854-8TD career, red-zone upside in run-heavy O
```

Final corrected full stat block to use:
```text
REC — 2023: 24-284-3TD | 2024: 21-248-4TD | 2025: 20-261-1TD (13.1)
MISC — Georgia TE, 70-854-9TD career if using full official/statmuse career total.
```

What changed / why:
```text
2023 receiving TDs and career TD total were wrong; 2023 should be 3 receiving TDs, not 1 or 2.
```

Scouting report correction:
```text
Avoid overstating red-zone profile from 2025 because he had only 1 TD that year.
```

Sources:
- https://cfbstats.com/2025/player/257/1174437/index.html
- https://www.sports-reference.com/cfb/players/oscar-delp-1.html

### 22. Malachi Fields (WR)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2023 (UVA): 58-811-5TD (14.0) | 2024 (UVA): 55-808-7TD (14.7) | 2025 (ND): 36-630-5TD (17.5)
RUSH — 3-22-0TD (career)
MISC — Grad transfer to ND for 2025, consistent 800+ yds at UVA
```

Final corrected full stat block to use:
```text
REC — 2023 (Virginia): 58-811-5TD (14.0) | 2024 (Virginia): 55-808-5TD (14.7) | 2025 (Notre Dame): 36-630-5TD (17.5)
RUSH — No meaningful rushing production; do not list 3-22-0 career unless separately sourced
MISC — Virginia → Notre Dame transfer, efficient vertical/contested-catch profile.
```

What changed / why:
```text
Receiving stats are clean except the file had 2024 TDs wrong. Rushing line should be removed or sourced.
```

Scouting report correction:
```text
Mostly fine, but do not imply 2025 rushing usage.
```

Sources:
- https://cfbstats.com/2025/player/513/1125510/index.html

### 23. Caleb Douglas (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2023: 11-154-1TD (14.0) | 2024: 40-670-5TD (16.8) | 2025: 52-853-7TD (16.4)
RUSH — 1-8-0TD (career)
MISC — Breakout in 2024 after early career silence
```

Final corrected full stat block to use:
```text
REC — 2023 (Florida): 11-133-1TD (12.1) | 2024 (Texas Tech): 60-877-6TD (14.6) | 2025 (Texas Tech): 54-846-7TD (15.7)
RUSH — No meaningful rushing production
MISC — Florida → Texas Tech transfer, back-to-back 800-yard seasons at Texas Tech.
```

What changed / why:
```text
All three receiving lines were off and 2023 school was wrong. Rushing line should be removed.
```

Scouting report correction:
```text
Deep-ball framing can stay, but use 15.7 YPR rather than 16.4.
```

Sources:
- https://cfbstats.com/2025/player/700/1174363/index.html
- https://texastech.com/sports/football/roster/caleb-douglas/13706

### 24. Drew Allar (QB)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
PASS — 2024: 3,327 yds, 24 TD, 8 INT, 63.4% | 2025: 1,100 yds, 8 TD, 3 INT (9 games)
RUSH — 2024: 52-82-3TD | 2025: limited
MISC — Broken ankle Nov 2025 (season-ending surgery), PSU career 7,402 yds/61 TD
```

Final corrected full stat block to use:
```text
PASS — 2024: 262-394, 3327 yds, 24 TD, 8 INT, 66.5% | 2025: 103-159, 1100 yds, 8 TD, 3 INT, 64.8% (6 games)
RUSH — 2024: 96-302-6TD | 2025: 36-172-1TD
REC — 2025: 1-5-0TD
MISC — Season-ending left leg/ankle injury in Oct. 2025; do not call him pure pocket-only based on the bad rushing line.
```

What changed / why:
```text
2024 completion percentage and rushing lines were wrong. 2025 was 6 games, not 9.
```

Scouting report correction:
```text
Use safer injury wording unless you have a source confirming broken ankle/surgery.
```

Sources:
- https://www.reuters.com/sports/penn-state-qb-drew-allar-suffers-season-ending-injury--flm-2025-10-12/
- https://www.sports-reference.com/cfb/players/drew-allar-1.html

### 25. Zachariah Branch (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023 (USC): 31-320-2TD (10.3) | 2024 (USC): 47-503-1TD (10.7) | 2025 (UGA): 81-811-6TD (10.0)
RUSH — 2023: 4-63-0TD | 2025: 3-18-0TD
KR/PR — 2023: 2 KR TD, 1 PR TD | 2024: 1 KR TD | 2025: 10 KR for 205 yds
```

Final corrected full stat block to use:
```text
REC — 2023 (USC): 31-320-2TD (10.3) | 2024 (USC): 47-503-1TD (10.7) | 2025 (Georgia): 81-811-6TD (10.0)
RUSH — 2023: 9-70-1TD | 2024: 2-17-0TD | 2025: 4-7-0TD
PR — 2023: 16-332-1TD | 2024: 13-74-0TD | 2025: 15-180-0TD
KR — 2023: 24-442-1TD | 2024: 5-105-0TD | 2025: 10-205-0TD
MISC — Georgia slot/return profile; 2025 receiving volume is real.
```

What changed / why:
```text
2025 rushing is wrong and 2025 punt returns are missing. Return TD notes for prior seasons also need verification/correction.
```

Scouting report correction:
```text
Do not call him only return-specialist; 81 catches is real receiving volume.
```

Sources:
- https://cfbstats.com/2025/player/257/2000182/index.html

### 26. Ja'Kobi Lane (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2023: 2-28-0TD | 2024: 43-525-12TD (12.2, 13g) | 2025: 47-810-6TD (17.2)
RUSH — 2-12-0TD (career)
MISC — 6'4" red-zone specialist, 12 TDs on 43 catches in 2024
```

Final corrected full stat block to use:
```text
REC — 2023: 7-93-2TD (13.3) | 2024: 43-525-12TD (12.2) | 2025: 49-745-4TD (15.2)
RUSH — No meaningful rushing production
MISC — USC outside/red-zone WR; 2024 TD spike remains the profile hook.
```

What changed / why:
```text
2023 and 2025 receiving lines were wrong. Rushing line should be removed.
```

Scouting report correction:
```text
Downfield evolution should be toned down because YPR/yardage/TDs were overstated.
```

Sources:
- https://cfbstats.com/2025/player/657/2003089/index.html

### 27. Chris Brazzell II (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023 (Tul): 40-711-5TD (17.8) | 2024: 24-422-4TD (17.6) | 2025: 46-645-6TD (14.0)
RUSH — 1-9-0TD (career)
MISC — Tulane → Tennessee, deep-ball specialist early, expanded route tree
```

Final corrected full stat block to use:
```text
REC — 2023 (Tulane): 44-711-5TD (16.2) | 2024 (Tennessee): 29-333-2TD | 2025 (Tennessee): 62-1017-9TD (16.4)
RUSH — No 2025 rushing production listed
MISC — Tulane → Tennessee, major 2025 SEC breakout.
```

What changed / why:
```text
2025 receiving is badly understated. Actual is 62-1017-9, not 46-645-6.
```

Scouting report correction:
```text
Rewrite from modest/deep-ball-only to legitimate breakout WR season.
```

Sources:
- https://cfbstats.com/2025/player/694/1180442/index.html

### 28. Ted Hurst (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2022-23 (prev school): 60-1027-10TD | 2024 (GSU): 56-961-9TD (17.2) | 2025 (GSU): 74-1202-13TD (16.2)
RUSH — 5-33-0TD (career)
MISC — Transferred to GSU in 2024, Sun Belt record 22 TDs in 2 seasons
```

Final corrected full stat block to use:
```text
REC — 2024 (Georgia State): 56-961-9TD (17.2) | 2025 (Georgia State): 71-1004-6TD (14.1)
RUSH — No 2025 rushing production listed
MISC — Georgia State producer; do not use Sun Belt record/22 TD claim unless separately sourced.
```

What changed / why:
```text
2025 receiving is inflated and TD/record claims are wrong or unsupported. Actual 2025 is 71-1004-6.
```

Scouting report correction:
```text
Rewrite. He was productive, but not 1,202 yards/13 TD or Sun Belt record level based on CFBS.
```

Sources:
- https://cfbstats.com/2025/player/254/1187278/index.html
- https://georgiastatesports.com/sports/football/roster/ted-hurst/7635

### 29. Will Kacmarek (TE)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2025: 12-98-1TD
MISC — Ohio → OSU transfer, blocking TE only
```

Final corrected full stat block to use:
```text
REC — 2025: 15-168-2TD (11.2)
MISC — Ohio → Ohio State transfer, blocking/secondary TE with modest receiving contribution.
```

What changed / why:
```text
2025 receiving was understated. Actual is 15-168-2, not 12-98-1.
```

Scouting report correction:
```text
Blocking-first can remain, but not 'receiving negligible' to the same extent.
```

Sources:
- https://cfbstats.com/2025/player/518/1125227/index.html

### 30. Zavion Thomas (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2024: 32-432-2TD (13.5) | 2025: 45-612-4TD (13.6)
PR — 2025: 8-74-0TD
MISC — Mississippi State → LSU, slot/return option
```

Final corrected full stat block to use:
```text
REC — 2023 (Mississippi State): 40-503-1TD (12.6) | 2024 (LSU): 23-218-2TD | 2025 (LSU): 41-488-4TD (11.9)
RUSH — 2025: 19-99-1TD
PR — 2024: 14-66-0TD | 2025: 17-153-0TD
KR — 2024: 24-633-1TD | 2025: 1-22-0TD
PASS — 2025: 2-3, 33 yds
MISC — Mississippi State → LSU before 2024, utility/return option.
```

What changed / why:
```text
Transfer timing, 2024 receiving, 2025 receiving, 2025 punt returns, and gadget usage were wrong/incomplete.
```

Scouting report correction:
```text
Rewrite as utility player rather than just modest slot/return receiver.
```

Sources:
- https://cfbstats.com/2025/player/365/1177626/index.html
- https://cfbstats.com/2025/team/365/kickreturn/index.html

### 31. Kaelon Black (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2024: 251 yds, 2 TD (backup role) | 2025: 1,040 yds, 10 TD (5.6 avg)
REC — 2025: 28-214-2TD
MISC — JMU → IU transfer, key contributor in Indiana national title run
```

Final corrected full stat block to use:
```text
RUSH — 2024: 251 yds, 2 TD | 2025: 186-1040-10TD (5.6)
REC — 2025: 4-36-0TD
MISC — JMU → Indiana transfer; rushing line is right, PPR receiving angle is not.
```

What changed / why:
```text
Rushing is right but receiving is wildly inflated. Actual receiving was 4-36-0, not 28-214-2.
```

Scouting report correction:
```text
Remove PPR receiving-dimension language.
```

Sources:
- https://cfbstats.com/2025/player/306/1118154/index.html

### 32. Chris Bell (WR)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2024: 43-737-4TD (17.1) | 2025: 72-917-6TD (12.7, 11g)
RUSH — 2-14-0TD (career)
MISC — Big outside WR, torn ACL ended 2025 early after 11 games
```

Final corrected full stat block to use:
```text
REC — 2024: 43-737-4TD (17.1) | 2025: 72-917-6TD (12.7)
RUSH — Do not include unsourced career rushing line as 2025 production
MISC — Louisville outside WR; torn ACL ended 2025 after 11 games.
```

What changed / why:
```text
Receiving line is correct. Rushing/career line is questionable; CFBS 2025 does not show rushing production. 100-catch/1,200-yard pace language is mathematically aggressive from 11 games.
```

Scouting report correction:
```text
Keep breakout/ACL framing, but soften pace language.
```

Sources:
- https://cfbstats.com/2025/player/367/1174703/index.html
- https://www.reuters.com/sports/report-louisville-wrdraft-prospect-chris-bell-has-torn-acl--flm-2025-12-11/

### 33. Eli Raridon (TE)

Accuracy: **Clean**  
Severity: **Clean**

Original screenshot text:
```text
REC — 2022-24 (career): 16-141-3TD | 2025: 32-482-0TD (15.1)
MISC — ND inline TE, breakout 2025, only 16 career catches before senior year
```

Final corrected full stat block to use:
```text
REC — 2022-24 career: 16-141-3TD | 2025: 32-482-0TD (15.1)
MISC — Notre Dame inline TE, late 2025 breakout. Stat block looked clean.
```

What changed / why:
```text
No meaningful stat correction identified.
```

Scouting report correction:
```text
No rewrite required based on stats.
```

Sources:
- https://cfbstats.com/2025/player/513/1175072/index.html

### 34. Brenen Thompson (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2023 (OKL): 7-241-2TD | 2024 (OKL): 19-230-2TD (12.1) | 2025 (MSS): 57-1054-6TD (18.5)
RUSH — 3-24-0TD (career)
MISC — Texas → Oklahoma → MSS, broke MSU single-season rec yds record, led SEC in 2025
```

Final corrected full stat block to use:
```text
REC — 2023 (Oklahoma): 7-241-2TD | 2024 (Oklahoma): 19-230-2TD (12.1) | 2025 (Mississippi State): 57-1054-6TD (18.5)
RUSH — 2025: 4-14-1TD
PR — 2025: 1-44-0TD
MISC — Texas → Oklahoma → Mississippi State, 7 total TDs in 2025.
```

What changed / why:
```text
Receiving is right, but rushing is wrong/incomplete and should include 1 rushing TD. Card should note 7 total TDs.
```

Scouting report correction:
```text
Keep one-year breakout framing, add rushing TD/return context.
```

Sources:
- https://cfbstats.com/2025/player/430/1178066/index.html

### 35. Jonah Coleman (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2022 (ARI): 75-372-4TD | 2023 (ARI): 128-871-5TD (6.8) | 2024 (UW): 195-1053-10TD (5.4) | 2025 (UW): 203-1128-11TD (5.6)
REC — 2023: 25-229-0TD | 2024: 15-89-1TD | 2025: 18-114-1TD
MISC — Arizona → Washington transfer, 200+ carry workhorse
```

Final corrected full stat block to use:
```text
RUSH — 2022 (Arizona): 75-372-4TD | 2023 (Arizona): 128-871-5TD (6.8) | 2024 (Washington): 193-1053-10TD (5.5) | 2025 (Washington): 156-758-15TD (4.9)
REC — 2023: 25-283-1TD | 2024: 23-177-0TD | 2025: 31-354-2TD
KR — 2025: 3-57-0TD
MISC — Washington RB; 17 total TDs in 2025, not a 1,100-yard rushing season.
```

What changed / why:
```text
2023 receiving, 2024 carries/receiving, and 2025 rushing/receiving were materially wrong.
```

Scouting report correction:
```text
Rewrite. He was TD-heavy and useful as receiver, not a 200-carry 1,128-yard workhorse in 2025.
```

Sources:
- https://cfbstats.com/2025/player/756/1173993/index.html

### 36. Cade Klubnik (QB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
PASS — 2025: 2,943 yds, 16 TD, 6 INT, 63.9%
RUSH — 2025: 78-284-5TD (3.6)
MISC — Clemson starter, dual-threat ability, regressed in 2025
```

Final corrected full stat block to use:
```text
PASS — 2025: 257-392, 2943 yds, 16 TD, 6 INT, 65.6%
RUSH — 2025: 83-94-4TD
MISC — Clemson starter, some mobility but not the displayed rushing floor.
```

What changed / why:
```text
Completion percentage and rushing line are wrong. Actual rushing is 83-94-4, not 78-284-5.
```

Scouting report correction:
```text
Remove strong dual-threat fantasy-floor language.
```

Sources:
- https://cfbstats.com/2025/player/147/1174174/index.html

### 37. Elijah Sarratt (WR)

Accuracy: **Wrong**  
Severity: **Minor**

Original screenshot text:
```text
REC — 2022 (SFU): 42-624-5TD | 2023 (JMU): 82-1191-8TD (14.5) | 2024: 53-957-8TD (18.1) | 2025: 65-830-15TD (12.8)
RUSH — 2-14-0TD (career)
MISC — Saint Francis → JMU → Indiana, 4 straight productive seasons, 2nd-team All-Big Ten (2025)
```

Final corrected full stat block to use:
```text
REC — 2022 (Saint Francis): 42-700-13TD | 2023 (JMU): 82-1191-8TD (14.5) | 2024 (Indiana): 53-957-8TD (18.1) | 2025 (Indiana): 65-830-15TD (12.8)
RUSH — 2022: 7-47-0TD | 2023: 1 rushing TD | 2025: no rushing production listed
MISC — Saint Francis → JMU → Indiana, productive transfer path.
```

What changed / why:
```text
2022 Saint Francis line was wrong and 2023 rushing TD was missing. 2023-25 receiving lines were otherwise clean.
```

Scouting report correction:
```text
Mostly fine; source early-career and rushing notes separately.
```

Sources:
- https://cfbstats.com/2025/player/306/1176682/index.html
- https://www.sports-reference.com/cfb/players/elijah-sarratt-1.html

### 38. Kaden Wetjen (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2025: 20-151-1TD (7.6)
KR/PR — 2025: 4 return TDs (3 PR, 1 KR)
MISC — Iowa walk-on, Jet Award winner (top return specialist), value is 100% special teams
```

Final corrected full stat block to use:
```text
REC — 2025: 20-151-1TD (7.6)
RUSH — 2025: 15-79-2TD
PR — 2025: 21-563-3TD
KR — 2025: 16-476-1TD
MISC — Iowa walk-on return specialist with rushing/gadget production.
```

What changed / why:
```text
Receiving/return TD summary is mostly right but incomplete. Exact PR/KR yardage and 2025 rushing production were missing.
```

Scouting report correction:
```text
In return-yardage formats, profile is stronger because of exact return yardage and rushing TDs.
```

Sources:
- https://cfbstats.com/2025/player/312/1174563/index.html

### 39. Mike Washington Jr. (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2025: 146-822-9TD (5.6)
REC — 2025: 12-89-0TD
MISC — One-year starter, SEC production
```

Final corrected full stat block to use:
```text
RUSH — 2025: 167-1070-8TD (6.4)
REC — 2025: 28-226-1TD
MISC — Arkansas one-year starter, 1,000-yard rusher with useful receiving production.
```

What changed / why:
```text
Both rushing and receiving were understated and TD count was off.
```

Scouting report correction:
```text
Rewrite. He had more explosiveness and receiving value than the card says.
```

Sources:
- https://cfbstats.com/2025/player/31/1121527/index.html
- https://arkansasrazorbacks.com/roster/mike-washington-jr/

### 40. Skyler Bell (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2024: 54-698-6TD (12.9) | 2025: 52-717-5TD (13.8)
RUSH — 2-12-0TD (career)
MISC — Wisconsin → UConn transfer, steady P5→G5 producer
```

Final corrected full stat block to use:
```text
REC — 2024 (UConn): 50-860-5TD | 2025 (UConn): 101-1278-13TD (12.7)
RUSH — 2025: 2-(-2)-0TD
MISC — Wisconsin → UConn transfer; Biletnikoff finalist/All-American caliber 2025.
```

What changed / why:
```text
2025 receiving line is badly understated. Actual is 101-1278-13, not 52-717-5.
```

Scouting report correction:
```text
Rewrite completely. He was not just a steady low-ceiling producer in 2025.
```

Sources:
- https://cfbstats.com/2025/player/164/1127654/index.html
- https://uconnhuskies.com/sports/football/roster/skyler-bell/14785

### 41. Matthew Hibner (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 18-192-2TD
MISC — Michigan → SMU, athletic but unproven
```

Final corrected full stat block to use:
```text
REC — 2024 (SMU): 24-368-4TD (15.3) | 2025 (SMU): 31-436-4TD (14.1)
MISC — Michigan → SMU transfer, late-career receiving TE breakout.
```

What changed / why:
```text
2025 receiving was badly understated and 2024 SMU production should be included.
```

Scouting report correction:
```text
Rewrite from unproven/non-producer to late-career receiving breakout.
```

Sources:
- https://cfbstats.com/2025/player/663/1112169/index.html
- https://smumustangs.com/sports/football/roster/matthew-hibner/14962

### 42. Bryce Lance (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2023: 33-605-11TD (18.3) | 2024: 48-757-7TD (15.8) | 2025: 52-821-9TD (15.8)
RUSH — 4-28-0TD (career)
MISC — Trey's brother, FCS dominator, 27 TDs in 3 seasons
```

Final corrected full stat block to use:
```text
REC — 2023: 1-7-0TD | 2024: 75-1071-17TD | 2025: 51-1079-8TD
RUSH — 2024: 1 rushing TD | 2025: 1 rushing TD
MISC — Trey Lance's brother, FCS All-American, back-to-back 1,000-yard seasons.
```

What changed / why:
```text
Entire three-year production arc is wrong. Career TD note should be 25 receiving TDs, or 27 total TDs only if including rushing.
```

Scouting report correction:
```text
Rewrite as a two-year FCS explosion after minimal 2023 receiving role.
```

Sources:
- https://gobison.com/sports/football/roster/bryce-lance/23084
- https://www.foxsports.com/college-football/bryce-lance-player-stats

### 43. Colbie Young (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2024 (UGA): 13-128-2TD | 2025 (UGA): 20-261-1TD (broken ankle vs Ole Miss)
MISC — Miami → Georgia, 116 career catches across 4 seasons, missed half of 2025
```

Final corrected full stat block to use:
```text
REC — 2023 (Miami): 47-563-5TD | 2024 (Georgia): 11-149-2TD | 2025 (Georgia): 26-358-1TD
MISC — Miami → Georgia transfer; 116-1446-13TD career if including 2022. Injury was leg fracture/broken leg, not broken ankle.
```

What changed / why:
```text
Georgia lines are wrong and injury is described wrong as broken ankle instead of leg fracture/broken leg.
```

Scouting report correction:
```text
Fix injury language and production totals.
```

Sources:
- https://cfbstats.com/2025/player/257/1179984/index.html
- https://www.espn.com/college-football/story/_/id/46673976/georgia-wr-colbie-young-indefinitely-leg-fracture

### 44. Reggie Virgil (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 48-833-7TD (17.4)
RUSH — 1-12-0TD
MISC — Small-school profile, elite YPR
```

Final corrected full stat block to use:
```text
REC — 2025: 57-705-6TD (12.4)
RUSH — 2025: 2-35-2TD
MISC — Texas Tech WR, vertical/size profile, 8 total TDs in 2025. Do not call small-school.
```

What changed / why:
```text
Receiving, rushing, and small-school/Air Raid framing are wrong/misleading.
```

Scouting report correction:
```text
Remove small-school label and tone down Air Raid dismissal.
```

Sources:
- https://cfbstats.com/2025/player/700/1177608/index.html

### 45. Justin Joly (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2024: 40-482-5TD (12.1) | 2025: 55-656-6TD (11.9)
MISC — UConn → NC State, productive move TE
```

Final corrected full stat block to use:
```text
REC — 2024 (NC State): 43-661-4TD (15.4) | 2025 (NC State): 49-489-7TD (10.0)
MISC — UConn → NC State transfer, 92-1150-11TD over two NC State seasons.
```

What changed / why:
```text
Both 2024 and 2025 receiving lines are wrong.
```

Scouting report correction:
```text
He became more TD-heavy but less explosive in 2025; do not describe yardage as ascending.
```

Sources:
- https://cfbstats.com/2025/player/490/1179773/index.html
- https://cfbstats.com/2024/player/490/1179773/receiving/situational.html

### 46. Max Bredeson (FB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2025: 18-62-2TD
REC — 2025: 8-52-1TD
MISC — Traditional fullback, lead blocker, special teams
```

Final corrected full stat block to use:
```text
RUSH — No rushing production
REC — 2025: 2-11-0TD
MISC — Traditional fullback/H-back, lead blocker and special teams player.
```

What changed / why:
```text
False rushing production and inflated receiving line.
```

Scouting report correction:
```text
Keep no-fantasy conclusion, but remove fake short-yardage production.
```

Sources:
- https://mgoblue.com/sports/football/roster/max-bredeson/26696

### 47. Emmett Johnson (RB)

Accuracy: **Mostly clean**  
Severity: **Minor wording**

Original screenshot text:
```text
RUSH — 2024: 124-627-5TD (5.1) | 2025: 251-1451-12TD (5.8)
REC — 2024: 12-67-0TD | 2025: 46-370-3TD
MISC — 1st-team AA 2025, 1,821 total yards from scrimmage, led nation in scrimmage yds/game
```

Final corrected full stat block to use:
```text
RUSH — 2024: 124-627-5TD (5.1) | 2025: 251-1451-12TD (5.8)
REC — 2024: 12-67-0TD | 2025: 46-370-3TD
MISC — 1st-team AA 2025, 1,821 yards from scrimmage, elite national RB production.
```

What changed / why:
```text
Stat block is clean. Only soften 'most in college football' unless sourced.
```

Scouting report correction:
```text
Use 'among national leaders' instead of absolute national-leader claim unless sourced.
```

Sources:
- https://cfbstats.com/2025/player/463/1174957/index.html

### 48. Tanner Koziol (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 14-112-1TD
MISC — Ball State → Houston, blocking TE
```

Final corrected full stat block to use:
```text
REC — 2024 (Ball State): 94-839-8TD | 2025 (Houston): 74-727-6TD
MISC — Ball State → Houston transfer, high-volume receiving TE.
```

What changed / why:
```text
Card is badly wrong. He was a major receiving TE, not blocking-only.
```

Scouting report correction:
```text
Full rewrite required.
```

Sources:
- https://cfbstats.com/2025/player/288/1174066/index.html

### 49. Nicholas Singleton (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2022: 156-1061-12TD (6.8) | 2023: 146-752-12TD (5.2) | 2024: 170-1099-14TD (6.5) | 2025: 123-549-7TD (4.5)
REC — 2022: 11-85-0TD | 2023: 41-362-1TD | 2024: 24-158-0TD | 2025: 11-72-0TD
MISC — Split backfield with Kaytron Allen all 4 years, PSU career record 45 rush TD
```

Final corrected full stat block to use:
```text
RUSH — 2022: 156-1061-12TD (6.8) | 2023: 171-752-8TD (4.4) | 2024: 172-1099-12TD (6.4) | 2025: 123-549-13TD (4.5)
REC — 2022: 11-85-1TD | 2023: 26-308-2TD | 2024: 41-375-5TD | 2025: 24-219-1TD
MISC — Split backfield with Kaytron Allen, Penn State career record 45 rushing TDs.
```

What changed / why:
```text
Many wrong career lines, especially 2023-2025 TDs and receiving.
```

Scouting report correction:
```text
Rewrite because receiving decline claim was based on wrong stats.
```

Sources:
- https://gopsusports.com/sports/football/roster/player/nicholas-singleton

### 50. Kendrick Law (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 49-632-5TD (12.9)
RUSH — 3-18-0TD
KR — 2025: 6-142-0TD
```

Final corrected full stat block to use:
```text
REC — 2025: 53-540-3TD (10.2)
RUSH — 2025: 8-53-0TD
KR/PR — 2025: 9 KR-174-0TD | 3 PR-8-0TD
MISC — Alabama → Kentucky transfer, slot/gadget/return profile.
```

What changed / why:
```text
Receiving, rushing, and return totals are wrong.
```

Scouting report correction:
```text
Revise because efficiency and TD production were overstated.
```

Sources:
- https://cfbstats.com/2025/player/334/1173934/index.html

### 51. Riley Nowakowski (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 11-89-0TD
MISC — Wisconsin → IU, fullback/H-back hybrid
```

Final corrected full stat block to use:
```text
REC — 2025: 32-387-2TD (12.1)
RUSH — 2025: 2-2-2TD
MISC — Wisconsin → Indiana transfer, FB/H-back/TE hybrid, second-team All-Big Ten media.
```

What changed / why:
```text
Receiving is badly understated and rushing TDs are missing.
```

Scouting report correction:
```text
Rewrite from negligible production to real hybrid red-zone/receiving role.
```

Sources:
- https://cfbstats.com/2025/player/306/1115461/index.html

### 52. Joe Royer (TE)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2025: 22-248-2TD (11.3)
MISC — Ohio State → Cincy, receiving TE only
```

Final corrected full stat block to use:
```text
REC — 2024 (Cincinnati): 50-521-3TD | 2025: 29-416-4TD (14.3)
MISC — Ohio State → Cincinnati transfer, 79-937-7TD over two Cincinnati seasons, receiving TE profile.
```

What changed / why:
```text
2025 receiving is understated.
```

Scouting report correction:
```text
Modest-production wording should be softened.
```

Sources:
- https://cfbstats.com/2025/player/140/1112756/index.html

### 53. Josh Cuevas (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 8-64-0TD
MISC — Cal Poly → Bama, blocking specialist
```

Final corrected full stat block to use:
```text
REC — 2025: 37-411-4TD (11.1)
RUSH — 2025: 1-7-0TD
MISC — Washington → Alabama transfer, lead TE role, Mackey Award Watch List.
```

What changed / why:
```text
Receiving is badly understated and transfer path/profile are wrong.
```

Scouting report correction:
```text
Full rewrite. He had a real receiving role.
```

Sources:
- https://cfbstats.com/2025/player/8/1125663/index.html

### 54. Adam Randall (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2025: 152-819-8TD (5.4)
REC — 2025: 9-61-0TD
MISC — Clemson bruiser, one-year sample
```

Final corrected full stat block to use:
```text
RUSH — 2025: 168-814-10TD (4.9)
REC — 2025: 36-254-3TD
KR — 2025: 9-213-0TD
MISC — Clemson power back, 13 total TDs, legit receiving usage.
```

What changed / why:
```text
Rushing TDs are wrong and receiving is massively understated.
```

Scouting report correction:
```text
Rewrite to include receiving/PPR value.
```

Sources:
- https://cfbstats.com/2025/player/147/1174150/index.html

### 55. Cyrus Allen (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 45-678-5TD (15.1)
RUSH — 1-7-0TD
MISC — Georgia Tech → Cincy, deep-ball speed
```

Final corrected full stat block to use:
```text
REC — 2025: 51-674-13TD (13.2)
RUSH — 2025: 7-20-0TD
MISC — Louisiana Tech → Texas A&M → Cincinnati, red-zone TD spike, 13 receiving TDs.
```

What changed / why:
```text
TD total and rushing line are wrong; transfer path also incomplete/wrong.
```

Scouting report correction:
```text
Rewrite around 13 receiving TDs, not 5 or 6.
```

Sources:
- https://cfbstats.com/2025/player/140/1174700/index.html

### 56. Kevin Coleman Jr. (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 52-712-6TD (13.7)
RUSH — 2-11-0TD
PR — 2025: 5-38-0TD
```

Final corrected full stat block to use:
```text
REC — 2025: 66-732-1TD (11.1)
RUSH — 2025: 9-76-0TD
PR — 2025: 15-189-1TD
MISC — Missouri slot/return option, high-catch-rate receiver, SEC punt-return production.
```

What changed / why:
```text
Receiving TDs, rushing, and punt-return totals are wrong.
```

Scouting report correction:
```text
Remove 6-TD receiver framing; emphasize volume and return TD.
```

Sources:
- https://cfbstats.com/2025/player/434/1178735/index.html

### 57. Cole Payton (QB)

Accuracy: **Mostly clean**  
Severity: **Minor precision**

Original screenshot text:
```text
PASS — 2025: 2,719 yds, 16 TD, 4 INT, 72.0%
RUSH — 2025: 136-777-13TD (5.7)
MISC — NDSU dual-threat, FCS 1st-team AA, Walter Payton Award finalist
```

Final corrected full stat block to use:
```text
PASS — 2025: 161-224, 2719 yds, 16 TD, 4 INT, 71.9%
RUSH — 2025: 136-777-13TD (5.7)
MISC — NDSU dual-threat, FCS first-team AA/Walter Payton finalist profile.
```

What changed / why:
```text
Basically clean. Completion percentage is 71.9%, not 72.0%, if being strict.
```

Scouting report correction:
```text
No substantive rewrite needed.
```

Sources:
- https://gobison.com/sports/football/roster/cole-payton/23101

### 58. Seydou Traore (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 10-88-1TD
MISC — International prospect, raw athlete
```

Final corrected full stat block to use:
```text
REC — 2025: 35-369-5TD (10.5)
MISC — Arkansas State → Mississippi State transfer, London-born TE, developmental receiving/blocking profile.
```

What changed / why:
```text
Receiving is badly understated.
```

Scouting report correction:
```text
Not just raw/stash-only based on 35-369-5 receiving.
```

Sources:
- https://cfbstats.com/2025/player/430/1121424/index.html

### 59. Taylen Green (QB)

Accuracy: **Clean**  
Severity: **Clean**

Original screenshot text:
```text
PASS — 2025: 2,714 yds, 19 TD, 11 INT, 60.7%
RUSH — 2025: 139-777-8TD (5.6)
MISC — Boise State → Arkansas, dual-threat, 6 games of 300+ pass yds in 2025
```

Final corrected full stat block to use:
```text
PASS — 2025: 198-326, 2714 yds, 19 TD, 11 INT, 60.7%
RUSH — 2025: 139-777-8TD (5.6)
MISC — Boise State → Arkansas dual-threat QB. Stat block looked clean.
```

What changed / why:
```text
No correction needed.
```

Scouting report correction:
```text
No rewrite required based on stats.
```

Sources:
- https://cfbstats.com/2025/player/31/1121472/index.html

### 60. Bauer Sharp (TE)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2025: 15-134-1TD
MISC — Oklahoma → LSU, blocking/inline TE
```

Final corrected full stat block to use:
```text
REC — 2024 (Oklahoma): 42-324-2TD | 2025 (LSU): 24-252-2TD
MISC — Southeastern Louisiana → Oklahoma → LSU, converted QB, inline/move TE with blocking value.
```

What changed / why:
```text
2025 receiving is understated and 2024 Oklahoma receiving context is missing.
```

Scouting report correction:
```text
Do not label no-fantasy blocking-only solely from wrong 15-134-1 line.
```

Sources:
- https://cfbstats.com/2025/player/365/1127800/index.html

### 61. Kaytron Allen (RB)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
RUSH — 2022: 867 yds, 10 TD | 2023: 904 yds, 6 TD | 2024: 195-1108-8TD (5.7) | 2025: 1,303 yds, 15 TD
REC — 2024: 18-124-0TD | 2025: 22-152-1TD
MISC — Singleton's PSU backfield mate, took over lead role in 2025, 3rd-team AA
```

Final corrected full stat block to use:
```text
RUSH — 2022: 167-867-10TD (5.2) | 2023: 172-902-6TD (5.2) | 2024: 220-1108-8TD (5.0) | 2025: 210-1303-15TD (6.2)
REC — 2024: 18-153-2TD | 2025: 18-68-0TD
MISC — Singleton's PSU backfield mate, took over lead role in 2025, Penn State's all-time rushing leader.
```

What changed / why:
```text
2024 carries/YPC and both receiving lines are wrong.
```

Scouting report correction:
```text
Receving boost in original is overstated.
```

Sources:
- https://cfbstats.com/2024/player/539/1175170/index.html
- https://www.sports-reference.com/cfb/players/kaytron-allen-1.html

### 62. Barion Brown (WR)

Accuracy: **Mostly clean**  
Severity: **Incomplete**

Original screenshot text:
```text
REC — 2025 (LSU): 53-532-1TD (10.0)
KR — Career: 6 KR TDs (SEC record), incl. 99-yd return
MISC — Kentucky → LSU, value is elite return ability, modest receiver
```

Final corrected full stat block to use:
```text
REC — 2025 (LSU): 53-532-1TD (10.0)
RUSH — 2025: 3-33-0TD
KR — 2025: 15-445-1TD | Career: 65-1910-6TD
MISC — Kentucky → LSU transfer, SEC career record 6 kickoff return TDs, elite return specialist.
```

What changed / why:
```text
Receiving/career KR note mostly right, but card misses 2025 rushing and exact kickoff return line.
```

Scouting report correction:
```text
Add exact 2025 KR and rushing usage.
```

Sources:
- https://cfbstats.com/2025/player/365/1177540/index.html

### 63. Josh Cameron (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 55-808-7TD (14.7)
RUSH — 2-9-0TD
MISC — UCF → Baylor, slot producer
```

Final corrected full stat block to use:
```text
REC — 2025: 69-872-9TD (12.6)
RUSH — No meaningful rushing production
PR — 2025: 18-141-0TD
MISC — UCF → Baylor transfer, high-volume slot/return producer.
```

What changed / why:
```text
Receiving is wrong, rushing is wrong, and punt-return production is missing.
```

Scouting report correction:
```text
Update volume and return profile.
```

Sources:
- https://cfbstats.com/2025/player/51/1127885/index.html

### 64. Malik Benson (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 42-628-4TD (15.0)
RUSH — 1-6-0TD
MISC — JUCO → Alabama → Oregon, deep-ball specialist
```

Final corrected full stat block to use:
```text
REC — 2025: 43-719-6TD (16.7)
RUSH — 2025: 1-(-4)-0TD
PR — 2025: 9-161-1TD
MISC — JUCO → Alabama → Oregon, vertical WR/return profile.
```

What changed / why:
```text
Receiving, rushing, and punt-return TD are wrong/missing.
```

Scouting report correction:
```text
Upgrade vertical production and add PR TD.
```

Sources:
- https://cfbstats.com/2025/player/529/1202389/index.html

### 65. CJ Daniels (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 48-712-6TD (14.8)
RUSH — 1-(-2)-0TD
MISC — Liberty → Miami, G5 → P5 step up
```

Final corrected full stat block to use:
```text
REC — 2023 (Liberty): 55-1067-10TD | 2024 (LSU): 42-480-0TD | 2025 (Miami): 50-557-7TD (11.1)
RUSH — No meaningful rushing production
MISC — Liberty → LSU → Miami transfer, possession/contested-catch profile.
```

What changed / why:
```text
2025 receiving is wrong, rushing is wrong, and transfer path is incomplete.
```

Scouting report correction:
```text
Rewrite as possession/contested-catch profile rather than 712-yard vertical step-up.
```

Sources:
- https://cfbstats.com/2025/player/415/1111757/index.html

### 66. Demond Claiborne (RB)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
RUSH — 2024: 228-1049-11TD (4.6) | 2025: 179-907-10TD (5.1)
REC — 2024: 14-98-0TD | 2025: 19-131-1TD
MISC — Wake Forest workhorse, 21 TDs in 2 seasons
```

Final corrected full stat block to use:
```text
RUSH — 2024: 228-1049-11TD (4.6) | 2025: 179-907-10TD (5.1)
REC — 2024: 23-254-2TD | 2025: 28-140-0TD
KR — 2024: 11-277-1TD
MISC — Wake Forest workhorse, 21 rushing TDs and 24 total TDs over 2024-25.
```

What changed / why:
```text
Rushing is right, but receiving lines and return context are wrong/missing.
```

Scouting report correction:
```text
Clarify 21 rushing TDs vs 24 total TDs.
```

Sources:
- https://cfbstats.com/2024/player/749/1175632/index.html
- https://www.sports-reference.com/cfb/players/demond-claiborne-1.html

### 67. Emmanuel Henderson Jr. (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2025: 38-588-4TD (15.5)
KR — 2025: 7-161-0TD
MISC — Alabama → Kansas, speed/return profile
```

Final corrected full stat block to use:
```text
REC — 2025: 45-766-5TD (17.0)
RUSH — 2025: 4-16-0TD
KR — 2025: 18-455-1TD
MISC — Alabama → Kansas transfer, speed/return profile, 1,237 all-purpose yards.
```

What changed / why:
```text
Receiving and KR totals are wrong.
```

Scouting report correction:
```text
Return value and receiving efficiency should be upgraded.
```

Sources:
- https://kuathletics.com/sports/football/roster/emmanuel-henderson-jr-/16265

### 68. CJ Williams (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 42-545-3TD (13.0)
MISC — USC → Stanford, possession profile
```

Final corrected full stat block to use:
```text
REC — 2025: 59-749-6TD (12.7)
MISC — USC → Wisconsin → Stanford transfer, honorable mention All-ACC, Stanford's leading WR in 2025.
```

What changed / why:
```text
Receiving is badly understated and transfer path incomplete.
```

Scouting report correction:
```text
Rewrite from complementary low-volume piece to Stanford's leading WR.
```

Sources:
- https://cfbstats.com/2025/player/674/1175260/index.html

### 69. Lewis Bond (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 56-729-5TD (13.0)
MISC — Steady BC producer, reliable hands
```

Final corrected full stat block to use:
```text
REC — 2025: 88-993-1TD (11.3)
RUSH — 2025: 4-3-0TD
MISC — Boston College high-volume possession receiver, BC all-time receptions leader.
```

What changed / why:
```text
Catch/yards badly understated and TD count overstated.
```

Scouting report correction:
```text
Rewrite around high-volume possession profile, not 5-TD efficiency.
```

Sources:
- https://cfbstats.com/2025/player/67/1121477/index.html

### 70. Trey Smack (K)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
FG — 2025: 22-27 (81.5%), long 56 | XP: 48-48
KO — 2025: 82.4% touchbacks
MISC — Lou Groza finalist, reliable leg
```

Final corrected full stat block to use:
```text
FG — 2025: 18-22 (81.8%), long 56 | XP: 27-28
KO — 2025: 46 touchbacks on 60 kickoffs (76.7%)
MISC — Lou Groza finalist, 53-64 career FG, 100-101 career XP, reliable long-range leg.
```

What changed / why:
```text
FG/XP and touchback totals are wrong.
```

Scouting report correction:
```text
Fix kicking volume and touchback rate.
```

Sources:
- https://cfbstats.com/2025/player/235/1174350/index.html

### 71. Anthony Smith (WR)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 60-882-7TD (14.7)
KR — 2025: 5-112-0TD
MISC — G5 producer, return upside
```

Final corrected full stat block to use:
```text
REC — 2025: 64-1053-7TD (16.5)
RUSH — 2025: 1-45-1TD
KR — No 2025 kick-return production listed
MISC — ECU deep threat, Military Bowl MVP, 1,053-yard senior season.
```

What changed / why:
```text
Receiving total is wrong, KR line appears false, and rushing TD is missing.
```

Scouting report correction:
```text
Remove return-upside basis unless sourced; upgrade deep-threat receiving production.
```

Sources:
- https://cfbstats.com/2025/player/196/1112570/receiving/situational.html

### 72. Jack Endries (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 20-198-2TD
MISC — Cal → Texas, possession TE
```

Final corrected full stat block to use:
```text
REC — 2025: 33-346-3TD (10.5)
MISC — Cal → Texas transfer, possession TE, moderate receiving role.
```

What changed / why:
```text
2025 receiving line is understated.
```

Scouting report correction:
```text
Modest profile can remain, but not replacement-level 20-198 production.
```

Sources:
- https://cfbstats.com/2025/player/703/1179695/index.html

### 73. Athan Kaliakmanis (QB)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
PASS — 2025: 3,124 yds, 20 TD, 7 INT (best season of career)
RUSH — 2025: 56-98-2TD
MISC — Minnesota → Rutgers, career 8,604 yds/55 TDs in 48 games
```

Final corrected full stat block to use:
```text
PASS — 2025: 229-368, 3124 yds, 20 TD, 7 INT, 62.2%
RUSH — 2025: 96-(-26)-4TD
MISC — Minnesota → Rutgers transfer, best passing season of career, limited fantasy rushing value.
```

What changed / why:
```text
Passing yards/TD/INT are right, but completion percentage is missing/wrong and rushing line is badly wrong.
```

Scouting report correction:
```text
Keep pocket-passer framing, but correct rushing TDs/negative yards.
```

Sources:
- https://cfbstats.com/2025/player/587/1122162/index.html

### 74. Jaren Kanak (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 6-48-0TD
MISC — Former LB convert, special-teams only
```

Final corrected full stat block to use:
```text
REC — 2025: 44-533-0TD (12.1)
MISC — Former LB convert, Oklahoma receiving TE, athletic developmental profile.
```

What changed / why:
```text
Receiving is massively understated; he was not special-teams-only.
```

Scouting report correction:
```text
Full rewrite required.
```

Sources:
- https://cfbstats.com/2025/player/522/1175131/receiving/situational.html

### 75. Eli Heidenreich (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2025: 142-687-8TD (4.8)
REC — 2025: 8-52-0TD
MISC — Service academy, limited NFL upside but productive
```

Final corrected full stat block to use:
```text
RUSH — 2025: 77-499-3TD (6.5)
REC — 2025: 51-941-6TD (18.5)
MISC — Navy utility weapon, slotback/receiver hybrid, 1,440 yards from scrimmage.
```

What changed / why:
```text
Profile is backwards. He was a major receiving/utility weapon, not just a Navy rushing back.
```

Scouting report correction:
```text
Full rewrite required.
```

Sources:
- https://cfbstats.com/2025/player/726/1178217/index.html

### 76. Behren Morton (QB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
PASS — 2025: 2,944 yds, 21 TD, 9 INT, 64.7%
RUSH — 2025: 42-62-1TD
MISC — Air Raid product, quick release, limited arm strength
```

Final corrected full stat block to use:
```text
PASS — 2025: 219-332, 2780 yds, 22 TD, 6 INT, 66.0%
RUSH — 2025: 43-(-113)-0TD
MISC — Texas Tech passer, efficient senior season, no fantasy rushing floor.
```

What changed / why:
```text
Passing and rushing lines are wrong, especially rushing due to sack yardage.
```

Scouting report correction:
```text
Update efficiency and no-rushing-floor language.
```

Sources:
- https://cfbstats.com/2025/player/700/1122699/index.html

### 77. Seth McGowan (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2025: 189-1025-11TD (5.4)
REC — 2025: 14-98-1TD
MISC — Former Oklahoma signee, JUCO → Kentucky
```

Final corrected full stat block to use:
```text
RUSH — 2025: 165-725-12TD (4.4)
REC — 2025: 19-126-0TD
MISC — Former Oklahoma signee, JUCO → Kentucky, TD-heavy SEC back.
```

What changed / why:
```text
Rushing and receiving totals are wrong.
```

Scouting report correction:
```text
Remove 1,000-yard season framing.
```

Sources:
- https://cfbstats.com/2025/player/334/1112820/index.html

### 78. Jam Miller (RB)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
RUSH — 2025: 164-882-9TD (5.4)
REC — 2025: 11-72-0TD
MISC — Alabama committee back, took lead in 2025
```

Final corrected full stat block to use:
```text
RUSH — 2025: 130-504-3TD (3.9)
REC — 2025: 19-109-0TD
MISC — Alabama committee back, modest senior-year production.
```

What changed / why:
```text
Rushing production is badly inflated and receiving is understated.
```

Scouting report correction:
```text
Full rewrite; he did not have the displayed lead-back production.
```

Sources:
- https://cfbstats.com/2025/player/8/1173933/index.html

### 79. Carsen Ryan (TE)

Accuracy: **Wrong**  
Severity: **Major**

Original screenshot text:
```text
REC — 2025: 9-72-1TD
MISC — UCLA → BYU, blocking TE
```

Final corrected full stat block to use:
```text
REC — 2025: 45-620-3TD (13.8)
PR — 2025: 1-14-0TD
MISC — UCLA → BYU transfer, productive receiving TE, not blocking-only.
```

What changed / why:
```text
2025 receiving line is badly understated.
```

Scouting report correction:
```text
Full rewrite; not a blocking-only TE.
```

Sources:
- https://cfbstats.com/2025/player/77/1179713/receiving/split.html

### 80. Garrett Nussmeier (QB)

Accuracy: **Wrong**  
Severity: **Minor to moderate**

Original screenshot text:
```text
PASS — 2025: 1,927 yds, 12 TD, 5 INT, 67.4% (9 games, benched with abdominal injury)
RUSH — 2025: 38-28-1TD
MISC — LSU gunslinger, lost starting job mid-2025, injury/inconsistency concerns
```

Final corrected full stat block to use:
```text
PASS — 2025: 194-288, 1927 yds, 12 TD, 5 INT, 67.4%
RUSH — 2025: 29-(-57)-1TD
MISC — LSU QB, 9-game 2025 season, limited rushing value.
```

What changed / why:
```text
Passing line is mostly correct, but rushing is wrong. Scouting text contradicted stats by referencing 24 TDs and 11 INTs.
```

Scouting report correction:
```text
Either discuss only the 2025 line or clearly separate career/profile discussion.
```

Sources:
- https://cfbstats.com/2025/player/365/1122032/index.html

### 81. Deion Burks (WR)

Accuracy: **Wrong**  
Severity: **Moderate**

Original screenshot text:
```text
REC — 2025: 38-512-4TD (13.5)
MISC — Purdue → Oklahoma, slot-only profile
```

Final corrected full stat block to use:
```text
REC — 2023 (Purdue): 47-629-7TD (13.4) | 2024 (Oklahoma): 31-245-3TD (7.9) | 2025 (Oklahoma): 57-620-4TD (10.9)
RUSH — 2023: 4-12-0TD | 2024: 5-32-0TD | 2025: 6-(-1)-0TD
MISC — Purdue → Oklahoma slot/underneath receiver with more volume than card shows.
```

What changed / why:
```text
Receiving catches/yards are understated and rushing line is missing.
```

Scouting report correction:
```text
Change 'below-average YPR 13.5' logic because actual YPR is 10.9, but volume was 57 catches rather than 38.
```

Sources:
- https://cfbstats.com/2025/player/522/1122498/index.html
- https://cfbstats.com/2025/player/522/1122498/receiving/situational.html


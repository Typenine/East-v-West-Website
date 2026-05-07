'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, X, Check, RotateCcw, Save, Settings, AlertCircle } from 'lucide-react';

const C = {
  bg: '#0B1020',
  bgGrad: '#151b2e',
  panel: '#111727',
  border: '#1E2637',
  primary: '#be161e',
  accent: '#bf9944',
  text: '#E9EDF5',
  textMuted: '#9AA5B1',
  textDim: '#7f8995',
  unlikely: '#c5acd6',
  unlikelyBg: 'rgba(197, 172, 214, 0.10)',
  noFit: '#e89a98',
  noFitBg: 'rgba(232, 154, 152, 0.10)',
  target: '#7dd4a8',
  targetBg: 'rgba(125, 212, 168, 0.13)',
  warning: '#e8b87a',
};

const POS_COLORS: Record<string, string> = {
  QB: '#c25852', RB: '#4a8e62', WR: '#3d7eaa', TE: '#9070b8', K: '#788896', FB: '#a07d4c',
};

type BoardPlayer = {
  id: string;
  tier: number;
  name: string;
  pos: string;
  team: string;
  college: string;
  pick: number;
  s: string[];
  unlikely?: boolean;
  noFit?: boolean;
  target?: boolean;
  userNote?: string;
};

const INITIAL: BoardPlayer[] = [
  { id: 'love', tier: 1, name: 'Jeremiyah Love', pos: 'RB', team: 'ARI', college: 'Notre Dame', pick: 3, s: ['RUSH — 2023: 71-385-1TD (5.4) | 2024: 163-1125-17TD (6.9) | 2025: 199-1372-18TD (6.9)', 'REC  — 2023: 8-67-0TD | 2024: 28-237-2TD | 2025: 27-280-3TD', 'MISC — 2 KR TDs (2024), 1 PR TD (2025), Doak Walker Award (2025)'] },
  { id: 'mendoza', tier: 1, name: 'Fernando Mendoza', pos: 'QB', team: 'LV', college: 'Indiana', pick: 1, s: ['PASS — 2023 (Cal): 1,708 yds, 14 TD, 10 INT, 63.0% | 2024 (Cal): 3,004 yds, 16 TD, 6 INT, 68.7% | 2025 (IND): 3,724 yds, 41 TD, 6 INT, 72.0%', 'RUSH — 2023: 49-86-2TD | 2024: 87-105-2TD | 2025: 89-312-6TD', 'MISC — Indiana single-season TD record (41), CFP semifinal'] },
  { id: 'tate', tier: 1, name: 'Carnell Tate', pos: 'WR', team: 'TEN', college: 'Ohio State', pick: 4, s: ['REC  — 2023: 18-264-1TD (14.7) | 2024: 52-733-4TD (14.1) | 2025: 52-895-9TD (17.2)', 'RUSH — 3 jet-sweep attempts, 28 yds (career)', 'MISC — 9 catches of 40+ yds in 2025, 2nd-team AA'] },
  { id: 'tyson', tier: 1, name: 'Jordyn Tyson', pos: 'WR', team: 'NO', college: 'Arizona State', pick: 8, s: ['REC  — 2022 (CU): 22-470-5TD (21.4) | 2023: knee injury, DNP | 2024 (ASU): 75-1101-10TD (14.7) | 2025 (ASU): 61-711-8TD (11.7)', 'RUSH — 5-42-0TD (2024), 3-19-0TD (2025)', 'MISC — Led Big 12 in rec (136) over 2024-25'] },
  { id: 'lemon', tier: 1, name: 'Makai Lemon', pos: 'WR', team: 'PHI', college: 'USC', pick: 20, s: ['REC  — 2023: 6-88-0TD (14.7) | 2024: 52-764-6TD (14.7) | 2025: 79-1156-11TD (14.6) — Biletnikoff', 'RUSH — 7-58-0TD (career)', 'KR   — 19-514 (27.1 avg), long 80 yds', 'MISC — 1st-team AA in 2025, Biletnikoff Award winner'] },
  { id: 'price', tier: 2, name: 'Jadarian Price', pos: 'RB', team: 'SEA', college: 'Notre Dame', pick: 32, s: ['RUSH — 2023: Achilles, DNP | 2024: 108-746-7TD (6.9) | 2025: 113-674-11TD (6.0)', 'REC  — 2024: 14-112-0TD | 2025: 22-187-2TD', 'MISC — Achilles tear Oct 2023, returned Aug 2024'] },
  { id: 'concepcion', tier: 2, name: 'KC Concepcion', pos: 'WR', team: 'CLE', college: 'Texas A&M', pick: 24, s: ['REC  — 2023 (NCST): 64-767-10TD (12.0) | 2024 (NCST): 53-460-6TD (8.7) | 2025 (TAMU): 61-919-12TD (15.1)', 'RUSH — 2023: 38-297-2TD | 2024: 22-59-0TD | 2025: 5-41-0TD', 'PR   — 2023: 12-148-1TD | 2024: 8-72-0TD', 'MISC — ACC Rookie of the Year (2023), consensus AA all-purpose (2025)'] },
  { id: 'sadiq', tier: 2, name: 'Kenyon Sadiq', pos: 'TE', team: 'NYJ', college: 'Oregon', pick: 16, s: ['REC  — 2023: 5-24-1TD | 2024: 24-308-2TD (12.8) | 2025: 51-560-8TD (11.0)', 'RUSH — 1-4-0TD (career gadget)', 'MISC — 6\'3" 241 lbs, Big Ten TE of the Year (2025), 2nd-team AA'] },
  { id: 'simpson', tier: 2, name: 'Ty Simpson', pos: 'QB', team: 'LAR', college: 'Alabama', pick: 13, s: ['PASS — 2023-24: backup (29 att total) | 2025: 3,567 yds, 28 TD, 5 INT, 64.5%', 'RUSH — 2025: 62-287-5TD (4.6 avg)', 'MISC — 5-star recruit, sat behind Milroe for 2 years, CFP semifinal'] },
  { id: 'cooper', tier: 2, name: 'Omar Cooper Jr.', pos: 'WR', team: 'NYJ', college: 'Indiana', pick: 30, s: ['REC  — 2023: 18-267-2TD (14.8) | 2024: 28-594-7TD (21.2) | 2025: 69-937-13TD (13.6)', 'RUSH — 75-yd rush TD (2025), longest by IU WR since 2014', 'MISC — PFF 87.8 grade in 2025, led Indiana national championship team in targets/catches/yards'] },
  { id: 'stowers', tier: 3, name: 'Eli Stowers', pos: 'TE', team: 'PHI', college: 'Vanderbilt', pick: 54, s: ['REC  — 2024: 50-644-5TD (12.9) | 2025: 62-769-4TD (12.4)', 'RUSH — 2-8-0TD (career)', 'MISC — Texas A&M → Vandy, Mackey Award winner (2025), 1st-team AA'] },
  { id: 'beck', tier: 3, name: 'Carson Beck', pos: 'QB', team: 'ARI', college: 'Miami', pick: 65, s: ['PASS — 2024 (UGA): 3,485 yds, 28 TD, 12 INT, 64.2% | 2025 (Miami): 3,813 yds, 30 TD, 12 INT, 72.4%', 'RUSH — 2024: 28-(-18)-0TD | 2025: 34-12-1TD', 'MISC — Georgia → Miami transfer, classic pocket passer'] },
  { id: 'fields', tier: 3, name: 'Malachi Fields', pos: 'WR', team: 'NYG', college: 'Notre Dame', pick: 74, s: ['REC  — 2023 (UVA): 58-811-5TD (14.0) | 2024 (UVA): 55-808-7TD (14.7) | 2025 (ND): 36-630-5TD (17.5)', 'RUSH — 3-22-0TD (career)', 'MISC — Grad transfer to ND for 2025, consistent 800+ yds at UVA'] },
  { id: 'branch', tier: 3, name: 'Zachariah Branch', pos: 'WR', team: 'ATL', college: 'Georgia', pick: 79, s: ['REC  — 2023 (USC): 31-320-2TD (10.3) | 2024 (USC): 47-503-1TD (10.7) | 2025 (UGA): 81-811-6TD (10.0)', 'RUSH — 2023: 4-63-0TD | 2025: 3-18-0TD', 'KR/PR — 2023: 2 KR TD, 1 PR TD | 2024: 1 KR TD | 2025: 10 KR for 205 yds'] },
  { id: 'lane', tier: 3, name: 'Ja\'Kobi Lane', pos: 'WR', team: 'BAL', college: 'USC', pick: 80, s: ['REC  — 2023: 2-28-0TD | 2024: 43-525-12TD (12.2, 13g) | 2025: 47-810-6TD (17.2)', 'RUSH — 2-12-0TD (career)', 'MISC — 6\'4" red-zone specialist, 12 TDs on 43 catches in 2024'] },
  { id: 'hurst', tier: 3, name: 'Ted Hurst', pos: 'WR', team: 'TB', college: 'Georgia State', pick: 84, s: ['REC  — 2022-23 (prev school): 60-1027-10TD | 2024 (GSU): 56-961-9TD (17.2) | 2025 (GSU): 74-1202-13TD (16.2)', 'RUSH — 5-33-0TD (career)', 'MISC — Transferred to GSU in 2024, Sun Belt record 22 TDs in 2 seasons'] },
  { id: 'sarratt', tier: 3, name: 'Elijah Sarratt', pos: 'WR', team: 'BAL', college: 'Indiana', pick: 115, s: ['REC  — 2022 (SFU): 42-624-5TD | 2023 (JMU): 82-1191-8TD (14.5) | 2024: 53-957-8TD (18.1) | 2025: 65-830-15TD (12.8)', 'RUSH — 2-14-0TD (career)', 'MISC — Saint Francis → JMU → Indiana, 4 straight productive seasons, 2nd-team All-Big Ten (2025)'] },
  { id: 'singleton', tier: 3, name: 'Nicholas Singleton', pos: 'RB', team: 'TEN', college: 'Penn State', pick: 165, s: ['RUSH — 2022: 156-1061-12TD (6.8) | 2023: 146-752-12TD (5.2) | 2024: 170-1099-14TD (6.5) | 2025: 123-549-7TD (4.5)', 'REC  — 2022: 11-85-0TD | 2023: 41-362-1TD | 2024: 24-158-0TD | 2025: 11-72-0TD', 'MISC — Split backfield with Kaytron Allen all 4 years, PSU career record 45 rush TD'] },
  { id: 'stribling', tier: 4, name: 'De\'Zhaun Stribling', pos: 'WR', team: 'SF', college: 'Ole Miss', pick: 33, s: ['REC  — 2023 (WSU): 63-729-4TD (11.6) | 2024: 34-488-3TD (14.4) | 2025: 54-800-6TD (14.8)', 'RUSH — 2-11-0TD (career)', 'MISC — WSU → Ole Miss transfer, dip in 2024 with new QB'] },
  { id: 'boston', tier: 4, name: 'Denzel Boston', pos: 'WR', team: 'CLE', college: 'Washington', pick: 39, s: ['REC  — 2023: 5-51-0TD | 2024: 63-834-9TD (13.2) | 2025: 60-821-12TD (13.7)', 'RUSH — 2-(-3)-0TD (career)', 'MISC — 21 TDs in 2 seasons after waiting behind Odunze/McMillan/Polk, elite red-zone rate'] },
  { id: 'bernard', tier: 4, name: 'Germie Bernard', pos: 'WR', team: 'PIT', college: 'Alabama', pick: 47, s: ['REC  — 2023 (UW): 41-419-1TD (10.2) | 2024 (UW): 50-685-5TD (13.7) | 2025 (BAMA): 60-813-7TD (13.6)', 'RUSH — 3-22-0TD (career)', 'KR/PR — 2024: 8-167-0TD KR | 2025: limited'] },
  { id: 'klare', tier: 4, name: 'Max Klare', pos: 'TE', team: 'LAR', college: 'Ohio State', pick: 61, s: ['REC  — 2024 (PUR): 51-685-4TD (13.4) | 2025 (OSU): 43-448-2TD (10.4)', 'MISC — Purdue → OSU, 1st-team All-Big Ten (2025), crowded OSU target share'] },
  { id: 'roush', tier: 4, name: 'Sam Roush', pos: 'TE', team: 'CHI', college: 'Stanford', pick: 69, s: ['REC  — 2025: 38-423-3TD (11.1)', 'MISC — Stanford legacy, possession TE profile'] },
  { id: 'williams-antonio', tier: 4, name: 'Antonio Williams', pos: 'WR', team: 'WAS', college: 'Clemson', pick: 71, s: ['REC  — 2023: 20-351-4TD (17.6) | 2024: 75-904-11TD (12.1) | 2025: 55-604-4TD (11.0)', 'RUSH — 3-17-0TD (career)', 'PR   — 2024: 10-89-0TD | 2025: 8-61-0TD'] },
  { id: 'delp', tier: 4, name: 'Oscar Delp', pos: 'TE', team: 'NO', college: 'Georgia', pick: 73, s: ['REC  — 2023: 24-284-2TD | 2024: 21-248-4TD | 2025: 20-261-1TD', 'MISC — UGA TE, 70-854-8TD career, red-zone upside in run-heavy O'] },
  { id: 'douglas', tier: 4, name: 'Caleb Douglas', pos: 'WR', team: 'MIA', college: 'Texas Tech', pick: 75, s: ['REC  — 2023: 11-154-1TD (14.0) | 2024: 40-670-5TD (16.8) | 2025: 52-853-7TD (16.4)', 'RUSH — 1-8-0TD (career)', 'MISC — Breakout in 2024 after early career silence'] },
  { id: 'allar', tier: 4, name: 'Drew Allar', pos: 'QB', team: 'PIT', college: 'Penn State', pick: 76, s: ['PASS — 2024: 3,327 yds, 24 TD, 8 INT, 63.4% | 2025: 1,100 yds, 8 TD, 3 INT (9 games)', 'RUSH — 2024: 52-82-3TD | 2025: limited', 'MISC — Broken ankle Nov 2025 (season-ending surgery), PSU career 7,402 yds/61 TD'] },
  { id: 'brazzell', tier: 4, name: 'Chris Brazzell II', pos: 'WR', team: 'CAR', college: 'Tennessee', pick: 83, s: ['REC  — 2023 (Tul): 40-711-5TD (17.8) | 2024: 24-422-4TD (17.6) | 2025: 46-645-6TD (14.0)', 'RUSH — 1-9-0TD (career)', 'MISC — Tulane → Tennessee, deep-ball specialist early, expanded route tree'] },
  { id: 'raridon', tier: 4, name: 'Eli Raridon', pos: 'TE', team: 'NE', college: 'Notre Dame', pick: 95, s: ['REC  — 2022-24 (career): 16-141-3TD | 2025: 32-482-0TD (15.1)', 'MISC — ND inline TE, breakout 2025, only 16 career catches before senior year'] },
  { id: 'coleman-jonah', tier: 4, name: 'Jonah Coleman', pos: 'RB', team: 'DEN', college: 'Washington', pick: 108, s: ['RUSH — 2022 (ARI): 75-372-4TD | 2023 (ARI): 128-871-5TD (6.8) | 2024 (UW): 195-1053-10TD (5.4) | 2025 (UW): 203-1128-11TD (5.6)', 'REC  — 2023: 25-229-0TD | 2024: 15-89-1TD | 2025: 18-114-1TD', 'MISC — Arizona → Washington transfer, 200+ carry workhorse'] },
  { id: 'klubnik', tier: 4, name: 'Cade Klubnik', pos: 'QB', team: 'NYJ', college: 'Clemson', pick: 110, s: ['PASS — 2025: 2,943 yds, 16 TD, 6 INT, 63.9%', 'RUSH — 2025: 78-284-5TD (3.6)', 'MISC — Clemson starter, dual-threat ability, regressed in 2025'] },
  { id: 'lance', tier: 4, name: 'Bryce Lance', pos: 'WR', team: 'NO', college: 'NDSU', pick: 136, s: ['REC  — 2023: 33-605-11TD (18.3) | 2024: 48-757-7TD (15.8) | 2025: 52-821-9TD (15.8)', 'RUSH — 4-28-0TD (career)', 'MISC — Trey\'s brother, FCS dominator, 27 TDs in 3 seasons'] },
  { id: 'boerkircher', tier: 5, name: 'Nate Boerkircher', pos: 'TE', team: 'JAX', college: 'Texas A&M', pick: 56, s: ['REC  — 2024: 18-178-2TD | 2025: 24-218-3TD', 'MISC — Blocking-first TE, limited receiving ceiling'] },
  { id: 'klein', tier: 5, name: 'Marlin Klein', pos: 'TE', team: 'HOU', college: 'Michigan', pick: 59, s: ['REC  — 2025: 32-428-3TD (13.4)', 'MISC — German import, basketball background, raw but athletic'] },
  { id: 'kacmarek', tier: 5, name: 'Will Kacmarek', pos: 'TE', team: 'MIA', college: 'Ohio State', pick: 87, s: ['REC  — 2025: 12-98-1TD', 'MISC — Ohio → OSU transfer, blocking TE only'] },
  { id: 'thomas', tier: 5, name: 'Zavion Thomas', pos: 'WR', team: 'CHI', college: 'LSU', pick: 89, s: ['REC  — 2024: 32-432-2TD (13.5) | 2025: 45-612-4TD (13.6)', 'PR   — 2025: 8-74-0TD', 'MISC — Mississippi State → LSU, slot/return option'] },
  { id: 'black', tier: 5, name: 'Kaelon Black', pos: 'RB', team: 'SF', college: 'Indiana', pick: 90, s: ['RUSH — 2024: 251 yds, 2 TD (backup role) | 2025: 1,040 yds, 10 TD (5.6 avg)', 'REC  — 2025: 28-214-2TD', 'MISC — JMU → IU transfer, key contributor in Indiana national title run'] },
  { id: 'bell-chris', tier: 5, name: 'Chris Bell', pos: 'WR', team: 'MIA', college: 'Louisville', pick: 94, s: ['REC  — 2024: 43-737-4TD (17.1) | 2025: 72-917-6TD (12.7, 11g)', 'RUSH — 2-14-0TD (career)', 'MISC — Big outside WR, torn ACL ended 2025 early after 11 games'] },
  { id: 'thompson', tier: 5, name: 'Brenen Thompson', pos: 'WR', team: 'LAC', college: 'Mississippi State', pick: 105, s: ['REC  — 2023 (OKL): 7-241-2TD | 2024 (OKL): 19-230-2TD (12.1) | 2025 (MSS): 57-1054-6TD (18.5)', 'RUSH — 3-24-0TD (career)', 'MISC — Texas → Oklahoma → MSS, broke MSU single-season rec yds record, led SEC in 2025'] },
  { id: 'wetjen', tier: 5, name: 'Kaden Wetjen', pos: 'WR', team: 'PIT', college: 'Iowa', pick: 121, s: ['REC  — 2025: 20-151-1TD (7.6)', 'KR/PR — 2025: 4 return TDs (3 PR, 1 KR)', 'MISC — Iowa walk-on, Jet Award winner (top return specialist), value is 100% special teams'] },
  { id: 'bell-skyler', tier: 5, name: 'Skyler Bell', pos: 'WR', team: 'BUF', college: 'UConn', pick: 125, s: ['REC  — 2024: 54-698-6TD (12.9) | 2025: 52-717-5TD (13.8)', 'RUSH — 2-12-0TD (career)', 'MISC — Wisconsin → UConn transfer, steady P5→G5 producer'] },
  { id: 'hibner', tier: 5, name: 'Matthew Hibner', pos: 'TE', team: 'BAL', college: 'SMU', pick: 133, s: ['REC  — 2025: 18-192-2TD', 'MISC — Michigan → SMU, athletic but unproven'] },
  { id: 'young', tier: 5, name: 'Colbie Young', pos: 'WR', team: 'CIN', college: 'Georgia', pick: 140, s: ['REC  — 2024 (UGA): 13-128-2TD | 2025 (UGA): 20-261-1TD (broken ankle vs Ole Miss)', 'MISC — Miami → Georgia, 116 career catches across 4 seasons, missed half of 2025'] },
  { id: 'joly', tier: 5, name: 'Justin Joly', pos: 'TE', team: 'DEN', college: 'NC State', pick: 152, s: ['REC  — 2024: 40-482-5TD (12.1) | 2025: 55-656-6TD (11.9)', 'MISC — UConn → NC State, productive move TE'] },
  { id: 'bredeson', tier: 5, name: 'Max Bredeson', pos: 'FB', team: 'MIN', college: 'Michigan', pick: 159, s: ['RUSH — 2025: 18-62-2TD', 'REC  — 2025: 8-52-1TD', 'MISC — Traditional fullback, lead blocker, special teams'] },
  { id: 'johnson-emmett', tier: 5, name: 'Emmett Johnson', pos: 'RB', team: 'KC', college: 'Nebraska', pick: 161, s: ['RUSH — 2024: 124-627-5TD (5.1) | 2025: 251-1451-12TD (5.8)', 'REC  — 2024: 12-67-0TD | 2025: 46-370-3TD', 'MISC — 1st-team AA 2025, 1,821 total yards from scrimmage, led nation in scrimmage yds/game'] },
  { id: 'allen-kaytron', tier: 5, name: 'Kaytron Allen', pos: 'RB', team: 'WAS', college: 'Penn State', pick: 187, s: ['RUSH — 2022: 867 yds, 10 TD | 2023: 904 yds, 6 TD | 2024: 195-1108-8TD (5.7) | 2025: 1,303 yds, 15 TD', 'REC  — 2024: 18-124-0TD | 2025: 22-152-1TD', 'MISC — Singleton\'s PSU backfield mate, took over lead role in 2025, 3rd-team AA'] },
  { id: 'claiborne', tier: 5, name: 'Demond Claiborne', pos: 'RB', team: 'MIN', college: 'Wake Forest', pick: 198, s: ['RUSH — 2024: 228-1049-11TD (4.6) | 2025: 179-907-10TD (5.1)', 'REC  — 2024: 14-98-0TD | 2025: 19-131-1TD', 'MISC — Wake Forest workhorse, 21 TDs in 2 seasons'] },
  { id: 'washington-mike', tier: 6, name: 'Mike Washington Jr.', pos: 'RB', team: 'LV', college: 'Arkansas', pick: 122, s: ['RUSH — 2025: 146-822-9TD (5.6)', 'REC  — 2025: 12-89-0TD', 'MISC — One-year starter, SEC production'] },
  { id: 'virgil', tier: 6, name: 'Reggie Virgil', pos: 'WR', team: 'ARI', college: 'Texas Tech', pick: 143, s: ['REC  — 2025: 48-833-7TD (17.4)', 'RUSH — 1-12-0TD', 'MISC — Small-school profile, elite YPR'] },
  { id: 'koziol', tier: 6, name: 'Tanner Koziol', pos: 'TE', team: 'JAX', college: 'Houston', pick: 164, s: ['REC  — 2025: 14-112-1TD', 'MISC — Ball State → Houston, blocking TE'] },
  { id: 'law', tier: 6, name: 'Kendrick Law', pos: 'WR', team: 'DET', college: 'Kentucky', pick: 168, s: ['REC  — 2025: 49-632-5TD (12.9)', 'RUSH — 3-18-0TD', 'KR   — 2025: 6-142-0TD'] },
  { id: 'nowakowski', tier: 6, name: 'Riley Nowakowski', pos: 'TE', team: 'PIT', college: 'Indiana', pick: 169, s: ['REC  — 2025: 11-89-0TD', 'MISC — Wisconsin → IU, fullback/H-back hybrid'] },
  { id: 'royer', tier: 6, name: 'Joe Royer', pos: 'TE', team: 'CLE', college: 'Cincinnati', pick: 170, s: ['REC  — 2025: 22-248-2TD (11.3)', 'MISC — Ohio State → Cincy, receiving TE only'] },
  { id: 'cuevas', tier: 6, name: 'Josh Cuevas', pos: 'TE', team: 'BAL', college: 'Alabama', pick: 173, s: ['REC  — 2025: 8-64-0TD', 'MISC — Cal Poly → Bama, blocking specialist'] },
  { id: 'randall', tier: 6, name: 'Adam Randall', pos: 'RB', team: 'BAL', college: 'Clemson', pick: 174, s: ['RUSH — 2025: 152-819-8TD (5.4)', 'REC  — 2025: 9-61-0TD', 'MISC — Clemson bruiser, one-year sample'] },
  { id: 'allen-cyrus', tier: 6, name: 'Cyrus Allen', pos: 'WR', team: 'KC', college: 'Cincinnati', pick: 176, s: ['REC  — 2025: 45-678-5TD (15.1)', 'RUSH — 1-7-0TD', 'MISC — Georgia Tech → Cincy, deep-ball speed'] },
  { id: 'coleman-kevin', tier: 6, name: 'Kevin Coleman Jr.', pos: 'WR', team: 'MIA', college: 'Missouri', pick: 177, s: ['REC  — 2025: 52-712-6TD (13.7)', 'RUSH — 2-11-0TD', 'PR   — 2025: 5-38-0TD'] },
  { id: 'payton', tier: 6, name: 'Cole Payton', pos: 'QB', team: 'PHI', college: 'NDSU', pick: 178, s: ['PASS — 2025: 2,719 yds, 16 TD, 4 INT, 72.0%', 'RUSH — 2025: 136-777-13TD (5.7)', 'MISC — NDSU dual-threat, FCS 1st-team AA, Walter Payton Award finalist'] },
  { id: 'traore', tier: 6, name: 'Seydou Traore', pos: 'TE', team: 'MIA', college: 'Mississippi State', pick: 180, s: ['REC  — 2025: 10-88-1TD', 'MISC — International prospect, raw athlete'] },
  { id: 'green', tier: 6, name: 'Taylen Green', pos: 'QB', team: 'CLE', college: 'Arkansas', pick: 182, s: ['PASS — 2025: 2,714 yds, 19 TD, 11 INT, 60.7%', 'RUSH — 2025: 139-777-8TD (5.6)', 'MISC — Boise State → Arkansas, dual-threat, 6 games of 300+ pass yds in 2025'] },
  { id: 'sharp', tier: 6, name: 'Bauer Sharp', pos: 'TE', team: 'TB', college: 'LSU', pick: 185, s: ['REC  — 2025: 15-134-1TD', 'MISC — Oklahoma → LSU, blocking/inline TE'] },
  { id: 'brown-barion', tier: 6, name: 'Barion Brown', pos: 'WR', team: 'NO', college: 'LSU', pick: 190, s: ['REC  — 2025 (LSU): 53-532-1TD (10.0)', 'KR   — Career: 6 KR TDs (SEC record), incl. 99-yd return', 'MISC — Kentucky → LSU, value is elite return ability, modest receiver'] },
  { id: 'cameron', tier: 6, name: 'Josh Cameron', pos: 'WR', team: 'JAX', college: 'Baylor', pick: 191, s: ['REC  — 2025: 55-808-7TD (14.7)', 'RUSH — 2-9-0TD', 'MISC — UCF → Baylor, slot producer'] },
  { id: 'benson', tier: 6, name: 'Malik Benson', pos: 'WR', team: 'LV', college: 'Oregon', pick: 195, s: ['REC  — 2025: 42-628-4TD (15.0)', 'RUSH — 1-6-0TD', 'MISC — JUCO → Alabama → Oregon, deep-ball specialist'] },
  { id: 'daniels-cj', tier: 6, name: 'CJ Daniels', pos: 'WR', team: 'LAR', college: 'Miami', pick: 197, s: ['REC  — 2025: 48-712-6TD (14.8)', 'RUSH — 1-(-2)-0TD', 'MISC — Liberty → Miami, G5 → P5 step up'] },
  { id: 'henderson-emm', tier: 6, name: 'Emmanuel Henderson Jr.', pos: 'WR', team: 'SEA', college: 'Kansas', pick: 199, s: ['REC  — 2025: 38-588-4TD (15.5)', 'KR   — 2025: 7-161-0TD', 'MISC — Alabama → Kansas, speed/return profile'] },
  { id: 'williams-cj', tier: 6, name: 'CJ Williams', pos: 'WR', team: 'JAX', college: 'Stanford', pick: 203, s: ['REC  — 2025: 42-545-3TD (13.0)', 'MISC — USC → Stanford, possession profile'] },
  { id: 'bond', tier: 6, name: 'Lewis Bond', pos: 'WR', team: 'HOU', college: 'Boston College', pick: 204, s: ['REC  — 2025: 56-729-5TD (13.0)', 'MISC — Steady BC producer, reliable hands'] },
  { id: 'smith-anthony', tier: 6, name: 'Anthony Smith', pos: 'WR', team: 'DAL', college: 'East Carolina', pick: 218, s: ['REC  — 2025: 60-882-7TD (14.7)', 'KR   — 2025: 5-112-0TD', 'MISC — G5 producer, return upside'] },
  { id: 'kaliakmanis', tier: 6, name: 'Athan Kaliakmanis', pos: 'QB', team: 'WAS', college: 'Rutgers', pick: 223, s: ['PASS — 2025: 3,124 yds, 20 TD, 7 INT (best season of career)', 'RUSH — 2025: 56-98-2TD', 'MISC — Minnesota → Rutgers, career 8,604 yds/55 TDs in 48 games'] },
  { id: 'heidenreich', tier: 6, name: 'Eli Heidenreich', pos: 'RB', team: 'PIT', college: 'Navy', pick: 230, s: ['RUSH — 2025: 142-687-8TD (4.8)', 'REC  — 2025: 8-52-0TD', 'MISC — Service academy, limited NFL upside but productive'] },
  { id: 'mcgowan', tier: 6, name: 'Seth McGowan', pos: 'RB', team: 'IND', college: 'Kentucky', pick: 237, s: ['RUSH — 2025: 189-1025-11TD (5.4)', 'REC  — 2025: 14-98-1TD', 'MISC — Former Oklahoma signee, JUCO → Kentucky'] },
  { id: 'miller-jam', tier: 6, name: 'Jam Miller', pos: 'RB', team: 'NE', college: 'Alabama', pick: 245, s: ['RUSH — 2025: 164-882-9TD (5.4)', 'REC  — 2025: 11-72-0TD', 'MISC — Alabama committee back, took lead in 2025'] },
  { id: 'burks', tier: 6, name: 'Deion Burks', pos: 'WR', team: 'IND', college: 'Oklahoma', pick: 254, s: ['REC  — 2025: 38-512-4TD (13.5)', 'MISC — Purdue → Oklahoma, slot-only profile'] },
  { id: 'smack', tier: 7, name: 'Trey Smack', pos: 'K', team: 'GB', college: 'Florida', pick: 216, s: ['FG   — 2025: 22-27 (81.5%), long 56 | XP: 48-48', 'KO   — 2025: 82.4% touchbacks', 'MISC — Lou Groza finalist, reliable leg'] },
  { id: 'endries', tier: 7, name: 'Jack Endries', pos: 'TE', team: 'CIN', college: 'Texas', pick: 221, s: ['REC  — 2025: 20-198-2TD', 'MISC — Cal → Texas, possession TE'] },
  { id: 'kanak', tier: 7, name: 'Jaren Kanak', pos: 'TE', team: 'TEN', college: 'Oklahoma', pick: 225, s: ['REC  — 2025: 6-48-0TD', 'MISC — Former LB convert, special-teams only'] },
  { id: 'morton', tier: 7, name: 'Behren Morton', pos: 'QB', team: 'NE', college: 'Texas Tech', pick: 234, s: ['PASS — 2025: 2,944 yds, 21 TD, 9 INT, 64.7%', 'RUSH — 2025: 42-62-1TD', 'MISC — Air Raid product, quick release, limited arm strength'] },
  { id: 'ryan', tier: 7, name: 'Carsen Ryan', pos: 'TE', team: 'CLE', college: 'BYU', pick: 248, s: ['REC  — 2025: 9-72-1TD', 'MISC — UCLA → BYU, blocking TE'] },
  { id: 'nussmeier', tier: 7, name: 'Garrett Nussmeier', pos: 'QB', team: 'KC', college: 'LSU', pick: 249, s: ['PASS — 2025: 1,927 yds, 12 TD, 5 INT, 67.4% (9 games, benched with abdominal injury)', 'RUSH — 2025: 38-28-1TD', 'MISC — LSU gunslinger, lost starting job mid-2025, injury/inconsistency concerns'] },
  { id: 'bentley', tier: 7, name: 'Dallen Bentley', pos: 'TE', team: 'DEN', college: 'Utah', pick: 256, s: ['REC  — 2025: 4-28-0TD', 'MISC — Snow College → Utah, developmental'] },
];

const BOARD_API_URL = '/api/team-prospect-draftboard';
const LOCAL_BACKUP_KEY = 'team-prospect-draft-board-local-backup-v1';

function parsePick(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function sortByPick<T extends { pick?: number }>(items: T[]) {
  return [...items].sort((a, b) => parsePick(a.pick) - parsePick(b.pick));
}

const DEFAULT_PLAYERS = sortByPick(INITIAL.map((p) => ({ ...p }))).slice(0, 82);

function buildBoardData(
  players: BoardPlayer[],
  scoutingUrl: string,
  customTiers: string[],
  playerCustomTier: Record<string, string>,
) {
  const orderIds = players.map((p) => String(p.id));
  const unlikely: Record<string, boolean> = {};
  const noFit: Record<string, boolean> = {};
  const target: Record<string, boolean> = {};
  const notes: Record<string, string> = {};
  players.forEach((p) => {
    const id = String(p.id);
    if (p.unlikely) unlikely[id] = true;
    if (p.noFit) noFit[id] = true;
    if (p.target) target[id] = true;
    if (typeof p.userNote === 'string' && p.userNote.trim()) notes[id] = p.userNote;
  });
  return {
    orderIds,
    unlikely,
    noFit,
    target,
    notes,
    customTiers,
    playerCustomTier,
    scoutingUrl: scoutingUrl || '/api/team-prospect-draftboard/scouting',
  };
}

function applySavedBoardData(saved: Record<string, unknown>) {
  let next = DEFAULT_PLAYERS.map((p) => ({ ...p }));
  const data: Record<string, unknown> = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};

  if (Array.isArray(data.orderIds)) {
    const orderIds = data.orderIds as Array<string | number>;
    const byId = Object.fromEntries(next.map((p) => [p.id, p]));
    const known = orderIds.map((id) => byId[String(id)]).filter(Boolean);
    const knownSet = new Set(known.map((p: { id: string }) => p.id));
    const missing = next.filter((p) => !knownSet.has(p.id));
    next = [...known, ...sortByPick(missing)];
  }

  if (data.unlikely && typeof data.unlikely === 'object') {
    const unlikelyMap = data.unlikely as Record<string, unknown>;
    next = next.map((p) => ({ ...p, unlikely: !!unlikelyMap[p.id] }));
  }
  if (data.noFit && typeof data.noFit === 'object') {
    const noFitMap = data.noFit as Record<string, unknown>;
    next = next.map((p) => ({ ...p, noFit: !!noFitMap[p.id] }));
  }
  if (data.target && typeof data.target === 'object') {
    const targetMap = data.target as Record<string, unknown>;
    next = next.map((p) => ({ ...p, target: !!targetMap[p.id] }));
  }
  if (data.notes && typeof data.notes === 'object') {
    const notesMap = data.notes as Record<string, unknown>;
    next = next.map((p) => ({ ...p, userNote: String(notesMap[p.id] || '') }));
  }
  const customTiers = Array.isArray(data.customTiers)
    ? data.customTiers.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const playerCustomTier = data.playerCustomTier && typeof data.playerCustomTier === 'object'
    ? (data.playerCustomTier as Record<string, string>)
    : {};
  const normalizeScoutingUrl = (raw: unknown) => {
    const url = raw !== undefined ? String(raw) : '';
    if (!url || url === '/scouting-reports.json') return '/api/team-prospect-draftboard/scouting';
    return url;
  };

  return {
    players: next,
    scoutingUrl: normalizeScoutingUrl(data.scoutingUrl),
    customTiers,
    playerCustomTier,
  };
}

function getFlagColors(p: Record<string, unknown>) {
  if (p.target) return { color: C.target, bg: C.targetBg, border: `${C.target}55` };
  if (p.unlikely) return { color: C.unlikely, bg: C.unlikelyBg, border: `${C.unlikely}55` };
  if (p.noFit) return { color: C.noFit, bg: C.noFitBg, border: `${C.noFit}55` };
  return { color: C.text, bg: C.panel, border: C.border };
}

function saveLocalBackup(data: unknown) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(data)); } catch {}
}
function loadLocalBackup() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function ScoutingSection({
  playerId,
  scoutingUrl,
  scoutingCache,
  scoutingStatus,
  scoutingError,
}: {
  playerId: string;
  scoutingUrl: string;
  scoutingCache: Record<string, unknown> | null;
  scoutingStatus: string;
  scoutingError: string;
}) {
  const renderParagraphs = (text: string) => {
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    if (paragraphs.length <= 1) return text;
    return paragraphs.map((p, i) => (<React.Fragment key={i}>{i > 0 && <div style={{ height: '8px' }} />}<span>{p}</span></React.Fragment>));
  };
  const renderValue = (val: unknown): React.ReactNode => {
    if (!val) return null;
    if (Array.isArray(val)) return <ul style={{ margin: 0, paddingLeft: '18px' }}>{val.map((item, idx) => <li key={idx} style={{ marginBottom: '6px' }}>{renderParagraphs(String(item))}</li>)}</ul>;
    if (typeof val === 'object') return <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '12px', lineHeight: '1.45', color: C.textMuted }}>{JSON.stringify(val, null, 2)}</pre>;
    return renderParagraphs(String(val));
  };
  if (!scoutingUrl) return <div style={{ fontSize: '12px', color: C.textDim, fontStyle: 'italic' }}>No scouting URL configured. Use settings to add a scouting JSON URL.</div>;
  if (scoutingStatus === 'loading') return <div style={{ fontSize: '12px', color: C.textDim }}>Loading scouting reports...</div>;
  if (scoutingStatus === 'error') return <div style={{ fontSize: '12px', color: C.unlikely, lineHeight: '1.5' }}>Failed to load scouting reports: {scoutingError}</div>;
  if (scoutingStatus !== 'loaded') return <div style={{ fontSize: '12px', color: C.textDim }}>Scouting reports not loaded yet.</div>;
  const rawData = scoutingCache?.[playerId];
  if (!rawData) return <div style={{ fontSize: '12px', color: C.textDim, lineHeight: '1.5' }}>No scouting data found for player ID: <code>{playerId}</code></div>;
  const data = typeof rawData === 'string' ? { shortReport: rawData } : (rawData as Record<string, unknown>);
  if (data.shortReport || data.summary || data.report) return <div style={{ fontSize: '13px', lineHeight: '1.6', color: C.text }}>{renderValue(data.shortReport || data.summary || data.report)}</div>;
  const sections = [['ATHLETIC PROFILE', data.athleticProfile], ['STRENGTHS', data.strengths], ['WEAKNESSES', data.weaknesses], ['NFL FIT', data.nflFit], ['COMP', data.comp], ['DYNASTY OUTLOOK', data.dynastyOutlook]].filter(([, v]) => v);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Boolean(data.badgersFit) && <div style={{ padding: '10px 12px', background: `${C.primary}33`, border: `1px solid ${C.accent}88`, borderRadius: '4px' }}><div style={{ fontSize: '9.5px', letterSpacing: '2px', color: C.target, fontWeight: 700, marginBottom: '4px' }}>TEAM FIT NOTE</div><div style={{ fontSize: '13px', lineHeight: '1.55', color: C.text }}>{renderValue(data.badgersFit)}</div></div>}
      {sections.map(([label, val]) => <div key={String(label)}><div style={{ fontSize: '9.5px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '4px' }}>{String(label)}</div><div style={{ fontSize: '13px', lineHeight: '1.55', color: C.text }}>{renderValue(val)}</div></div>)}
      {Boolean(data.verdict) && <div style={{ marginTop: '4px', padding: '10px 12px', background: `${C.primary}22`, border: `1px solid ${C.accent}55`, borderRadius: '3px' }}><div style={{ fontSize: '9.5px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '4px' }}>VERDICT</div><div style={{ fontSize: '13px', lineHeight: '1.55', color: C.text }}>{renderValue(data.verdict)}</div></div>}
    </div>
  );
}

function SettingsModal({ open, onClose, scoutingUrl, onSaveUrl }: { open: boolean; onClose: () => void; scoutingUrl: string; onSaveUrl: (url: string) => void }) {
  const [url, setUrl] = useState(scoutingUrl || '');
  useEffect(() => { if (open) setUrl(scoutingUrl || ''); }, [open, scoutingUrl]);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '20px', width: '100%', maxWidth: '500px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: C.accent, letterSpacing: '2px', marginBottom: '14px' }}>SETTINGS</div>
        <div style={{ marginBottom: '6px', fontSize: '12px', color: C.textMuted }}>Scouting JSON URL</div>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/scouting-reports.json" style={{ width: '100%', padding: '8px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }} />
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '8px 14px', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { onSaveUrl(url.trim()); onClose(); }} style={{ background: C.primary, border: `1px solid ${C.accent}`, color: C.text, padding: '8px 14px', borderRadius: '3px', cursor: 'pointer', fontWeight: 600 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function TeamProspectDraftboard() {
  const [players, setPlayers] = useState<BoardPlayer[]>(DEFAULT_PLAYERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoutingUrl, setScoutingUrl] = useState('/api/team-prospect-draftboard/scouting');
  const [scoutingCache, setScoutingCache] = useState<Record<string, unknown> | null>(null);
  const [scoutingStatus, setScoutingStatus] = useState('no-url');
  const [scoutingError, setScoutingError] = useState('');
  const [teamName, setTeamName] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [customTiers, setCustomTiers] = useState<string[]>([]);
  const [playerCustomTier, setPlayerCustomTier] = useState<Record<string, string>>({});
  const [newTierName, setNewTierName] = useState('');
  const canEdit = isAuthenticated;

  useEffect(() => {
    (async () => {
      try {
        const authRes = await fetch('/api/auth/me', { cache: 'no-store' });
        const authJson = await authRes.json().catch(() => ({} as { authenticated?: boolean; claims?: Record<string, unknown> }));
        const authenticated = Boolean(authJson?.authenticated);
        setIsAuthenticated(authenticated);
        if (authenticated && typeof authJson?.claims?.team === 'string') setTeamName(authJson.claims.team);
        if (!authenticated) {
          setPlayers(DEFAULT_PLAYERS.map((p) => ({ ...p })));
          setScoutingUrl('/api/team-prospect-draftboard/scouting');
          setSaveError('');
          setLoading(false);
          return;
        }

        const res = await fetch(BOARD_API_URL, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        const applied = applySavedBoardData((body?.data || {}) as Record<string, unknown>);
        setPlayers(applied.players);
        setScoutingUrl(applied.scoutingUrl);
        setCustomTiers(applied.customTiers);
        setPlayerCustomTier(applied.playerCustomTier);
        if (typeof body?.team === 'string') setTeamName(body.team);
        saveLocalBackup(body?.data || {});
        setSaveError('');
      } catch (remoteError) {
        const backup = loadLocalBackup();
        const applied = backup ? applySavedBoardData(backup) : null;
        setPlayers(applied ? applied.players : DEFAULT_PLAYERS.map((p) => ({ ...p })));
        setScoutingUrl(applied ? applied.scoutingUrl : '/api/team-prospect-draftboard/scouting');
        setCustomTiers(applied?.customTiers || []);
        setPlayerCustomTier(applied?.playerCustomTier || {});
        setSaveError(`Remote sync unavailable. ${String((remoteError as Error)?.message || '')}`.trim());
      }
      setLoading(false);
      setTimeout(() => setSaveError(''), 7000);
    })();
  }, []);

  useEffect(() => {
    if (!scoutingUrl) { setScoutingCache(null); setScoutingStatus('no-url'); setScoutingError(''); return; }
    let cancelled = false;
    const controller = new AbortController();
    const loadScouting = async () => {
      setScoutingStatus('loading');
      setScoutingError('');
      try {
        const res = await fetch(scoutingUrl, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const json = JSON.parse(text);
        let playersBlock = json.players || json;
        if (Array.isArray(playersBlock)) playersBlock = Object.fromEntries(playersBlock.filter((item) => item && item.id).map((item) => [item.id, item]));
        if (!playersBlock || typeof playersBlock !== 'object' || Array.isArray(playersBlock)) throw new Error('Scouting JSON must be an object or { "players": { ... } }.');
        if (!cancelled) { setScoutingCache(playersBlock); setScoutingStatus('loaded'); }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        if (!cancelled) { setScoutingCache(null); setScoutingStatus('error'); setScoutingError((e as Error)?.message || 'Unknown scouting fetch error'); }
      }
    };
    loadScouting();
    return () => { cancelled = true; controller.abort(); };
  }, [scoutingUrl]);

  useEffect(() => {
    if (loading || !canEdit) return;
    const t = setTimeout(async () => {
      const boardData = buildBoardData(players, scoutingUrl, customTiers, playerCustomTier);
      saveLocalBackup(boardData);
      try {
        const res = await fetch(BOARD_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ data: boardData }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveStatus('Synced');
        setSaveError('');
        setTimeout(() => setSaveStatus(''), 1500);
      } catch (e) {
        setSaveStatus('Saved locally');
        setSaveError(`Remote sync failed: ${(e as Error)?.message || 'unknown'}`);
        setTimeout(() => setSaveStatus(''), 2000);
        setTimeout(() => setSaveError(''), 6000);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [players, scoutingUrl, loading, canEdit, customTiers, playerCustomTier]);

  const toggleExpand = (id: string) => setExpandedId((prev) => prev === id ? null : id);
  const updatePlayer = (id: string, patch: Record<string, unknown>) => setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  const toggleFlag = (id: string, flag: string) => {
    if (!canEdit) return;
    setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, [flag]: !p[flag as keyof typeof p] } : p));
  };
  const moveByOne = (idx: number, direction: number) => {
    if (!canEdit) return;
    setPlayers((prev) => {
      const arr = [...prev];
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      const player = arr[idx];
      const neighbor = arr[targetIdx];
      const newPlayer = { ...player };
      if (neighbor.tier !== player.tier) newPlayer.tier = neighbor.tier;
      arr[idx] = arr[targetIdx];
      arr[targetIdx] = newPlayer;
      return arr;
    });
  };
  const onDrop = (e: React.DragEvent, targetId: string) => {
    if (!canEdit) return;
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    setPlayers((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === draggedId);
      const toIdx = prev.findIndex((p) => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      const destTier = arr[Math.min(toIdx, arr.length - 1)]?.tier ?? item.tier;
      arr.splice(toIdx, 0, { ...item, tier: destTier });
      return arr;
    });
    setDraggedId(null);
    setDragOverId(null);
  };
  const reset = () => {
    if (!canEdit) return;
    if (!confirm('Reset all rankings, notes, and flags to NFL draft-order defaults? Cannot be undone.')) return;
    setPlayers(DEFAULT_PLAYERS.map((p) => ({ ...p })));
    setScoutingUrl('/api/team-prospect-draftboard/scouting');
    setScoutingCache(null);
    setScoutingStatus('loading');
    setScoutingError('');
    setCustomTiers([]);
    setPlayerCustomTier({});
  };

  if (loading) return <div style={{ minHeight: '50vh', background: C.bg, color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif' }}>Loading draft board...</div>;

  const rankedPlayers = players.map((p, idx) => ({ ...p, _absIdx: idx }));
  const title = teamName ? `${teamName} Prospect Draft Board` : 'Team Prospect Draft Board';

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgGrad} 100%)`, color: C.text, fontFamily: '"Georgia", "Times New Roman", serif', paddingBottom: '60px', overflowY: 'auto' }}>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} scoutingUrl={scoutingUrl} onSaveUrl={(url) => { setScoutingUrl(url); setScoutingCache(null); setScoutingStatus(url ? 'loading' : 'no-url'); setScoutingError(''); }} />
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: `${C.bg}f0`, backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.border}`, padding: '12px 14px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div><div style={{ fontSize: '19px', fontWeight: 700, color: C.text, letterSpacing: '1.5px', lineHeight: 1.1 }}>{title}</div><div style={{ fontSize: '10px', color: C.accent, letterSpacing: '2.5px', marginTop: '3px' }}>2026 PROSPECT DRAFT BOARD</div></div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {saveStatus && <span style={{ fontSize: '11px', color: C.accent, display: 'flex', alignItems: 'center', gap: '4px' }}><Save size={12} /> {saveStatus}</span>}
            {saveError && <span style={{ fontSize: '11px', color: C.unlikely }}>{saveError}</span>}
            {canEdit && <button onClick={() => setSettingsOpen(true)} title="Settings" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 10px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}><Settings size={12} /></button>}
            {canEdit && <button onClick={reset} title="Reset to NFL draft order" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 10px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}><RotateCcw size={12} /></button>}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '14px' }}>
        {scoutingStatus === 'error' && <div style={{ padding: '10px 12px', marginBottom: '14px', background: `${C.warning}1a`, border: `1px solid ${C.warning}55`, borderRadius: '4px', fontSize: '12px', color: C.warning, lineHeight: '1.5', display: 'flex', alignItems: 'flex-start', gap: '8px' }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /><div><strong>Scouting reports failed to load.</strong> {scoutingError}. Open settings to change the URL.</div></div>}
        <div style={{ padding: '10px 12px', background: `${C.primary}14`, border: `1px solid ${C.border}`, borderRadius: '4px', marginBottom: '20px', fontSize: '12px', color: C.textMuted, lineHeight: '1.7' }}>
          <strong style={{ color: C.accent }}>Flags (toggle independently):</strong><br />
          <span style={{ color: C.target }}>✓ pale green</span> = Watchlist · <span style={{ color: C.unlikely }}>👁 pale purple</span> = Likely Gone · <span style={{ color: C.noFit }}>✕ pale red</span> = Fade
          <br />
          <span style={{ color: C.textDim, fontSize: '11px' }}>
            {canEdit ? 'Use ↑↓ or drag/drop to reorder. Tap a name to expand for scouting, notes, and custom tier assignment.' : 'Read-only while signed out. Sign in to save private rankings, flags, notes, and custom tiers.'}
          </span>
        </div>
        {canEdit && (
          <div style={{ marginBottom: '14px', padding: '10px 12px', background: `${C.primary}14`, border: `1px solid ${C.border}`, borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '8px' }}>CUSTOM TIERS</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                value={newTierName}
                onChange={(e) => setNewTierName(e.target.value)}
                placeholder="Add a tier name (e.g., Tier A)"
                style={{ flex: 1, padding: '8px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '12px' }}
              />
              <button
                onClick={() => {
                  const nextTier = newTierName.trim();
                  if (!nextTier || customTiers.includes(nextTier)) return;
                  setCustomTiers((prev) => [...prev, nextTier]);
                  setNewTierName('');
                }}
                style={{ background: `${C.primary}99`, border: `1px solid ${C.primary}`, color: C.text, borderRadius: '4px', padding: '8px 10px', fontSize: '12px', cursor: 'pointer' }}
              >
                Add
              </button>
            </div>
            {customTiers.length > 0 && <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{customTiers.map((tier) => <span key={tier} style={{ fontSize: '11px', border: `1px solid ${C.border}`, borderRadius: '999px', padding: '2px 8px', color: C.accent }}>{tier}</span>)}</div>}
          </div>
        )}
        {rankedPlayers.map((p, rankIdx) => {
                const rank = rankIdx + 1;
                const isExpanded = expandedId === p.id;
                const idx = p._absIdx;
                const flagColors = getFlagColors(p);
                return (
                  <div key={String(p.id)} draggable={canEdit} onDragStart={() => setDraggedId(String(p.id))} onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); if (dragOverId !== p.id) setDragOverId(String(p.id)); }} onDrop={(e) => onDrop(e, String(p.id))} onDragEnd={() => { setDraggedId(null); setDragOverId(null); }} style={{ background: flagColors.bg, border: `1px solid ${flagColors.border}`, borderRadius: '4px', marginBottom: '5px', opacity: draggedId === p.id ? 0.4 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <button disabled={!canEdit} onClick={() => moveByOne(idx, -1)} aria-label="Up" style={{ background: 'transparent', border: 'none', color: flagColors.color !== C.text ? flagColors.color : C.accent, cursor: canEdit ? 'pointer' : 'default', padding: '2px', display: 'flex', opacity: canEdit ? 1 : 0.4 }}><ChevronUp size={16} /></button>
                        <button disabled={!canEdit} onClick={() => moveByOne(idx, 1)} aria-label="Down" style={{ background: 'transparent', border: 'none', color: flagColors.color !== C.text ? flagColors.color : C.accent, cursor: canEdit ? 'pointer' : 'default', padding: '2px', display: 'flex', opacity: canEdit ? 1 : 0.4 }}><ChevronDown size={16} /></button>
                      </div>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: flagColors.color !== C.text ? flagColors.color : C.accent, minWidth: '28px', textAlign: 'center' }}>{rank}</div>
                      <div onClick={() => toggleExpand(String(p.id))} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: flagColors.color }}>{String(p.name)}</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, color: 'white', letterSpacing: '0.5px', background: POS_COLORS[String(p.pos)] || '#666', opacity: (p.unlikely || p.noFit) && !p.target ? 0.6 : 1 }}>{String(p.pos)}</span>
                          <span style={{ fontSize: '12px', color: flagColors.color !== C.text ? flagColors.color : C.textMuted }}>{String(p.team)}</span>
                          <span style={{ fontSize: '11px', color: flagColors.color !== C.text ? `${flagColors.color}aa` : C.textDim }}>· {String(p.college)}</span>
                          <span style={{ fontSize: '11px', color: flagColors.color !== C.text ? `${flagColors.color}aa` : C.textDim }}>· NFL Pick #{Number(p.pick)}</span>
                        </div>
                      </div>
                      <button disabled={!canEdit} onClick={() => toggleFlag(String(p.id), 'target')} title={p.target ? 'Remove Watchlist' : 'Add to Watchlist'} style={{ background: 'transparent', border: 'none', color: p.target ? C.target : C.textDim, cursor: canEdit ? 'pointer' : 'default', padding: '4px', display: 'flex', opacity: canEdit ? 1 : 0.5 }}><Check size={15} /></button>
                      <button disabled={!canEdit} onClick={() => toggleFlag(String(p.id), 'unlikely')} title={p.unlikely ? 'Unmark Likely Gone' : 'Mark Likely Gone'} style={{ background: 'transparent', border: 'none', color: p.unlikely ? C.unlikely : C.textDim, cursor: canEdit ? 'pointer' : 'default', padding: '4px', display: 'flex', opacity: canEdit ? 1 : 0.5 }}>{p.unlikely ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                      <button disabled={!canEdit} onClick={() => toggleFlag(String(p.id), 'noFit')} title={p.noFit ? 'Unmark Fade' : 'Mark Fade'} style={{ background: 'transparent', border: 'none', color: p.noFit ? C.noFit : C.textDim, cursor: canEdit ? 'pointer' : 'default', padding: '4px', display: 'flex', opacity: canEdit ? 1 : 0.5 }}><X size={15} /></button>
                      <button onClick={() => toggleExpand(String(p.id))} aria-label={isExpanded ? 'Collapse' : 'Expand'} style={{ background: 'transparent', border: 'none', color: C.accent, cursor: 'pointer', padding: '4px', display: 'flex' }}>{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                    </div>
                    {isExpanded && <div style={{ padding: '0 14px 14px 14px', borderTop: `1px solid ${C.border}`, marginTop: '4px' }}>
                      {canEdit && <div style={{ marginTop: '12px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>CUSTOM TIER</div><div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><select value={playerCustomTier[String(p.id)] || ''} onChange={(e) => setPlayerCustomTier((prev) => ({ ...prev, [String(p.id)]: e.target.value }))} style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '6px', fontSize: '12px' }}><option value="">No Tier</option>{customTiers.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select>{playerCustomTier[String(p.id)] && <span style={{ fontSize: '11px', color: C.accent }}>Assigned: {playerCustomTier[String(p.id)]}</span>}</div></div>}
                      <div style={{ marginTop: '14px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>COLLEGE PRODUCTION</div><div style={{ display: 'grid', gap: '3px' }}>{(Array.isArray(p.s) ? p.s : []).map((line: string, i: number) => <div key={i} style={{ fontSize: '12.5px', padding: '3px 0', borderBottom: `1px dotted ${C.border}`, color: C.textMuted, lineHeight: '1.4' }}>{line}</div>)}</div></div>
                      <div style={{ marginTop: '14px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>SCOUTING REPORT</div><ScoutingSection playerId={String(p.id)} scoutingUrl={scoutingUrl} scoutingCache={scoutingCache} scoutingStatus={scoutingStatus} scoutingError={scoutingError} /></div>
                      <div style={{ marginTop: '14px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>MY NOTES</div><textarea disabled={!canEdit} value={String(p.userNote || '')} onChange={(e) => updatePlayer(String(p.id), { userNote: e.target.value })} placeholder={canEdit ? 'Add your own notes...' : 'Sign in to add notes'} style={{ width: '100%', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '8px', fontSize: '14px', minHeight: '70px', resize: 'vertical', opacity: canEdit ? 1 : 0.7 }} /></div>
                    </div>}
                  </div>
                );
              })}
      </div>
    </div>
  );
}

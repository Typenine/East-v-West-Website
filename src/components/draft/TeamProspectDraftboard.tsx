'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, X, Check, RotateCcw, Save, AlertCircle, Search, Tag, Download, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';

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
  unlikely: '#d4a839',
  unlikelyBg: 'rgba(212, 168, 57, 0.10)',
  noFit: '#e89a98',
  noFitBg: 'rgba(232, 154, 152, 0.10)',
  target: '#7dd4a8',
  targetBg: 'rgba(125, 212, 168, 0.13)',
  warning: '#e8b87a',
};

const POS_COLORS: Record<string, string> = {
  QB: '#c25852', RB: '#c4a020', WR: '#3d7eaa', TE: '#4a8e62', K: '#7b5ea7', FB: '#4a8e62',
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
  { id: 'love', tier: 1, name: 'Jeremiyah Love', pos: 'RB', team: 'ARI', college: 'Notre Dame', pick: 3, s: ['RUSH — 2023: 71-385-1TD (5.4) | 2024: 163-1125-17TD (6.9) | 2025: 199-1372-18TD (6.9)', 'REC  — 2023: 8-77-1TD | 2024: 28-237-2TD | 2025: 27-280-3TD', 'KR   — 2023: 2-42-0TD | 2024: 1-0-0TD', 'MISC — Doak Walker Award winner, unanimous All-American, 21 offensive TDs in 2025'] },
  { id: 'mendoza', tier: 1, name: 'Fernando Mendoza', pos: 'QB', team: 'LV', college: 'Indiana', pick: 1, s: ['PASS — 2023 (Cal): 1,708 yds, 14 TD, 10 INT, 63.0% | 2024 (Cal): 3,004 yds, 16 TD, 6 INT, 68.7% | 2025 (IND): 3,724 yds, 41 TD, 6 INT, 72.0%', 'RUSH — 2023: 49-86-2TD | 2024: 87-105-2TD | 2025: 89-312-6TD', 'MISC — Indiana single-season TD record (41), CFP semifinal'] },
  { id: 'tate', tier: 1, name: 'Carnell Tate', pos: 'WR', team: 'TEN', college: 'Ohio State', pick: 4, s: ['REC  — 2023: 18-264-1TD (14.7) | 2024: 52-733-4TD (14.1) | 2025: 51-875-9TD (17.2)', 'RUSH — 2025: 2-16-0TD', 'MISC — Ohio State boundary/downfield WR, 2nd-team AA'] },
  { id: 'tyson', tier: 1, name: 'Jordyn Tyson', pos: 'WR', team: 'NO', college: 'Arizona State', pick: 8, s: ['REC  — 2023: DNP/knee injury | 2024 (ASU): 75-1101-10TD (14.7) | 2025 (ASU): 61-711-8TD (11.7)', 'RUSH — 2024: 5-42-0TD | 2025: 2-4-1TD', 'PASS — 2025: 0-for-1', 'MISC — Arizona State WR; 2024-25 combined 136 receptions'] },
  { id: 'lemon', tier: 1, name: 'Makai Lemon', pos: 'WR', team: 'PHI', college: 'USC', pick: 20, s: ['REC  — 2023: 6-88-0TD (14.7) | 2024: 52-764-3TD (14.7) | 2025: 79-1156-11TD (14.6)', 'RUSH — 2025: 9-4-2TD', 'PR   — 2025: 6-71-0TD', 'KR   — 2024: 19-514-0TD | 2025: 8-144-0TD', 'PASS — 2025: 1-1, 24 yds, 1 TD', 'MISC — USC high-volume receiver, Biletnikoff Award winner, 1st-team AA 2025'] },
  { id: 'price', tier: 2, name: 'Jadarian Price', pos: 'RB', team: 'SEA', college: 'Notre Dame', pick: 32, s: ['RUSH — 2023: 47-272-3TD (5.8) | 2024: 120-746-7TD (6.2) | 2025: 113-674-11TD (6.0)', 'REC  — 2023: 5-65-1TD | 2024: 4-10-0TD | 2025: 6-87-2TD', 'KR   — 2025: 12-450-2TD (37.5)', 'MISC — Missed 2022 with Achilles injury; returned to action in 2023'] },
  { id: 'concepcion', tier: 2, name: 'KC Concepcion', pos: 'WR', team: 'CLE', college: 'Texas A&M', pick: 24, s: ['REC  — 2023 (NCST): 71-839-10TD | 2024 (NCST): 53-460-6TD (8.7) | 2025 (TAMU): 61-919-9TD (15.1)', 'RUSH — 2023: 41-320-0TD | 2024: 19-36-2TD | 2025: 10-75-1TD', 'PR   — 2024: 5-45-0TD | 2025: 25-456-2TD', 'MISC — NC State → Texas A&M, Paul Hornung/all-purpose profile, 12 total TDs in 2025'] },
  { id: 'sadiq', tier: 2, name: 'Kenyon Sadiq', pos: 'TE', team: 'NYJ', college: 'Oregon', pick: 16, s: ['REC  — 2023: 5-24-1TD | 2024: 24-308-2TD (12.8) | 2025: 51-560-8TD (11.0)', 'RUSH — 2024: 5-24-0TD | 2025: 3-6-0TD', 'MISC — Oregon receiving TE, Big Ten TE of the Year (2025), 2nd-team AA, 8-TD breakout'] },
  { id: 'simpson', tier: 2, name: 'Ty Simpson', pos: 'QB', team: 'LAR', college: 'Alabama', pick: 13, s: ['PASS — 2023: 11-20, 179 yds, 0 TD, 0 INT, 55.0% | 2024: 14-25, 167 yds, 0 TD, 0 INT, 56.0% | 2025: 305-473, 3567 yds, 28 TD, 5 INT, 64.5%', 'RUSH — 2023: 14-86-2TD | 2024: 8-44-1TD | 2025: 90-93-2TD', 'MISC — Alabama starter; 5-star recruit, sat behind Milroe for 2 years, CFP semifinal'] },
  { id: 'cooper', tier: 2, name: 'Omar Cooper Jr.', pos: 'WR', team: 'NYJ', college: 'Indiana', pick: 30, s: ['REC  — 2023: 18-267-2TD (14.8) | 2024: 28-594-7TD (21.2) | 2025: 69-937-13TD (13.6)', 'RUSH — 2024: 2-23-1TD | 2025: 3-74-1TD', 'MISC — Indiana lead receiver; led national championship team in targets/catches/yards'] },
  { id: 'stowers', tier: 3, name: 'Eli Stowers', pos: 'TE', team: 'PHI', college: 'Vanderbilt', pick: 54, s: ['REC  — 2024: 49-638-5TD (13.0) | 2025: 62-769-4TD (12.4)', 'RUSH — 2024: 6-7-0TD | 2025: 2-2-0TD', 'MISC — Texas A&M → Vanderbilt, Mackey Award profile, 1st-team AA'] },
  { id: 'beck', tier: 3, name: 'Carson Beck', pos: 'QB', team: 'ARI', college: 'Miami', pick: 65, s: ['PASS — 2024 (Georgia): 290-448, 3485 yds, 28 TD, 12 INT, 64.7% | 2025 (Miami): 338-467, 3813 yds, 30 TD, 12 INT, 72.4%', 'RUSH — 2024: 55-71-1TD | 2025: 62-43-2TD', 'REC  — 2025: 1-14-1TD', 'MISC — Georgia → Miami transfer, pocket passer with minimal rushing value'] },
  { id: 'fields', tier: 3, name: 'Malachi Fields', pos: 'WR', team: 'NYG', college: 'Notre Dame', pick: 74, s: ['REC  — 2023 (Virginia): 58-811-5TD (14.0) | 2024 (Virginia): 55-808-5TD (14.7) | 2025 (Notre Dame): 36-630-5TD (17.5)', 'MISC — Virginia → Notre Dame transfer, efficient vertical/contested-catch profile'] },
  { id: 'branch', tier: 3, name: 'Zachariah Branch', pos: 'WR', team: 'ATL', college: 'Georgia', pick: 79, s: ['REC  — 2023 (USC): 31-320-2TD (10.3) | 2024 (USC): 47-503-1TD (10.7) | 2025 (Georgia): 81-811-6TD (10.0)', 'RUSH — 2023: 9-70-1TD | 2024: 2-17-0TD | 2025: 4-7-0TD', 'PR   — 2023: 16-332-1TD | 2024: 13-74-0TD | 2025: 15-180-0TD', 'KR   — 2023: 24-442-1TD | 2024: 5-105-0TD | 2025: 10-205-0TD', 'MISC — Georgia slot/return profile; 2025 receiving volume is real'] },
  { id: 'lane', tier: 3, name: 'Ja\'Kobi Lane', pos: 'WR', team: 'BAL', college: 'USC', pick: 80, s: ['REC  — 2023: 7-93-2TD (13.3) | 2024: 43-525-12TD (12.2) | 2025: 49-745-4TD (15.2)', 'RUSH — No meaningful rushing production', 'MISC — USC outside/red-zone WR; 2024 TD spike remains the profile hook'] },
  { id: 'hurst', tier: 3, name: 'Ted Hurst', pos: 'WR', team: 'TB', college: 'Georgia State', pick: 84, s: ['REC  — 2024 (Georgia State): 56-961-9TD (17.2) | 2025 (Georgia State): 71-1004-6TD (14.1)', 'RUSH — No meaningful rushing production', 'MISC — Georgia State WR producer, 15 receiving TDs over two GSU seasons'] },
  { id: 'sarratt', tier: 3, name: 'Elijah Sarratt', pos: 'WR', team: 'BAL', college: 'Indiana', pick: 115, s: ['REC  — 2022 (Saint Francis): 42-700-13TD | 2023 (JMU): 82-1191-8TD (14.5) | 2024 (Indiana): 53-957-8TD (18.1) | 2025 (Indiana): 65-830-15TD (12.8)', 'RUSH — 2022: 7-47-0TD | 2023: 1 rushing TD', 'MISC — Saint Francis → JMU → Indiana, productive transfer path, 2nd-team All-Big Ten (2025)'] },
  { id: 'singleton', tier: 3, name: 'Nicholas Singleton', pos: 'RB', team: 'TEN', college: 'Penn State', pick: 165, s: ['RUSH — 2022: 156-1061-12TD (6.8) | 2023: 171-752-8TD (4.4) | 2024: 172-1099-12TD (6.4) | 2025: 123-549-13TD (4.5)', 'REC  — 2022: 11-85-1TD | 2023: 26-308-2TD | 2024: 41-375-5TD | 2025: 24-219-1TD', 'MISC — Split backfield with Kaytron Allen, Penn State career record 45 rushing TDs'] },
  { id: 'stribling', tier: 4, name: 'De\'Zhaun Stribling', pos: 'WR', team: 'SF', college: 'Ole Miss', pick: 33, s: ['REC  — 2023 (OKST): 14-198-1TD (14.1) | 2024 (OKST): 52-882-6TD (17.0) | 2025 (Ole Miss): 55-811-6TD (14.7)', 'RUSH — No meaningful rushing production', 'MISC — Washington State → Oklahoma State → Ole Miss transfer path'] },
  { id: 'boston', tier: 4, name: 'Denzel Boston', pos: 'WR', team: 'CLE', college: 'Washington', pick: 39, s: ['REC  — 2023: 5-51-0TD | 2024: 63-834-9TD (13.2) | 2025: 62-881-11TD (14.2)', 'PR   — 2024: 12-80-0TD | 2025: 8-104-1TD', 'PASS — 2025: 2-2, 15 yds, 1 TD', 'MISC — 20 receiving TDs over 2024-25; 21 total TDs including 2025 punt-return TD'] },
  { id: 'bernard', tier: 4, name: 'Germie Bernard', pos: 'WR', team: 'PIT', college: 'Alabama', pick: 47, s: ['REC  — 2023 (Washington): 34-419-2TD (12.3) | 2024 (Alabama): 50-794-2TD (15.9) | 2025 (Alabama): 64-862-7TD (13.5)', 'RUSH — 2023: 13-43-2TD | 2024: 4-37-1TD | 2025: 18-101-2TD', 'KR/PR — 2023: 10 KR-233-0TD, 3 PR-43-0TD | 2024-25: no meaningful return production', 'PASS — 2025: 2-2, 15 yds', 'MISC — Michigan State → Washington → Alabama; versatile WR with real 2025 rushing contribution'] },
  { id: 'klare', tier: 4, name: 'Max Klare', pos: 'TE', team: 'LAR', college: 'Ohio State', pick: 61, s: ['REC  — 2024 (PUR): 51-685-4TD (13.4) | 2025 (OSU): 43-448-2TD (10.4)', 'MISC — Purdue → OSU, 1st-team All-Big Ten (2025), crowded OSU target share'] },
  { id: 'roush', tier: 4, name: 'Sam Roush', pos: 'TE', team: 'CHI', college: 'Stanford', pick: 69, s: ['REC  — 2025: 49-545-2TD (11.1)', 'MISC — Stanford possession TE; led ACC tight ends in receiving yards'] },
  { id: 'williams-antonio', tier: 4, name: 'Antonio Williams', pos: 'WR', team: 'WAS', college: 'Clemson', pick: 71, s: ['REC  — 2023: 22-224-2TD (10.2) | 2024: 75-904-11TD (12.1) | 2025: 55-604-4TD (11.0)', 'RUSH — 2023: 0-0-0TD | 2024: 7-101-1TD | 2025: 13-78-1TD', 'PR   — 2023: 3-14-0TD | 2024: 17-164-0TD | 2025: 4-44-0TD', 'PASS — 2025: 1-1, 75 yds, 1 TD', 'MISC — Clemson slot/return/gadget profile'] },
  { id: 'delp', tier: 4, name: 'Oscar Delp', pos: 'TE', team: 'NO', college: 'Georgia', pick: 73, s: ['REC  — 2023: 24-284-3TD | 2024: 21-248-4TD | 2025: 20-261-1TD (13.1)', 'MISC — Georgia TE, 70-854-9TD career'] },
  { id: 'douglas', tier: 4, name: 'Caleb Douglas', pos: 'WR', team: 'MIA', college: 'Texas Tech', pick: 75, s: ['REC  — 2023 (Florida): 11-133-1TD (12.1) | 2024 (Texas Tech): 60-877-6TD (14.6) | 2025 (Texas Tech): 54-846-7TD (15.7)', 'RUSH — No meaningful rushing production', 'MISC — Florida → Texas Tech transfer, back-to-back 800-yard seasons at Texas Tech'] },
  { id: 'allar', tier: 4, name: 'Drew Allar', pos: 'QB', team: 'PIT', college: 'Penn State', pick: 76, s: ['PASS — 2024: 262-394, 3327 yds, 24 TD, 8 INT, 66.5% | 2025: 103-159, 1100 yds, 8 TD, 3 INT, 64.8% (6 games)', 'RUSH — 2024: 96-302-6TD | 2025: 36-172-1TD', 'REC  — 2025: 1-5-0TD', 'MISC — Penn State career 7,402 yds/61 TD; season-ending leg/ankle injury Oct. 2025'] },
  { id: 'brazzell', tier: 4, name: 'Chris Brazzell II', pos: 'WR', team: 'CAR', college: 'Tennessee', pick: 83, s: ['REC  — 2023 (Tulane): 44-711-5TD (16.2) | 2024 (Tennessee): 29-333-2TD | 2025 (Tennessee): 62-1017-9TD (16.4)', 'RUSH — No 2025 rushing production listed', 'MISC — Tulane → Tennessee, major 2025 SEC breakout'] },
  { id: 'raridon', tier: 4, name: 'Eli Raridon', pos: 'TE', team: 'NE', college: 'Notre Dame', pick: 95, s: ['REC  — 2022-24 (career): 16-141-3TD | 2025: 32-482-0TD (15.1)', 'MISC — ND inline TE, breakout 2025, only 16 career catches before senior year'] },
  { id: 'coleman-jonah', tier: 4, name: 'Jonah Coleman', pos: 'RB', team: 'DEN', college: 'Washington', pick: 108, s: ['RUSH — 2022 (Arizona): 75-372-4TD | 2023 (Arizona): 128-871-5TD (6.8) | 2024 (Washington): 193-1053-10TD (5.5) | 2025 (Washington): 156-758-15TD (4.9)', 'REC  — 2023: 25-283-1TD | 2024: 23-177-0TD | 2025: 31-354-2TD', 'KR   — 2025: 3-57-0TD', 'MISC — Washington RB; 17 total TDs in 2025'] },
  { id: 'klubnik', tier: 4, name: 'Cade Klubnik', pos: 'QB', team: 'NYJ', college: 'Clemson', pick: 110, s: ['PASS — 2025: 257-392, 2943 yds, 16 TD, 6 INT, 65.6%', 'RUSH — 2025: 83-94-4TD', 'MISC — Clemson starter, some mobility but limited rushing volume'] },
  { id: 'lance', tier: 4, name: 'Bryce Lance', pos: 'WR', team: 'NO', college: 'NDSU', pick: 136, s: ['REC  — 2023: 1-7-0TD | 2024: 75-1071-17TD | 2025: 51-1079-8TD', 'RUSH — 2024: 1 rushing TD | 2025: 1 rushing TD', 'MISC — Trey Lance\'s brother, FCS All-American, back-to-back 1,000-yard seasons'] },
  { id: 'boerkircher', tier: 5, name: 'Nate Boerkircher', pos: 'TE', team: 'JAX', college: 'Texas A&M', pick: 56, s: ['REC  — 2024 (Nebraska): 6-102-0TD | 2025 (Texas A&M): 19-198-3TD (10.4)', 'RUSH — 2025: 3-5-1TD', 'MISC — Blocking TE with short-yardage/gadget usage'] },
  { id: 'klein', tier: 5, name: 'Marlin Klein', pos: 'TE', team: 'HOU', college: 'Michigan', pick: 59, s: ['REC  — 2025: 24-248-1TD (10.3)', 'MISC — German-born Michigan TE, honorable mention All-Big Ten, developmental/inline profile'] },
  { id: 'kacmarek', tier: 5, name: 'Will Kacmarek', pos: 'TE', team: 'MIA', college: 'Ohio State', pick: 87, s: ['REC  — 2025: 15-168-2TD (11.2)', 'MISC — Ohio → Ohio State transfer, blocking/secondary TE with modest receiving contribution'] },
  { id: 'thomas', tier: 5, name: 'Zavion Thomas', pos: 'WR', team: 'CHI', college: 'LSU', pick: 89, s: ['REC  — 2023 (Mississippi State): 40-503-1TD (12.6) | 2024 (LSU): 23-218-2TD | 2025 (LSU): 41-488-4TD (11.9)', 'RUSH — 2025: 19-99-1TD', 'PR   — 2024: 14-66-0TD | 2025: 17-153-0TD', 'KR   — 2024: 24-633-1TD | 2025: 1-22-0TD', 'PASS — 2025: 2-3, 33 yds', 'MISC — Mississippi State → LSU before 2024, utility/return option'] },
  { id: 'black', tier: 5, name: 'Kaelon Black', pos: 'RB', team: 'SF', college: 'Indiana', pick: 90, s: ['RUSH — 2024: 251 yds, 2 TD | 2025: 186-1040-10TD (5.6)', 'REC  — 2025: 4-36-0TD', 'MISC — JMU → Indiana transfer; rushing workhorse in national title run'] },
  { id: 'bell-chris', tier: 5, name: 'Chris Bell', pos: 'WR', team: 'MIA', college: 'Louisville', pick: 94, s: ['REC  — 2024: 43-737-4TD (17.1) | 2025: 72-917-6TD (12.7)', 'MISC — Louisville outside WR; torn ACL ended 2025 after 11 games'] },
  { id: 'thompson', tier: 5, name: 'Brenen Thompson', pos: 'WR', team: 'LAC', college: 'Mississippi State', pick: 105, s: ['REC  — 2023 (Oklahoma): 7-241-2TD | 2024 (Oklahoma): 19-230-2TD (12.1) | 2025 (Mississippi State): 57-1054-6TD (18.5)', 'RUSH — 2025: 4-14-1TD', 'PR   — 2025: 1-44-0TD', 'MISC — Texas → Oklahoma → Mississippi State, 7 total TDs in 2025'] },
  { id: 'wetjen', tier: 5, name: 'Kaden Wetjen', pos: 'WR', team: 'PIT', college: 'Iowa', pick: 121, s: ['REC  — 2025: 20-151-1TD (7.6)', 'RUSH — 2025: 15-79-2TD', 'PR   — 2025: 21-563-3TD', 'KR   — 2025: 16-476-1TD', 'MISC — Iowa walk-on return specialist with rushing/gadget production'] },
  { id: 'bell-skyler', tier: 5, name: 'Skyler Bell', pos: 'WR', team: 'BUF', college: 'UConn', pick: 125, s: ['REC  — 2024 (UConn): 50-860-5TD | 2025 (UConn): 101-1278-13TD (12.7)', 'RUSH — 2025: 2-(-2)-0TD', 'MISC — Wisconsin → UConn transfer; Biletnikoff finalist/All-American caliber 2025'] },
  { id: 'hibner', tier: 5, name: 'Matthew Hibner', pos: 'TE', team: 'BAL', college: 'SMU', pick: 133, s: ['REC  — 2024 (SMU): 24-368-4TD (15.3) | 2025 (SMU): 31-436-4TD (14.1)', 'MISC — Michigan → SMU transfer, late-career receiving TE breakout'] },
  { id: 'young', tier: 5, name: 'Colbie Young', pos: 'WR', team: 'CIN', college: 'Georgia', pick: 140, s: ['REC  — 2023 (Miami): 47-563-5TD | 2024 (Georgia): 11-149-2TD | 2025 (Georgia): 26-358-1TD', 'MISC — Miami → Georgia transfer; leg fracture ended 2025 early. Career 116-1446-13TD including 2022'] },
  { id: 'joly', tier: 5, name: 'Justin Joly', pos: 'TE', team: 'DEN', college: 'NC State', pick: 152, s: ['REC  — 2024 (NC State): 43-661-4TD (15.4) | 2025 (NC State): 49-489-7TD (10.0)', 'MISC — UConn → NC State transfer, 92-1150-11TD over two NC State seasons'] },
  { id: 'bredeson', tier: 5, name: 'Max Bredeson', pos: 'FB', team: 'MIN', college: 'Michigan', pick: 159, s: ['RUSH — No rushing production', 'REC  — 2025: 2-11-0TD', 'MISC — Traditional fullback/H-back, lead blocker and special teams player'] },
  { id: 'johnson-emmett', tier: 5, name: 'Emmett Johnson', pos: 'RB', team: 'KC', college: 'Nebraska', pick: 161, s: ['RUSH — 2024: 124-627-5TD (5.1) | 2025: 251-1451-12TD (5.8)', 'REC  — 2024: 12-67-0TD | 2025: 46-370-3TD', 'MISC — 1st-team AA 2025, 1,821 yards from scrimmage, elite national RB production'] },
  { id: 'allen-kaytron', tier: 5, name: 'Kaytron Allen', pos: 'RB', team: 'WAS', college: 'Penn State', pick: 187, s: ['RUSH — 2022: 167-867-10TD (5.2) | 2023: 172-902-6TD (5.2) | 2024: 220-1108-8TD (5.0) | 2025: 210-1303-15TD (6.2)', 'REC  — 2024: 18-153-2TD | 2025: 18-68-0TD', 'MISC — Singleton\'s PSU backfield mate, Penn State\'s all-time rushing leader'] },
  { id: 'claiborne', tier: 5, name: 'Demond Claiborne', pos: 'RB', team: 'MIN', college: 'Wake Forest', pick: 198, s: ['RUSH — 2024: 228-1049-11TD (4.6) | 2025: 179-907-10TD (5.1)', 'REC  — 2024: 23-254-2TD | 2025: 28-140-0TD', 'KR   — 2024: 11-277-1TD', 'MISC — Wake Forest workhorse, 21 rushing TDs and 24 total TDs over 2024-25'] },
  { id: 'washington-mike', tier: 6, name: 'Mike Washington Jr.', pos: 'RB', team: 'LV', college: 'Arkansas', pick: 122, s: ['RUSH — 2025: 167-1070-8TD (6.4)', 'REC  — 2025: 28-226-1TD', 'MISC — Arkansas one-year starter, 1,000-yard rusher with useful receiving production'] },
  { id: 'virgil', tier: 6, name: 'Reggie Virgil', pos: 'WR', team: 'ARI', college: 'Texas Tech', pick: 143, s: ['REC  — 2025: 57-705-6TD (12.4)', 'RUSH — 2025: 2-35-2TD', 'MISC — Texas Tech WR, vertical/size profile, 8 total TDs in 2025'] },
  { id: 'koziol', tier: 6, name: 'Tanner Koziol', pos: 'TE', team: 'JAX', college: 'Houston', pick: 164, s: ['REC  — 2024 (Ball State): 94-839-8TD | 2025 (Houston): 74-727-6TD', 'MISC — Ball State → Houston transfer, high-volume receiving TE'] },
  { id: 'law', tier: 6, name: 'Kendrick Law', pos: 'WR', team: 'DET', college: 'Kentucky', pick: 168, s: ['REC  — 2025: 53-540-3TD (10.2)', 'RUSH — 2025: 8-53-0TD', 'KR/PR — 2025: 9 KR-174-0TD | 3 PR-8-0TD', 'MISC — Alabama → Kentucky transfer, slot/gadget/return profile'] },
  { id: 'nowakowski', tier: 6, name: 'Riley Nowakowski', pos: 'TE', team: 'PIT', college: 'Indiana', pick: 169, s: ['REC  — 2025: 32-387-2TD (12.1)', 'RUSH — 2025: 2-2-2TD', 'MISC — Wisconsin → Indiana transfer, FB/H-back/TE hybrid, second-team All-Big Ten media'] },
  { id: 'royer', tier: 6, name: 'Joe Royer', pos: 'TE', team: 'CLE', college: 'Cincinnati', pick: 170, s: ['REC  — 2024 (Cincinnati): 50-521-3TD | 2025: 29-416-4TD (14.3)', 'MISC — Ohio State → Cincinnati transfer, 79-937-7TD over two Cincinnati seasons, receiving TE profile'] },
  { id: 'cuevas', tier: 6, name: 'Josh Cuevas', pos: 'TE', team: 'BAL', college: 'Alabama', pick: 173, s: ['REC  — 2025: 37-411-4TD (11.1)', 'RUSH — 2025: 1-7-0TD', 'MISC — Washington → Alabama transfer, lead TE role, Mackey Award Watch List'] },
  { id: 'randall', tier: 6, name: 'Adam Randall', pos: 'RB', team: 'BAL', college: 'Clemson', pick: 174, s: ['RUSH — 2025: 168-814-10TD (4.9)', 'REC  — 2025: 36-254-3TD', 'KR   — 2025: 9-213-0TD', 'MISC — Clemson power back, 13 total TDs, legit receiving usage'] },
  { id: 'allen-cyrus', tier: 6, name: 'Cyrus Allen', pos: 'WR', team: 'KC', college: 'Cincinnati', pick: 176, s: ['REC  — 2025: 51-674-13TD (13.2)', 'RUSH — 2025: 7-20-0TD', 'MISC — Louisiana Tech → Texas A&M → Cincinnati, red-zone TD spike, 13 receiving TDs'] },
  { id: 'coleman-kevin', tier: 6, name: 'Kevin Coleman Jr.', pos: 'WR', team: 'MIA', college: 'Missouri', pick: 177, s: ['REC  — 2025: 66-732-1TD (11.1)', 'RUSH — 2025: 9-76-0TD', 'PR   — 2025: 15-189-1TD', 'MISC — Missouri slot/return option, high-catch-rate receiver, SEC punt-return production'] },
  { id: 'payton', tier: 6, name: 'Cole Payton', pos: 'QB', team: 'PHI', college: 'NDSU', pick: 178, s: ['PASS — 2025: 161-224, 2719 yds, 16 TD, 4 INT, 71.9%', 'RUSH — 2025: 136-777-13TD (5.7)', 'MISC — NDSU dual-threat, FCS first-team AA/Walter Payton finalist profile'] },
  { id: 'traore', tier: 6, name: 'Seydou Traore', pos: 'TE', team: 'MIA', college: 'Mississippi State', pick: 180, s: ['REC  — 2025: 35-369-5TD (10.5)', 'MISC — Arkansas State → Mississippi State transfer, London-born TE, developmental receiving/blocking profile'] },
  { id: 'green', tier: 6, name: 'Taylen Green', pos: 'QB', team: 'CLE', college: 'Arkansas', pick: 182, s: ['PASS — 2025: 2,714 yds, 19 TD, 11 INT, 60.7%', 'RUSH — 2025: 139-777-8TD (5.6)', 'MISC — Boise State → Arkansas, dual-threat, 6 games of 300+ pass yds in 2025'] },
  { id: 'sharp', tier: 6, name: 'Bauer Sharp', pos: 'TE', team: 'TB', college: 'LSU', pick: 185, s: ['REC  — 2024 (Oklahoma): 42-324-2TD | 2025 (LSU): 24-252-2TD', 'MISC — Southeastern Louisiana → Oklahoma → LSU, converted QB, inline/move TE with blocking value'] },
  { id: 'brown-barion', tier: 6, name: 'Barion Brown', pos: 'WR', team: 'NO', college: 'LSU', pick: 190, s: ['REC  — 2025 (LSU): 53-532-1TD (10.0)', 'RUSH — 2025: 3-33-0TD', 'KR   — 2025: 15-445-1TD | Career: 65-1910-6TD', 'MISC — Kentucky → LSU transfer, SEC career record 6 kickoff return TDs, elite return specialist'] },
  { id: 'cameron', tier: 6, name: 'Josh Cameron', pos: 'WR', team: 'JAX', college: 'Baylor', pick: 191, s: ['REC  — 2025: 69-872-9TD (12.6)', 'RUSH — No meaningful rushing production', 'PR   — 2025: 18-141-0TD', 'MISC — UCF → Baylor transfer, high-volume slot/return producer'] },
  { id: 'benson', tier: 6, name: 'Malik Benson', pos: 'WR', team: 'LV', college: 'Oregon', pick: 195, s: ['REC  — 2025: 43-719-6TD (16.7)', 'RUSH — 2025: 1-(-4)-0TD', 'PR   — 2025: 9-161-1TD', 'MISC — JUCO → Alabama → Oregon, vertical WR/return profile'] },
  { id: 'daniels-cj', tier: 6, name: 'CJ Daniels', pos: 'WR', team: 'LAR', college: 'Miami', pick: 197, s: ['REC  — 2023 (Liberty): 55-1067-10TD | 2024 (LSU): 42-480-0TD | 2025 (Miami): 50-557-7TD (11.1)', 'RUSH — No meaningful rushing production', 'MISC — Liberty → LSU → Miami transfer, possession/contested-catch profile'] },
  { id: 'henderson-emm', tier: 6, name: 'Emmanuel Henderson Jr.', pos: 'WR', team: 'SEA', college: 'Kansas', pick: 199, s: ['REC  — 2025: 45-766-5TD (17.0)', 'RUSH — 2025: 4-16-0TD', 'KR   — 2025: 18-455-1TD', 'MISC — Alabama → Kansas transfer, speed/return profile, 1,237 all-purpose yards'] },
  { id: 'williams-cj', tier: 6, name: 'CJ Williams', pos: 'WR', team: 'JAX', college: 'Stanford', pick: 203, s: ['REC  — 2025: 59-749-6TD (12.7)', 'MISC — USC → Wisconsin → Stanford transfer, honorable mention All-ACC, Stanford\'s leading WR in 2025'] },
  { id: 'bond', tier: 6, name: 'Lewis Bond', pos: 'WR', team: 'HOU', college: 'Boston College', pick: 204, s: ['REC  — 2025: 88-993-1TD (11.3)', 'RUSH — 2025: 4-3-0TD', 'MISC — Boston College high-volume possession receiver, BC all-time receptions leader'] },
  { id: 'smith-anthony', tier: 6, name: 'Anthony Smith', pos: 'WR', team: 'DAL', college: 'East Carolina', pick: 218, s: ['REC  — 2025: 64-1053-7TD (16.5)', 'RUSH — 2025: 1-45-1TD', 'MISC — ECU deep threat, Military Bowl MVP, 1,053-yard senior season'] },
  { id: 'kaliakmanis', tier: 6, name: 'Athan Kaliakmanis', pos: 'QB', team: 'WAS', college: 'Rutgers', pick: 223, s: ['PASS — 2025: 229-368, 3124 yds, 20 TD, 7 INT, 62.2%', 'RUSH — 2025: 96-(-26)-4TD', 'MISC — Minnesota → Rutgers transfer, best passing season of career, limited fantasy rushing value'] },
  { id: 'heidenreich', tier: 6, name: 'Eli Heidenreich', pos: 'RB', team: 'PIT', college: 'Navy', pick: 230, s: ['RUSH — 2025: 77-499-3TD (6.5)', 'REC  — 2025: 51-941-6TD (18.5)', 'MISC — Navy utility weapon, slotback/receiver hybrid, 1,440 yards from scrimmage'] },
  { id: 'mcgowan', tier: 6, name: 'Seth McGowan', pos: 'RB', team: 'IND', college: 'Kentucky', pick: 237, s: ['RUSH — 2025: 165-725-12TD (4.4)', 'REC  — 2025: 19-126-0TD', 'MISC — Former Oklahoma signee, JUCO → Kentucky, TD-heavy SEC back'] },
  { id: 'miller-jam', tier: 6, name: 'Jam Miller', pos: 'RB', team: 'NE', college: 'Alabama', pick: 245, s: ['RUSH — 2025: 130-504-3TD (3.9)', 'REC  — 2025: 19-109-0TD', 'MISC — Alabama committee back, modest senior-year production'] },
  { id: 'burks', tier: 6, name: 'Deion Burks', pos: 'WR', team: 'IND', college: 'Oklahoma', pick: 254, s: ['REC  — 2023 (Purdue): 47-629-7TD (13.4) | 2024 (Oklahoma): 31-245-3TD (7.9) | 2025 (Oklahoma): 57-620-4TD (10.9)', 'RUSH — 2023: 4-12-0TD | 2024: 5-32-0TD | 2025: 6-(-1)-0TD', 'MISC — Purdue → Oklahoma slot/underneath receiver with more volume than card shows'] },
  { id: 'smack', tier: 7, name: 'Trey Smack', pos: 'K', team: 'GB', college: 'Florida', pick: 216, s: ['FG   — 2025: 18-22 (81.8%), long 56 | XP: 27-28', 'KO   — 2025: 46 touchbacks on 60 kickoffs (76.7%)', 'MISC — Lou Groza finalist, 53-64 career FG, 100-101 career XP, reliable long-range leg'] },
  { id: 'endries', tier: 7, name: 'Jack Endries', pos: 'TE', team: 'CIN', college: 'Texas', pick: 221, s: ['REC  — 2025: 33-346-3TD (10.5)', 'MISC — Cal → Texas transfer, possession TE, moderate receiving role'] },
  { id: 'kanak', tier: 7, name: 'Jaren Kanak', pos: 'TE', team: 'TEN', college: 'Oklahoma', pick: 225, s: ['REC  — 2025: 44-533-0TD (12.1)', 'MISC — Former LB convert, Oklahoma receiving TE, athletic developmental profile'] },
  { id: 'morton', tier: 7, name: 'Behren Morton', pos: 'QB', team: 'NE', college: 'Texas Tech', pick: 234, s: ['PASS — 2025: 219-332, 2780 yds, 22 TD, 6 INT, 66.0%', 'RUSH — 2025: 43-(-113)-0TD', 'MISC — Texas Tech passer, efficient senior season, no fantasy rushing floor'] },
  { id: 'ryan', tier: 7, name: 'Carsen Ryan', pos: 'TE', team: 'CLE', college: 'BYU', pick: 248, s: ['REC  — 2025: 45-620-3TD (13.8)', 'PR   — 2025: 1-14-0TD', 'MISC — UCLA → BYU transfer, productive receiving TE, not blocking-only'] },
  { id: 'nussmeier', tier: 7, name: 'Garrett Nussmeier', pos: 'QB', team: 'KC', college: 'LSU', pick: 249, s: ['PASS — 2025: 194-288, 1927 yds, 12 TD, 5 INT, 67.4%', 'RUSH — 2025: 29-(-57)-1TD', 'MISC — LSU QB, 9-game 2025 season, limited rushing value'] },
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

function computeTierBreaksFromAssignment(players: Array<{ id: string }>, customTiers: string[], playerCustomTier: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const tier of customTiers) {
    const firstIdx = players.findIndex(p => playerCustomTier[String(p.id)] === tier);
    if (firstIdx >= 0) result[tier] = firstIdx;
  }
  return result;
}

function buildBoardData(
  players: BoardPlayer[],
  scoutingUrl: string,
  customTiers: string[],
  tierBreaks: Record<string, number>,
  myPicks: string,
  customTagsList: string[],
  playerTags: Record<string, string[]>,
) {
  const orderIds = players.map((p) => String(p.id));
  const unlikely: Record<string, boolean> = {};
  const noFit: Record<string, boolean> = {};
  const target: Record<string, boolean> = {};
  const notes: Record<string, string> = {};
  const playerCustomTier: Record<string, string> = {};
  players.forEach((p, idx) => {
    const id = String(p.id);
    if (p.unlikely) unlikely[id] = true;
    if (p.noFit) noFit[id] = true;
    if (p.target) target[id] = true;
    if (typeof p.userNote === 'string' && p.userNote.trim()) notes[id] = p.userNote;
    let best = ''; let bestBreak = -1;
    for (const t of customTiers) { const b = tierBreaks[t] ?? -1; if (b >= 0 && b <= idx && b > bestBreak) { bestBreak = b; best = t; } }
    if (best) playerCustomTier[id] = best;
  });
  return {
    orderIds,
    unlikely,
    noFit,
    target,
    notes,
    customTiers,
    tierBreaks,
    playerCustomTier,
    customTagsList,
    playerTags,
    scoutingUrl: scoutingUrl || '/api/team-prospect-draftboard/scouting',
    myPicks: myPicks.trim(),
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
  const rawTierBreaks = data.tierBreaks && typeof data.tierBreaks === 'object' && !Array.isArray(data.tierBreaks)
    ? Object.fromEntries(Object.entries(data.tierBreaks as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
    : null;
  const tierBreaks: Record<string, number> = rawTierBreaks ?? computeTierBreaksFromAssignment(next, customTiers, playerCustomTier);
  const customTagsList = Array.isArray(data.customTagsList)
    ? data.customTagsList.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const playerTags = data.playerTags && typeof data.playerTags === 'object' && !Array.isArray(data.playerTags)
    ? (data.playerTags as Record<string, string[]>)
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
    tierBreaks,
    customTagsList,
    playerTags,
    myPicks: typeof data.myPicks === 'string' ? data.myPicks : '',
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

function toOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function SettingsModal({ open, onClose, scoutingUrl, onSaveUrl, myPicks, onSavePicks }: { open: boolean; onClose: () => void; scoutingUrl: string; onSaveUrl: (url: string) => void; myPicks: string; onSavePicks: (picks: string) => void }) {
  const [url, setUrl] = useState(scoutingUrl || '');
  const [picks, setPicks] = useState(myPicks || '');
  useEffect(() => { if (open) { setUrl(scoutingUrl || ''); setPicks(myPicks || ''); } }, [open, scoutingUrl, myPicks]);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '20px', width: '100%', maxWidth: '500px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: C.accent, letterSpacing: '2px', marginBottom: '14px' }}>SETTINGS</div>
        <div style={{ marginBottom: '6px', fontSize: '12px', color: C.textMuted }}>Scouting JSON URL</div>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/scouting-reports.json" style={{ width: '100%', padding: '8px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }} />
        <div style={{ marginTop: '14px', marginBottom: '6px', fontSize: '12px', color: C.textMuted }}>My Draft Picks <span style={{ color: C.textDim }}>(comma-separated overall picks, e.g. 24, 58, 96)</span></div>
        <input type="text" value={picks} onChange={(e) => setPicks(e.target.value)} placeholder="e.g. 24, 58, 96, 132" style={{ width: '100%', padding: '8px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }} />
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '8px 14px', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { onSaveUrl(url.trim()); onSavePicks(picks.trim()); onClose(); }} style={{ background: C.primary, border: `1px solid ${C.accent}`, color: C.text, padding: '8px 14px', borderRadius: '3px', cursor: 'pointer', fontWeight: 600 }}>Save</button>
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
  const [scoutingUrl, setScoutingUrl] = useState('/api/team-prospect-draftboard/scouting');
  const [scoutingCache, setScoutingCache] = useState<Record<string, unknown> | null>(null);
  const [scoutingStatus, setScoutingStatus] = useState('no-url');
  const [scoutingError, setScoutingError] = useState('');
  const [teamName, setTeamName] = useState<string>('');
  const [teamDraftPicks, setTeamDraftPicks] = useState<Array<{ label: string }>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [customTiers, setCustomTiers] = useState<string[]>([]);
  const [tierBreaks, setTierBreaks] = useState<Record<string, number>>({});
  const [draggedTierDiv, setDraggedTierDiv] = useState<string | null>(null);
  const [newTierName, setNewTierName] = useState('');
  const [customTagsList, setCustomTagsList] = useState<string[]>([]);
  const [playerTags, setPlayerTags] = useState<Record<string, string[]>>({});
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [boardView, setBoardView] = useState<'board' | 'notes' | 'mock'>('board');
  const [myPicks, setMyPicks] = useState('');
  const [mockDraftOrder, setMockDraftOrder] = useState<string[]>([]);
  const [mockDraftSlots, setMockDraftSlots] = useState<Array<{ round: number; slot: number; ownerTeam: string }>>([]);
  const [collapsedTiers, setCollapsedTiers] = useState<Record<string, boolean>>({});
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
        setTierBreaks(applied.tierBreaks || {});
        setCustomTagsList(applied.customTagsList || []);
        setPlayerTags(applied.playerTags || {});
        setMyPicks(applied.myPicks || '');
        if (typeof body?.team === 'string') setTeamName(body.team);
        saveLocalBackup(body?.data || {});
        setSaveError('');
      } catch (remoteError) {
        const backup = loadLocalBackup();
        const applied = backup ? applySavedBoardData(backup) : null;
        setPlayers(applied ? applied.players : DEFAULT_PLAYERS.map((p) => ({ ...p })));
        setScoutingUrl(applied ? applied.scoutingUrl : '/api/team-prospect-draftboard/scouting');
        setCustomTiers(applied?.customTiers || []);
        setTierBreaks(applied?.tierBreaks || {});
        setCustomTagsList(applied?.customTagsList || []);
        setPlayerTags(applied?.playerTags || {});
        setMyPicks(applied?.myPicks || '');
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
    if (!teamName) return;
    fetch('/api/draft/next-order')
      .then(r => r.json())
      .then((data: { roundsData?: Array<{ round: number; picks: Array<{ slot: number; ownerTeam: string }> }> }) => {
        const result: Array<{ label: string }> = [];
        for (const rd of (data.roundsData || [])) {
          for (const pk of rd.picks) {
            if (pk.ownerTeam.toLowerCase() === teamName.toLowerCase()) {
              result.push({ label: `${rd.round}.${String(pk.slot).padStart(2, '0')}` });
            }
          }
        }
        setTeamDraftPicks(result);
      })
      .catch(() => {});
  }, [teamName]);

  useEffect(() => {
    if (loading || !canEdit) return;
    const t = setTimeout(async () => {
      const boardData = buildBoardData(players, scoutingUrl, customTiers, tierBreaks, myPicks, customTagsList, playerTags);
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
  }, [players, scoutingUrl, loading, canEdit, customTiers, tierBreaks, myPicks, customTagsList, playerTags]);

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
    setTierBreaks({});
    setCustomTagsList([]);
    setPlayerTags({});
    setTagFilter(null);
    setMyPicks('');
    setMockDraftOrder([]);
    setMockDraftSlots([]);
  };

  const togglePlayerTag = (id: string, tag: string) => {
    if (!canEdit) return;
    setPlayerTags(prev => { const cur = prev[id] || []; return { ...prev, [id]: cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag] }; });
  };

  const exportCSV = () => {
    const ranked = players.map((p, i) => ({ ...p, _rank: i + 1 }));
    const headers = ['Rank', 'Name', 'Position', 'NFL Team', 'College', 'NFL Pick', 'Tags', 'Target', 'Monitor', 'Avoid', 'Tier', 'Notes'];
    const rows = ranked.map((p) => {
      const pId = String(p.id);
      const i = p._rank - 1;
      let tier = ''; let bestBreak = -1;
      for (const t of customTiers) { const b = tierBreaks[t] ?? -1; if (b >= 0 && b <= i && b > bestBreak) { bestBreak = b; tier = t; } }
      return [String(p._rank), String(p.name), String(p.pos), String(p.team), String(p.college), String(p.pick), (playerTags[pId] || []).join('; '), p.target ? 'Yes' : '', p.unlikely ? 'Yes' : '', p.noFit ? 'Yes' : '', tier, String(p.userNote || '')].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.csv`; a.click();
  };

  const exportExcel = () => {
    const ranked = players.map((p, i) => ({ ...p, _rank: i + 1 }));
    const rows = ranked.map((p) => {
      const pId = String(p.id);
      const i = p._rank - 1;
      let tier = ''; let bestBreak = -1;
      for (const t of customTiers) { const b = tierBreaks[t] ?? -1; if (b >= 0 && b <= i && b > bestBreak) { bestBreak = b; tier = t; } }
      return { Rank: p._rank, Name: String(p.name), Position: String(p.pos), 'NFL Team': String(p.team), College: String(p.college), 'NFL Pick': Number(p.pick), Tags: (playerTags[pId] || []).join(', '), Target: p.target ? 'Yes' : '', Monitor: p.unlikely ? 'Yes' : '', Avoid: p.noFit ? 'Yes' : '', Tier: tier, Notes: String(p.userNote || '') };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Draft Board');
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };

  if (loading) return <div style={{ minHeight: '50vh', background: C.bg, color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif' }}>Loading draft board...</div>;

  const rankedPlayers = players.map((p, idx) => ({ ...p, _absIdx: idx }));
  const title = teamName ? `${teamName} Prospect Draft Board` : 'Team Prospect Draft Board';
  const notedPlayers = rankedPlayers.filter(p => p.userNote && String(p.userNote).trim());
  const filteredPlayers = rankedPlayers.filter(p => {
    if (posFilter !== 'ALL' && p.pos !== posFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return String(p.name).toLowerCase().includes(q) || String(p.team).toLowerCase().includes(q) || String(p.college).toLowerCase().includes(q);
    }
    return true;
  });
  const tagFilteredPlayers = tagFilter ? filteredPlayers.filter(p => (playerTags[String(p.id)] || []).includes(tagFilter)) : filteredPlayers;
  const playersToShow = boardView === 'notes' ? notedPlayers : tagFilteredPlayers;

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgGrad} 100%)`, color: C.text, fontFamily: '"Georgia", "Times New Roman", serif', paddingBottom: '60px', overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: `${C.bg}f0`, backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.border}`, padding: '12px 14px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div><div style={{ fontSize: '19px', fontWeight: 700, color: C.text, letterSpacing: '1.5px', lineHeight: 1.1 }}>{title}</div><div style={{ fontSize: '10px', color: C.accent, letterSpacing: '2.5px', marginTop: '3px' }}>2026 PROSPECT DRAFT BOARD{boardView === 'mock' ? <span style={{ color: C.warning, marginLeft: '8px' }}>· MOCK DRAFT MODE</span> : null}</div></div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {saveStatus && <span style={{ fontSize: '11px', color: C.accent, display: 'flex', alignItems: 'center', gap: '4px' }}><Save size={12} /> {saveStatus}</span>}
              {saveError && <span style={{ fontSize: '11px', color: C.unlikely }}>{saveError}</span>}
              {canEdit && <button onClick={reset} title="Reset to NFL draft order" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 10px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}><RotateCcw size={12} /></button>}
              <button onClick={exportCSV} title="Download CSV" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 10px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', letterSpacing: '1px' }}><Download size={12} /> CSV</button>
              <button onClick={exportExcel} title="Download Excel (.xlsx)" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 10px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', letterSpacing: '1px' }}><Download size={12} /> XLSX</button>
              <button onClick={() => window.print()} title="Print / Save as PDF" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 10px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}><Printer size={12} /></button>
            </div>
          </div>
          {teamDraftPicks.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '9.5px', color: C.textDim, letterSpacing: '2px', fontWeight: 700 }}>MY PICKS</span>
              {teamDraftPicks.map(pk => <span key={pk.label} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '3px', background: `${C.primary}33`, border: `1px solid ${C.accent}44`, color: C.accent, fontFamily: 'monospace' }}>{pk.label}</span>)}
            </div>
          )}
        </div>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '14px' }}>
        {scoutingStatus === 'error' && <div style={{ padding: '10px 12px', marginBottom: '14px', background: `${C.warning}1a`, border: `1px solid ${C.warning}55`, borderRadius: '4px', fontSize: '12px', color: C.warning, lineHeight: '1.5', display: 'flex', alignItems: 'flex-start', gap: '8px' }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /><div><strong>Scouting reports failed to load.</strong> {scoutingError}.</div></div>}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px', flexWrap: 'wrap' }}>
          {((['board', ...(canEdit ? ['notes', 'mock'] : [])]) as Array<'board' | 'notes' | 'mock'>).map(v => {
            const labels: Record<string, string> = { board: 'BOARD', notes: `MY NOTES${notedPlayers.length > 0 ? ` (${notedPlayers.length})` : ''}`, mock: 'MOCK DRAFT' };
            return (
              <button key={v} onClick={() => {
                setBoardView(v);
                if (v === 'mock' && boardView !== 'mock') {
                  setMockDraftOrder([]);
                  fetch('/api/draft/next-order').then(r => r.json()).then((data: { roundsData?: Array<{ round: number; picks: Array<{ slot: number; ownerTeam: string }> }> }) => {
                    const slots = (data.roundsData || []).flatMap(rd => rd.picks.map(pk => ({ round: rd.round, slot: pk.slot, ownerTeam: pk.ownerTeam }))).sort((a, b) => a.round !== b.round ? a.round - b.round : a.slot - b.slot);
                    setMockDraftSlots(slots);
                  }).catch(() => setMockDraftSlots([]));
                } else if (v !== 'mock') {
                  setMockDraftOrder([]);
                  setMockDraftSlots([]);
                }
              }}
                style={{ background: boardView === v ? `${C.primary}44` : 'transparent', border: `1px solid ${boardView === v ? C.primary : C.border}`, color: boardView === v ? C.accent : C.textMuted, padding: '6px 14px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', letterSpacing: '1.5px', fontWeight: boardView === v ? 700 : 400 }}>
                {labels[v]}
              </button>
            );
          })}
        </div>
        {boardView !== 'notes' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1', minWidth: '160px' }}>
              <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.textDim, pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players..." style={{ width: '100%', paddingLeft: '28px', padding: '7px 8px 7px 28px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '12px' }} />
            </div>
            {['ALL','QB','RB','WR','TE','K'].map(pos => (
              <button key={pos} onClick={() => setPosFilter(pos)}
                style={{ background: posFilter === pos ? `${(POS_COLORS[pos] || C.primary)}33` : 'transparent', border: `1px solid ${posFilter === pos ? (POS_COLORS[pos] || C.primary) : C.border}`, color: posFilter === pos ? (POS_COLORS[pos] || C.accent) : C.textMuted, padding: '6px 12px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', letterSpacing: '1px', fontWeight: posFilter === pos ? 700 : 400 }}>
                {pos}
              </button>
            ))}
          </div>
        )}
        {boardView !== 'mock' && customTagsList.length > 0 && (
          <div style={{ marginBottom: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: C.textDim, letterSpacing: '1.5px', fontWeight: 700 }}>FILTER BY TAG:</span>
            {tagFilter && <button onClick={() => setTagFilter(null)} style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '3px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer', letterSpacing: '1px' }}>CLEAR ×</button>}
            {customTagsList.map(tag => {
              const count = rankedPlayers.filter(p => (playerTags[String(p.id)] || []).includes(tag)).length;
              const isActive = tagFilter === tag;
              return (
                <button key={tag} onClick={() => setTagFilter(isActive ? null : tag)} style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '3px', background: isActive ? `${C.accent}22` : 'transparent', border: `1px solid ${isActive ? C.accent : C.border}`, color: isActive ? C.accent : C.textMuted, cursor: 'pointer', letterSpacing: '1px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Tag size={9} />{tag}{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
        )}
        {boardView === 'mock' && (
          <div style={{ padding: '10px 12px', marginBottom: '12px', background: `${C.warning}1a`, border: `1px solid ${C.warning}55`, borderRadius: '4px', fontSize: '12px', color: C.warning, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span><strong>Mock Draft Mode</strong> — click DRAFT on any card to simulate picking. Picks reset on exit.</span>
            <button onClick={() => { setBoardView('board'); setMockDraftOrder([]); setMockDraftSlots([]); }} style={{ background: 'transparent', border: `1px solid ${C.warning}88`, color: C.warning, padding: '4px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}>Exit Mock</button>
          </div>
        )}
        <div style={{ padding: '10px 12px', background: `${C.primary}14`, border: `1px solid ${C.border}`, borderRadius: '4px', marginBottom: '14px', fontSize: '12px', color: C.textMuted, lineHeight: '1.7' }}>
          <strong style={{ color: C.accent }}>Flags (toggle independently):</strong><br />
          <span style={{ color: C.target }}>✓ green</span> = Target · <span style={{ color: C.unlikely }}>👁 amber</span> = Monitor · <span style={{ color: C.noFit }}>✕ red</span> = Avoid
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
            {customTiers.length > 0 && (
              <div>
                <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '1.5px', marginBottom: '5px' }}>DRAG DIVIDERS ONTO BOARD TO PLACE · DRAG ON BOARD TO REPOSITION</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {customTiers.map((tier) => {
                    const isPlaced = (tierBreaks[tier] ?? -1) >= 0;
                    return (
                      <span key={tier} draggable onDragStart={() => setDraggedTierDiv(tier)} onDragEnd={() => setDraggedTierDiv(null)} title={isPlaced ? `Drag to reposition "${tier}"` : `Drag onto board to place "${tier}"`} style={{ fontSize: '11px', border: `1px solid ${isPlaced ? C.accent : C.border}`, borderRadius: '999px', padding: '2px 8px 2px 6px', color: isPlaced ? C.accent : C.textMuted, cursor: 'grab', display: 'inline-flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                        <span style={{ fontSize: '12px', color: C.textDim, lineHeight: 1 }}>⠿</span>
                        {tier}
                        {!isPlaced && <span style={{ fontSize: '9px', color: C.textDim }}>· place</span>}
                        <button onClick={(e) => { e.stopPropagation(); setCustomTiers(prev => prev.filter(t => t !== tier)); setTierBreaks(prev => { const n = { ...prev }; delete n[tier]; return n; }); }} style={{ background: 'transparent', border: 'none', color: C.textDim, cursor: 'pointer', padding: '0 0 0 3px', fontSize: '13px', lineHeight: 1 }}>×</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {canEdit && (
          <div style={{ marginBottom: '14px', padding: '10px 12px', background: `${C.primary}14`, border: `1px solid ${C.border}`, borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '8px' }}>CUSTOM TAGS</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: customTagsList.length > 0 ? '8px' : '0' }}>
              <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const t = newTagName.trim(); if (t && !customTagsList.includes(t)) { setCustomTagsList(prev => [...prev, t]); setNewTagName(''); } } }} placeholder="Add a tag (e.g., Targets, Watch List)" style={{ flex: 1, padding: '8px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '12px' }} />
              <button onClick={() => { const t = newTagName.trim(); if (!t || customTagsList.includes(t)) return; setCustomTagsList(prev => [...prev, t]); setNewTagName(''); }} style={{ background: `${C.primary}99`, border: `1px solid ${C.primary}`, color: C.text, borderRadius: '4px', padding: '8px 10px', fontSize: '12px', cursor: 'pointer' }}>Add</button>
            </div>
            {customTagsList.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {customTagsList.map(tag => {
                  const count = rankedPlayers.filter(p => (playerTags[String(p.id)] || []).includes(tag)).length;
                  return (
                    <span key={tag} style={{ fontSize: '11px', border: `1px solid ${C.border}`, borderRadius: '999px', padding: '2px 8px 2px 10px', color: C.accent, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Tag size={10} />{tag}{count > 0 && <span style={{ color: C.textDim, fontSize: '10px' }}>({count})</span>}
                      <button onClick={() => { setCustomTagsList(prev => prev.filter(t => t !== tag)); setPlayerTags(prev => { const n = { ...prev }; Object.keys(n).forEach(id => { n[id] = (n[id] || []).filter(t => t !== tag); }); return n; }); if (tagFilter === tag) setTagFilter(null); }} style={{ background: 'transparent', border: 'none', color: C.textDim, cursor: 'pointer', padding: '0', fontSize: '13px', lineHeight: 1 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {playersToShow.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: C.textDim, fontSize: '13px', border: `1px dashed ${C.border}`, borderRadius: '4px' }}>
            {boardView === 'notes' ? 'No notes yet — expand a player and write notes to see them here.' : 'No players match your search or filter.'}
          </div>
        )}
        {(() => {
          return playersToShow.flatMap((p) => {
            const pId = String(p.id);
            const rank = rankedPlayers.findIndex(rp => rp.id === p.id) + 1;
            const rankIdx = rank - 1;
            const items: React.ReactNode[] = [];
            if (boardView === 'board') {
              for (const tierName of customTiers) {
                if ((tierBreaks[tierName] ?? -1) === rankIdx) {
                  const isCollapsed = !!collapsedTiers[tierName];
                  const tierDivId = `tier-${tierName}`;
                  items.push(
                    <div key={tierDivId}
                      draggable={canEdit}
                      onDragStart={(e) => { e.stopPropagation(); setDraggedTierDiv(tierName); }}
                      onDragEnd={() => { setDraggedTierDiv(null); setDragOverId(null); }}
                      onClick={() => setCollapsedTiers(prev => ({ ...prev, [tierName]: !prev[tierName] }))}
                      onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); if (dragOverId !== tierDivId) setDragOverId(tierDivId); }}
                      onDrop={(e) => { e.preventDefault(); if (draggedTierDiv && draggedTierDiv !== tierName) { setTierBreaks(prev => ({ ...prev, [draggedTierDiv]: rankIdx })); setDraggedTierDiv(null); } else if (!draggedTierDiv && draggedId) { onDrop(e, pId); } setDragOverId(null); }}
                      onDragLeave={() => { if (dragOverId === tierDivId) setDragOverId(null); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', margin: '10px 0 3px 0', background: dragOverId === tierDivId ? `${C.accent}22` : `${C.primary}22`, border: `2px solid ${dragOverId === tierDivId ? C.accent : `${C.primary}44`}`, borderRadius: '3px', cursor: canEdit ? 'grab' : 'pointer', userSelect: 'none', transition: 'border-color 0.1s, background 0.1s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {canEdit && <span style={{ fontSize: '13px', color: C.textDim }}>⠿</span>}
                        <span style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700 }}>{tierName}</span>
                      </div>
                      <span style={{ color: C.accent, fontSize: '11px' }}>{isCollapsed ? '▶ SHOW' : '▼ HIDE'}</span>
                    </div>
                  );
                }
              }
            }
            const assignedTier = (() => {
              if (boardView !== 'board') return '';
              let best = ''; let bestBreak = -1;
              for (const t of customTiers) { const b = tierBreaks[t] ?? -1; if (b >= 0 && b <= rankIdx && b > bestBreak) { bestBreak = b; best = t; } }
              return best;
            })();
            if (boardView === 'board' && assignedTier && collapsedTiers[assignedTier]) return items;
            const isMockDrafted = boardView === 'mock' && mockDraftOrder.includes(pId);
            const mockPickIdx = isMockDrafted ? mockDraftOrder.indexOf(pId) : -1;
            const mockPickNum = mockPickIdx + 1;
            const mockSlot = mockPickIdx >= 0 ? mockDraftSlots[mockPickIdx] : null;
            const mockPickLabel = mockSlot ? `${mockSlot.round}.${String(mockSlot.slot).padStart(2, '0')}` : '';
            const mockTeamLabel = mockSlot?.ownerTeam || '';
            const isExpanded = expandedId === p.id;
            const idx = p._absIdx;
            const flagColors = getFlagColors(p);
            items.push(
              <div key={pId} draggable={canEdit && boardView !== 'mock'} onDragStart={() => setDraggedId(pId)} onDragOver={(e) => { if (!canEdit || boardView === 'mock') return; e.preventDefault(); if (!draggedTierDiv && dragOverId !== p.id) setDragOverId(pId); }} onDrop={(e) => { if (draggedTierDiv) { setTierBreaks(prev => ({ ...prev, [draggedTierDiv]: rankIdx })); setDraggedTierDiv(null); setDragOverId(null); e.preventDefault(); } else { onDrop(e, pId); } }} onDragEnd={() => { setDraggedId(null); setDragOverId(null); }} style={{ background: isMockDrafted ? C.bg : flagColors.bg, border: `1px solid ${isMockDrafted ? C.border : flagColors.border}`, borderRadius: '4px', marginBottom: '5px', opacity: isMockDrafted ? 0.3 : (draggedId === p.id ? 0.4 : 1), position: 'relative' }}>
                {isMockDrafted && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none', gap: '3px' }}>
                  {(mockTeamLabel || mockPickLabel) && <div style={{ fontSize: '11px', color: C.warning, fontWeight: 700, background: `${C.bg}e0`, padding: '1px 10px', borderRadius: '3px' }}>{mockTeamLabel}{mockPickLabel ? ` • ${mockPickLabel}` : ''}</div>}
                  <div style={{ fontSize: '9px', letterSpacing: '3px', color: C.textDim, fontWeight: 700, background: `${C.bg}cc`, padding: '2px 10px', borderRadius: '3px' }}>{toOrdinal(mockPickNum)} OVERALL · DRAFTED</div>
                </div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button disabled={!canEdit} onClick={() => moveByOne(idx, -1)} aria-label="Up" style={{ background: 'transparent', border: 'none', color: flagColors.color !== C.text ? flagColors.color : C.accent, cursor: canEdit ? 'pointer' : 'default', padding: '2px', display: 'flex', opacity: canEdit ? 1 : 0.4 }}><ChevronUp size={16} /></button>
                    <button disabled={!canEdit} onClick={() => moveByOne(idx, 1)} aria-label="Down" style={{ background: 'transparent', border: 'none', color: flagColors.color !== C.text ? flagColors.color : C.accent, cursor: canEdit ? 'pointer' : 'default', padding: '2px', display: 'flex', opacity: canEdit ? 1 : 0.4 }}><ChevronDown size={16} /></button>
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: flagColors.color !== C.text ? flagColors.color : C.accent, minWidth: '28px', textAlign: 'center' }}>{rank}</div>
                  <div onClick={() => toggleExpand(pId)} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: flagColors.color }}>{String(p.name)}</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, color: 'white', letterSpacing: '0.5px', background: POS_COLORS[String(p.pos)] || '#666', opacity: (p.unlikely || p.noFit) && !p.target ? 0.6 : 1 }}>{String(p.pos)}</span>
                      <span style={{ fontSize: '12px', color: flagColors.color !== C.text ? flagColors.color : C.textMuted }}>{String(p.team)}</span>
                      <span style={{ fontSize: '11px', color: flagColors.color !== C.text ? `${flagColors.color}aa` : C.textDim }}>· {String(p.college)}</span>
                      <span style={{ fontSize: '11px', color: flagColors.color !== C.text ? `${flagColors.color}aa` : C.textDim }}>· NFL Pick #{Number(p.pick)}</span>
                    </div>
                    {(playerTags[pId] || []).length > 0 && <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '4px' }}>{(playerTags[pId] || []).map(tag => <span key={tag} style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '999px', background: `${C.accent}22`, border: `1px solid ${C.accent}44`, color: C.accent }}>{tag}</span>)}</div>}
                    {boardView === 'notes' && p.userNote && !isExpanded && <div style={{ marginTop: '5px', fontSize: '12px', color: C.textMuted, fontStyle: 'italic', lineHeight: '1.4' }}>{String(p.userNote).length > 160 ? String(p.userNote).substring(0, 160) + '…' : String(p.userNote)}</div>}
                  </div>
                  <button disabled={!canEdit} onClick={() => toggleFlag(pId, 'target')} title={p.target ? 'Remove Target' : 'Mark as Target'} style={{ background: 'transparent', border: 'none', color: p.target ? C.target : C.textDim, cursor: canEdit ? 'pointer' : 'default', padding: '4px', display: 'flex', opacity: canEdit ? 1 : 0.5 }}><Check size={15} /></button>
                  <button disabled={!canEdit} onClick={() => toggleFlag(pId, 'unlikely')} title={p.unlikely ? 'Remove Monitor' : 'Mark as Monitor'} style={{ background: 'transparent', border: 'none', color: p.unlikely ? C.unlikely : C.textDim, cursor: canEdit ? 'pointer' : 'default', padding: '4px', display: 'flex', opacity: canEdit ? 1 : 0.5 }}>{p.unlikely ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <button disabled={!canEdit} onClick={() => toggleFlag(pId, 'noFit')} title={p.noFit ? 'Remove Avoid' : 'Mark as Avoid'} style={{ background: 'transparent', border: 'none', color: p.noFit ? C.noFit : C.textDim, cursor: canEdit ? 'pointer' : 'default', padding: '4px', display: 'flex', opacity: canEdit ? 1 : 0.5 }}><X size={15} /></button>
                  {boardView === 'mock' && <button onClick={() => setMockDraftOrder(prev => isMockDrafted ? prev.filter(id => id !== pId) : [...prev, pId])} title={isMockDrafted ? 'Undo Draft' : 'Draft this player'} style={{ background: isMockDrafted ? `${C.textDim}22` : `${C.accent}22`, border: `1px solid ${isMockDrafted ? C.textDim : C.accent}88`, color: isMockDrafted ? C.textDim : C.accent, cursor: 'pointer', padding: '3px 8px', borderRadius: '3px', fontSize: '10px', letterSpacing: '1px', fontWeight: 700 }}>{isMockDrafted ? 'UNDO' : 'DRAFT'}</button>}
                  <button onClick={() => toggleExpand(pId)} aria-label={isExpanded ? 'Collapse' : 'Expand'} style={{ background: 'transparent', border: 'none', color: C.accent, cursor: 'pointer', padding: '4px', display: 'flex' }}>{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                </div>
                {isExpanded && <div style={{ padding: '0 14px 14px 14px', borderTop: `1px solid ${C.border}`, marginTop: '4px' }}>
                  {canEdit && assignedTier && <div style={{ marginTop: '8px', fontSize: '11px', color: C.textMuted }}><span style={{ color: C.textDim }}>Tier: </span><span style={{ color: C.accent }}>{assignedTier}</span></div>}
                  {canEdit && customTagsList.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>TAGS</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {customTagsList.map(tag => { const isTagged = (playerTags[pId] || []).includes(tag); return <button key={tag} onClick={() => togglePlayerTag(pId, tag)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', border: `1px solid ${isTagged ? C.accent : C.border}`, background: isTagged ? `${C.accent}22` : 'transparent', color: isTagged ? C.accent : C.textMuted, cursor: 'pointer' }}>{isTagged ? '✓ ' : ''}{tag}</button>; })}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '14px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>COLLEGE PRODUCTION</div><div style={{ display: 'grid', gap: '3px' }}>{(Array.isArray(p.s) ? p.s : []).map((line: string, i: number) => <div key={i} style={{ fontSize: '12.5px', padding: '3px 0', borderBottom: `1px dotted ${C.border}`, color: C.textMuted, lineHeight: '1.4' }}>{line}</div>)}</div></div>
                  <div style={{ marginTop: '14px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>SCOUTING REPORT</div><ScoutingSection playerId={pId} scoutingUrl={scoutingUrl} scoutingCache={scoutingCache} scoutingStatus={scoutingStatus} scoutingError={scoutingError} /></div>
                  <div style={{ marginTop: '14px' }}><div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '6px' }}>MY NOTES</div><textarea disabled={!canEdit} value={String(p.userNote || '')} onChange={(e) => updatePlayer(pId, { userNote: e.target.value })} placeholder={canEdit ? 'Add your own notes...' : 'Sign in to add notes'} style={{ width: '100%', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '8px', fontSize: '14px', minHeight: '70px', resize: 'vertical', opacity: canEdit ? 1 : 0.7 }} /></div>
                </div>}
              </div>
            );
            return items;
          });
        })()}
      </div>
    </div>
  );
}

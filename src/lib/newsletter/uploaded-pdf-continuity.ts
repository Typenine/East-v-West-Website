import { TEAM_NAMES } from '@/lib/constants/league';
import { extractText, getDocumentProxy } from 'unpdf';

export interface UploadedPdfContinuity {
  masonText: string;
  westyText: string;
  playerNames: string[];
  confidence: number;
  notes: string[];
  model: string;
}

type Speaker = 'mason' | 'westy';

type StructuredPick = {
  text: string;
  probe: string;
  team?: string;
  playerName?: string;
};

type StructuredSeasonPicks = Record<Speaker, StructuredPick[]> & { playerNames: string[] };

const MAX_PAGES = 80;
const MAX_HOST_CHARS = 120_000;
const PDF_TIMEOUT_MS = 90_000;

const SECTION_PATTERNS: Array<[RegExp, string]> = [
  [/OFFICIAL\s+SEASON\s+PICKS/i, 'OFFICIAL SEASON PICKS'],
  [/BOLD\s+PREDICTIONS?/i, 'BOLD PREDICTIONS'],
  [/POWER\s+RANKINGS?/i, 'POWER RANKINGS'],
  [/FINAL\s+RECEIPTS?/i, 'FINAL RECEIPTS'],
  [/THE\s+DISAGREEMENTS?/i, 'DISAGREEMENTS'],
  [/LEAGUE\s+PRESSURE/i, 'LEAGUE PRESSURE'],
  [/FREE\s+AGENCY/i, 'FREE AGENCY'],
  [/TRADE\s+ANALYSIS/i, 'TRADE ANALYSIS'],
  [/OPENING\s+EXCHANGE/i, 'OPENING EXCHANGE'],
  [/FINAL\s+CONVERSATION/i, 'FINAL CONVERSATION'],
  [/FINAL\s+WORD/i, 'FINAL WORD'],
];

function normalizeLine(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function normalizeHostText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_HOST_CHARS);
}

function prepareRawText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/([^\n])(?=EAST\s+v\.?\s+WEST\b)/g, '$1\n')
    .replace(/([^\n])(?=MASON REED\b)/g, '$1\n')
    .replace(/([^\n])(?=TRENT\s+["“”']?WESTY["“”']?\s+WESTON\b)/g, '$1\n')
    .replace(/([^"“”'\n])(?=WESTY\b)/g, '$1\n');
}

function sectionContextFromLine(line: string): string | null {
  for (const [pattern, label] of SECTION_PATTERNS) {
    if (pattern.test(line)) return label;
  }
  return null;
}

function teamContextFromLine(line: string): string | null {
  const normalized = normalizeLine(line);
  if (normalized.length > 150) return null;
  const lower = normalized.toLowerCase();
  for (const team of [...TEAM_NAMES].sort((a, b) => b.length - a.length)) {
    if (!lower.includes(team.toLowerCase())) continue;
    const looksLikeHeader =
      /^\d{1,2}\s*[/.)-]/.test(normalized) ||
      /POWER\s+RANKINGS?|RECEIVES|TRADE GRADES|BOTTOM LINE|CENTRAL STORIES|CHAMPION|CHAMPIONSHIP|TITLE PICK|PROJECTED FINISH|DEFINING PLAYER|HIGHEST-SCORING|POINTS LEADER/i.test(normalized) ||
      normalized.toLowerCase() === team.toLowerCase();
    if (looksLikeHeader) return team;
  }
  return null;
}

function isSpeakerContextLine(line: string): boolean {
  return /^(?:CHAMPION(?:SHIP)?(?:\s+PICK)?|TITLE\s+PICK|PROJECTED\s+FINISH|DEFINING(?:\s+CHAMPIONSHIP)?\s+PLAYER|HIGHEST[- ]SCORING(?:\s+REGULAR[- ]SEASON)?\s+TEAM|POINTS\s+LEADER)\b\s*:?.*$/i.test(line);
}

function isSourceOrSidebarLine(line: string): boolean {
  if (/https?:\/\/|www\./i.test(line)) return true;
  if (/^(?:Yahoo Sports|ESPN|NFL\.com|The Athletic|CBS Sports|NBC Sports|Pro Football Talk|FantasyPros|Sleeper)\s*:/i.test(line)) return true;
  if (/^[A-Z][A-Za-z .&'-]{2,24}:\s+.{3,90}$/.test(line) && !/^(?:MASON REED|WESTY|TRENT|DEFINING|CHAMPION|CHAMPIONSHIP|PROJECTED|HIGHEST|POINTS|ON RECORD)/i.test(line)) return true;
  if (/^(?:THE CLAIM|THE HINGE|ON RECORD|BOTTOM LINE|TRADE GRADES|VERDICT|CENTRAL STORIES|THIS ISSUE|THE FORMAT|THE WINDOW|DATE FROZEN|NEXT JOB|AUTHORS|FIRST RECHECK|CLEAN COMPARISON|RISK AUDIT|ACCOUNTABILITY|MASON'S STANDARD|WESTY'S STANDARD)\b/i.test(line)) return true;
  return false;
}

function isNoiseLine(line: string, title: string): boolean {
  if (!line) return true;
  const simplified = line.replace(/[.·•/|_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const simpleTitle = title.replace(/[.·•/|_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/^\d{1,3}$/.test(line)) return true;
  if (/^east\s+v\.?\s+west$/i.test(line) || /^newsletter$/i.test(line)) return true;
  if (simpleTitle && simplified === simpleTitle) return true;
  if (/^20\d{2}\s+(?:season\s+preview|offseason\s+moves|free\s+agency|pre-draft|post-draft)\s+\d{1,3}$/i.test(line)) return true;
  if (/EAST\s+v\.?\s+WEST.*(?:20\d{2}|POWER RANKINGS|FREE AGENCY|TRADE ANALYSIS|OPENING EXCHANGE|FINAL)/i.test(line)) return true;
  if (/\b(?:MASON'S|WESTY'S)\s+POWER\s+RANKINGS\b/i.test(line)) return true;
  if (isSourceOrSidebarLine(line)) return true;
  if (line.length <= 90 && /^[A-Z0-9 "'&.,:/()\-]+$/.test(line) && !/[.!?]["']?$/.test(line)) return true;
  return false;
}

function isPublicationFurnitureLine(line: string, title: string): boolean {
  return isSourceOrSidebarLine(line) || /EAST\s+v\.?\s+WEST/i.test(line) || isNoiseLine(line, title);
}

function speakerMarker(rawLine: string): { speaker: Speaker; remainder: string } | null {
  const line = normalizeLine(rawLine);
  if (!line) return null;
  const lower = line.toLowerCase();
  if (lower.includes('mason reed') && (lower.includes('westy') || lower.includes('trent weston'))) return null;

  if (/^MASON REED$/i.test(line)) return { speaker: 'mason', remainder: '' };
  let match = line.match(/^MASON REED\s*[:\-–—]\s*(.+)$/i) ?? line.match(/^MASON REED\s+(.+)$/i);
  if (match) {
    const remainder = normalizeLine(match[1]);
    if (!isSourceOrSidebarLine(remainder) && !/POWER\s+RANKINGS?/i.test(remainder)) return { speaker: 'mason', remainder };
  }

  if (/^WESTY$/i.test(line)) return { speaker: 'westy', remainder: '' };
  match = line.match(/^WESTY\s*[:\-–—]\s*(.+)$/i) ?? line.match(/^WESTY\s+(.+)$/i);
  if (match) {
    const remainder = normalizeLine(match[1]);
    if (!isSourceOrSidebarLine(remainder) && !/POWER\s+RANKINGS?/i.test(remainder)) return { speaker: 'westy', remainder };
  }

  if (/^TRENT\s+["“”']?WESTY["“”']?\s+WESTON$/i.test(line) || /^TRENT WESTON$/i.test(line)) return { speaker: 'westy', remainder: '' };
  match = line.match(/^TRENT\s+["“”']?WESTY["“”']?\s+WESTON\s*[:\-–—]\s*(.+)$/i) ?? line.match(/^TRENT\s+["“”']?WESTY["“”']?\s+WESTON\s+(.+)$/i);
  if (match) {
    const remainder = normalizeLine(match[1]);
    if (!isSourceOrSidebarLine(remainder)) return { speaker: 'westy', remainder };
  }
  return null;
}

function explicitPredictionPlayerNames(rawText: string): string[] {
  const teamLower = new Set(TEAM_NAMES.map(team => team.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  const patterns = [
    /\b([A-Z][A-Za-z'’.-]{1,24}(?:\s+[A-Z][A-Za-z'’.-]{1,24}){1,3})\s+is\s+(?:my\s+)?defining(?:\s+championship)?\s+player\b/g,
    /\bmy\s+defining(?:\s+championship)?\s+player\s+is\s+([A-Z][A-Za-z'’.-]{1,24}(?:\s+[A-Z][A-Za-z'’.-]{1,24}){1,3})\b/g,
    /\bDEFINING(?:\s+CHAMPIONSHIP)?\s+PLAYER\s*[:\-–—]\s*([A-Z][A-Za-z'’.-]{1,24}(?:\s+[A-Z][A-Za-z'’.-]{1,24}){1,3})\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of rawText.matchAll(pattern)) {
      const value = normalizeLine(match[1].replace(/’/g, "'"));
      const lower = value.toLowerCase();
      if (teamLower.has(lower) || lower === 'mason reed' || lower === 'trent weston') continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(value);
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TEAM_PATTERN = [...TEAM_NAMES]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

function canonicalTeam(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeLine(value).toLowerCase();
  return TEAM_NAMES.find(team => team.toLowerCase() === normalized) ?? null;
}

function cleanPredictionPlayer(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeLine(value.replace(/’/g, "'"));
  if (normalized.length < 4 || normalized.length > 70 || /\d|https?:/i.test(normalized)) return null;
  const words = normalized.split(' ');
  if (words.length < 2 || words.length > 4) return null;
  if (!words.every(word => /^[A-Za-z][A-Za-z.'-]*$/.test(word))) return null;
  if (TEAM_NAMES.some(team => team.toLowerCase() === normalized.toLowerCase())) return null;
  return normalized;
}

function officialSeasonPickParagraphs(rawText: string): Partial<Record<Speaker, string>> {
  const compact = rawText.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  const markerIndex = compact.toLowerCase().lastIndexOf('official season picks');
  if (markerIndex < 0) return {};

  const tail = compact.slice(markerIndex, markerIndex + 14_000);
  const masonMarker = /\bMASON REED\b/i.exec(tail);
  if (!masonMarker) return {};

  const masonBodyStart = masonMarker.index + masonMarker[0].length;
  const afterMason = tail.slice(masonBodyStart);
  const westyMarker = /\bWESTY\b/i.exec(afterMason);
  if (!westyMarker) return {};

  const mason = normalizeLine(afterMason.slice(0, westyMarker.index));
  const westyBodyStart = westyMarker.index + westyMarker[0].length;
  const afterWesty = afterMason.slice(westyBodyStart);
  const nextMason = /\bMASON REED\b/i.exec(afterWesty);
  const westy = normalizeLine(afterWesty.slice(0, nextMason?.index ?? 3_500));

  return { mason, westy };
}

function structuredPicksFromParagraph(paragraph: string): StructuredPick[] {
  if (!paragraph) return [];
  const picks: StructuredPick[] = [];
  let championshipTeam: string | null = null;
  let championshipOpponent: string | null = null;

  const matchup = paragraph.match(new RegExp(`\\b(${TEAM_PATTERN})\\s+over\\s+(${TEAM_PATTERN})(?:\\s+in\\s+the\\s+final)?\\b`, 'i'));
  if (matchup) {
    championshipTeam = canonicalTeam(matchup[1]);
    championshipOpponent = canonicalTeam(matchup[2]);
    if (championshipTeam && championshipOpponent) {
      const saysFinal = /\bin\s+the\s+final\b/i.test(matchup[0]);
      picks.push({
        text: `${championshipTeam} over ${championshipOpponent}${saysFinal ? ' in the final' : ''}.`,
        probe: `${championshipTeam} over ${championshipOpponent}`.toLowerCase(),
        team: championshipTeam,
      });
    }
  }

  if (!championshipTeam) {
    const champion = paragraph.match(new RegExp(`\\b(?:CHAMPION(?:SHIP)?(?:\\s+PICK)?|TITLE\\s+PICK)\\s*[:\\-–—]?\\s*(${TEAM_PATTERN})\\b`, 'i'));
    championshipTeam = canonicalTeam(champion?.[1]);
  }
  if (!championshipOpponent) {
    const opponent = paragraph.match(new RegExp(`\\b(?:CHAMPIONSHIP\\s+(?:OPPONENT|FINALIST)|RUNNER[- ]UP)\\s*[:\\-–—]?\\s*(${TEAM_PATTERN})\\b`, 'i'));
    championshipOpponent = canonicalTeam(opponent?.[1]);
  }
  if (!matchup && championshipTeam && championshipOpponent) {
    picks.push({
      text: `${championshipTeam} over ${championshipOpponent} in the final.`,
      probe: `${championshipTeam} over ${championshipOpponent}`.toLowerCase(),
      team: championshipTeam,
    });
  }

  const definingPlayer =
    paragraph.match(/\b([A-Z][A-Za-z'’.-]{1,24}(?:\s+[A-Z][A-Za-z'’.-]{1,24}){1,3})\s+is\s+my\s+defining\s+championship\s+player\b/)?.[1]
    ?? paragraph.match(/\bmy\s+defining\s+championship\s+player\s+is\s+([A-Z][A-Za-z'’.-]{1,24}(?:\s+[A-Z][A-Za-z'’.-]{1,24}){1,3})\b/i)?.[1]
    ?? paragraph.match(/\bDEFINING\s+CHAMPIONSHIP\s+PLAYER\s*[:\-–—]\s*([A-Z][A-Za-z'’.-]{1,24}(?:\s+[A-Z][A-Za-z'’.-]{1,24}){1,3})\b/i)?.[1];
  const playerName = cleanPredictionPlayer(definingPlayer);
  if (playerName) {
    picks.push({
      text: `${playerName} is my defining championship player.`,
      probe: `${playerName} is my defining championship player`.toLowerCase(),
      team: championshipTeam ?? undefined,
      playerName,
    });
  }

  const highestScoringMatch =
    paragraph.match(new RegExp(`\\bmy\\s+highest[- ]scoring(?:\\s+regular[- ]season)?\\s+team\\s+is\\s+(${TEAM_PATTERN})\\b`, 'i'))
    ?? paragraph.match(new RegExp(`\\bI\\s+(?:also\\s+)?choose\\s+(${TEAM_PATTERN})\\s+to\\s+lead\\s+regular[- ]season\\s+points\\b`, 'i'))
    ?? paragraph.match(new RegExp(`\\bHIGHEST[- ]SCORING(?:\\s+REGULAR[- ]SEASON)?\\s+TEAM\\s*[:\\-–—]?\\s*(${TEAM_PATTERN})\\b`, 'i'));
  const highestScoringTeam = canonicalTeam(highestScoringMatch?.[1]);
  if (highestScoringTeam) {
    picks.push({
      text: `My highest-scoring regular-season team is ${highestScoringTeam}.`,
      probe: `highest-scoring regular-season team is ${highestScoringTeam}`.toLowerCase(),
      team: highestScoringTeam,
    });
  }

  return picks;
}

function extractStructuredSeasonPicks(rawText: string): StructuredSeasonPicks {
  const paragraphs = officialSeasonPickParagraphs(rawText);
  const mason = structuredPicksFromParagraph(paragraphs.mason ?? '');
  const westy = structuredPicksFromParagraph(paragraphs.westy ?? '');
  const playerNames = [...new Set([...mason, ...westy].map(pick => pick.playerName).filter((value): value is string => Boolean(value)))];
  return { mason, westy, playerNames };
}

function mergeStructuredPicks(hostText: string, picks: StructuredPick[]): string {
  let merged = hostText;
  let searchable = normalizeLine(hostText).toLowerCase();
  for (const pick of picks) {
    if (searchable.includes(pick.probe)) continue;
    const markers = [
      pick.team ? `[[TEAM:${pick.team}]]` : '',
      '[[SECTION:OFFICIAL SEASON PICKS]]',
    ].filter(Boolean).join(' ');
    const addition = `${markers} ${pick.text}`;
    merged = `${merged}\n\n${addition}`;
    searchable = `${searchable} ${normalizeLine(addition).toLowerCase()}`;
  }
  return normalizeHostText(merged);
}

function splitBySpeaker(rawText: string, title: string): { masonText: string; westyText: string; masonTurns: number; westyTurns: number } {
  const turns: Record<Speaker, string[]> = { mason: [], westy: [] };
  let active: Speaker | null = null;
  let current: string[] = [];
  let contextTeam: string | null = null;
  let contextSection: string | null = null;

  const flush = () => {
    if (!active || current.length === 0) {
      current = [];
      return;
    }
    const text = normalizeLine(current.join(' '));
    if (text.length >= 20) {
      const markers = [
        contextTeam ? `[[TEAM:${contextTeam}]]` : '',
        contextSection ? `[[SECTION:${contextSection}]]` : '',
      ].filter(Boolean).join(' ');
      turns[active].push(`${markers}${markers ? ' ' : ''}${text}`);
    }
    current = [];
  };

  const currentLooksIncomplete = (): boolean => {
    if (current.length === 0) return true;
    const text = normalizeLine(current.join(' '));
    return !/[.!?]["')\]]?$/.test(text);
  };

  for (const rawLine of prepareRawText(rawText).split('\n')) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const section = sectionContextFromLine(line);
    if (section) {
      flush();
      contextSection = section;
      contextTeam = null;
      active = null;
      continue;
    }

    const marker = speakerMarker(line);
    if (marker) {
      flush();
      active = marker.speaker;
      if (marker.remainder && !isNoiseLine(marker.remainder, title)) current.push(marker.remainder);
      continue;
    }

    const team = teamContextFromLine(line);
    if (team) {
      const preserveIncompleteTurn = Boolean(active && current.length > 0 && currentLooksIncomplete());
      contextTeam = team;
      if (preserveIncompleteTurn) continue;
      flush();
      if (active && isSpeakerContextLine(line)) continue;
      active = null;
      continue;
    }

    if (active && isSpeakerContextLine(line)) {
      if (current.length > 0 && currentLooksIncomplete()) continue;
      flush();
      continue;
    }

    if (isPublicationFurnitureLine(line, title)) {
      if (active && currentLooksIncomplete()) continue;
      if (active) flush();
      active = null;
      continue;
    }

    if (!active) continue;
    current.push(line);
  }
  flush();

  return {
    masonText: normalizeHostText(turns.mason.join('\n\n')),
    westyText: normalizeHostText(turns.westy.join('\n\n')),
    masonTurns: turns.mason.length,
    westyTurns: turns.westy.length,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`PDF text extraction timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function extractUploadedPdfContinuity(bytes: Uint8Array, title: string): Promise<UploadedPdfContinuity | null> {
  if (bytes.length === 0) return null;
  try {
    const pdf = await withTimeout(getDocumentProxy(bytes, { maxImageSize: 16_777_216 }), PDF_TIMEOUT_MS);
    if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES) {
      console.warn(`[UploadedPdfContinuity] "${title}" has ${pdf.numPages} pages; allowed range is 1-${MAX_PAGES}.`);
      return null;
    }
    const extracted = await withTimeout(extractText(pdf, { mergePages: true }), PDF_TIMEOUT_MS);
    const rawText = Array.isArray(extracted.text) ? extracted.text.join('\n') : extracted.text;
    if (!rawText || rawText.trim().length < 100) {
      console.warn(`[UploadedPdfContinuity] "${title}" contains no usable searchable text.`);
      return null;
    }
    const split = splitBySpeaker(rawText, title);
    const structured = extractStructuredSeasonPicks(rawText);
    const masonText = mergeStructuredPicks(split.masonText, structured.mason);
    const westyText = mergeStructuredPicks(split.westyText, structured.westy);
    if (masonText.length < 80 || westyText.length < 80) {
      console.warn(`[UploadedPdfContinuity] "${title}" local attribution incomplete: Mason ${masonText.length} chars/${split.masonTurns} turns, Westy ${westyText.length} chars/${split.westyTurns} turns.`);
      return null;
    }
    return {
      masonText,
      westyText,
      playerNames: [...new Set([...explicitPredictionPlayerNames(rawText), ...structured.playerNames])],
      confidence: 1,
      notes: [
        `Parsed ${pdf.numPages} PDF pages locally.`,
        `Attributed ${split.masonTurns} Mason turns and ${split.westyTurns} Westy turns from visible speaker labels.`,
        `Recovered ${structured.mason.length + structured.westy.length} structured official-season-pick fields directly from the PDF text layer.`,
        'Structured championship, defining-player and highest-scoring-team picks are added as canonical receipts when layout order breaks the conversational text.',
        'Player discovery is restricted to explicit prediction language; canonical league player names are supplied downstream.',
        'No LLM or external AI API was used.',
      ],
      model: 'local-unpdf-v4',
    };
  } catch (error) {
    console.warn(`[UploadedPdfContinuity] Local PDF extraction failed for "${title}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

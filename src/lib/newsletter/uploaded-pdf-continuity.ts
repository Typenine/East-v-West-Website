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

const PERSON_NAME_STOP = new Set([
  'mason reed', 'trent weston', 'yahoo sports', 'east west', 'league pressure',
  'power rankings', 'season preview', 'official season', 'final conversation',
  'final receipts', 'free agency', 'trade analysis', 'the claim', 'the hinge',
  'on record', 'bottom line', 'central stories', 'the format', 'this issue',
]);

function normalizeLine(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function normalizeHostText(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_HOST_CHARS);
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
  for (const [pattern, label] of SECTION_PATTERNS) if (pattern.test(line)) return label;
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

function isHardBoundaryLine(line: string, title: string): boolean {
  return Boolean(sectionContextFromLine(line)) || isSourceOrSidebarLine(line) || /EAST\s+v\.?\s+WEST/i.test(line) || isNoiseLine(line, title);
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

function likelyPlayerNames(rawText: string): string[] {
  const candidates = rawText.match(/\b[A-Z][A-Za-z'’.-]{1,20}\s+[A-Z][A-Za-z'’.-]{1,24}\b/g) ?? [];
  const teamLower = new Set(TEAM_NAMES.map(team => team.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const value = normalizeLine(raw.replace(/’/g, "'"));
    const lower = value.toLowerCase();
    if (PERSON_NAME_STOP.has(lower) || teamLower.has(lower)) continue;
    if (value === value.toUpperCase()) continue;
    if (/^(?:East|West|Power|Season|Official|Final|Trade|Free|League|Opening)\b/i.test(value)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(value);
    if (out.length >= 180) break;
  }
  return out;
}

function splitBySpeaker(rawText: string, title: string): { masonText: string; westyText: string; masonTurns: number; westyTurns: number } {
  const turns: Record<Speaker, string[]> = { mason: [], westy: [] };
  let active: Speaker | null = null;
  let current: string[] = [];
  let contextTeam: string | null = null;
  let contextSection: string | null = null;

  const flush = () => {
    if (!active || current.length === 0) { current = []; return; }
    const text = normalizeLine(current.join(' '));
    if (text.length >= 20) {
      const markers = [contextTeam ? `[[TEAM:${contextTeam}]]` : '', contextSection ? `[[SECTION:${contextSection}]]` : ''].filter(Boolean).join(' ');
      turns[active].push(`${markers}${markers ? ' ' : ''}${text}`);
    }
    current = [];
  };

  for (const rawLine of prepareRawText(rawText).split('\n')) {
    const line = normalizeLine(rawLine);
    if (!line) continue;
    const section = sectionContextFromLine(line);
    if (section) { flush(); contextSection = section; contextTeam = null; active = null; }
    const team = teamContextFromLine(line);
    if (team) { flush(); contextTeam = team; active = null; }
    const marker = speakerMarker(line);
    if (marker) {
      flush();
      active = marker.speaker;
      if (marker.remainder && !isNoiseLine(marker.remainder, title)) current.push(marker.remainder);
      continue;
    }
    if (isHardBoundaryLine(line, title)) { if (active) flush(); active = null; continue; }
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
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`PDF text extraction timed out after ${timeoutMs}ms`)), timeoutMs); }),
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
    if (split.masonText.length < 80 || split.westyText.length < 80) {
      console.warn(`[UploadedPdfContinuity] "${title}" local attribution incomplete: Mason ${split.masonText.length} chars/${split.masonTurns} turns, Westy ${split.westyText.length} chars/${split.westyTurns} turns.`);
      return null;
    }
    return {
      masonText: split.masonText,
      westyText: split.westyText,
      playerNames: likelyPlayerNames(rawText),
      confidence: 1,
      notes: [
        `Parsed ${pdf.numPages} PDF pages locally.`,
        `Attributed ${split.masonTurns} Mason turns and ${split.westyTurns} Westy turns from visible speaker labels.`,
        'Preserved team/section context markers and stripped publication furniture before continuity analysis.',
        'No LLM or external AI API was used.',
      ],
      model: 'local-unpdf-v2',
    };
  } catch (error) {
    console.warn(`[UploadedPdfContinuity] Local PDF extraction failed for "${title}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

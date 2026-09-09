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

function normalizeLine(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
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

function isNoiseLine(line: string, title: string): boolean {
  if (!line) return true;
  const simplified = line.replace(/[.·•/|_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const simpleTitle = title.replace(/[.·•/|_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  if (/^\d{1,3}$/.test(line)) return true;
  if (/^east\s+v\.?\s+west$/i.test(line)) return true;
  if (/^newsletter$/i.test(line)) return true;
  if (simpleTitle && simplified === simpleTitle) return true;
  if (/^20\d{2}\s+(?:season\s+preview|offseason\s+moves|free\s+agency|pre-draft|post-draft)\s+\d{1,3}$/i.test(line)) return true;

  if (line.length <= 72 && /^[A-Z0-9 "'&.,:/()\-]+$/.test(line) && !/[.!?]["']?$/.test(line)) {
    return true;
  }
  return false;
}

function speakerMarker(rawLine: string): { speaker: Speaker; remainder: string } | null {
  const line = normalizeLine(rawLine);
  if (!line) return null;

  const lower = line.toLowerCase();
  if (lower.includes('mason reed') && (lower.includes('westy') || lower.includes('trent weston'))) {
    return null;
  }

  if (/^(?:MASON REED|MASON)$/i.test(line)) return { speaker: 'mason', remainder: '' };
  let match = line.match(/^MASON REED\s*[:\-–—]\s*(.+)$/i)
    ?? line.match(/^MASON\s*[:\-–—]\s*(.+)$/i)
    ?? line.match(/^MASON REED\s+(.+)$/i);
  if (match) return { speaker: 'mason', remainder: normalizeLine(match[1]) };

  if (/^(?:WESTY|TRENT\s+["“”']?WESTY["“”']?\s+WESTON|TRENT WESTON)$/i.test(line)) {
    return { speaker: 'westy', remainder: '' };
  }
  match = line.match(/^WESTY\s*[:\-–—]\s*(.+)$/i)
    ?? line.match(/^WESTY\s+(.+)$/i)
    ?? line.match(/^TRENT\s+["“”']?WESTY["“”']?\s+WESTON\s*[:\-–—]?\s*(.+)$/i);
  if (match) return { speaker: 'westy', remainder: normalizeLine(match[1]) };

  return null;
}

function splitBySpeaker(rawText: string, title: string): {
  masonText: string;
  westyText: string;
  masonTurns: number;
  westyTurns: number;
} {
  const turns: Record<Speaker, string[]> = { mason: [], westy: [] };
  let active: Speaker | null = null;
  let current: string[] = [];

  const flush = () => {
    if (!active || current.length === 0) {
      current = [];
      return;
    }
    const text = normalizeLine(current.join(' '));
    if (text.length >= 24) turns[active].push(text);
    current = [];
  };

  for (const rawLine of rawText.replace(/\r/g, '').split('\n')) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const marker = speakerMarker(line);
    if (marker) {
      flush();
      active = marker.speaker;
      if (marker.remainder && !isNoiseLine(marker.remainder, title)) current.push(marker.remainder);
      continue;
    }

    if (!active || isNoiseLine(line, title)) continue;
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

/**
 * Extract Mason/Westy continuity locally from a text-based newsletter PDF.
 *
 * No LLM or paid API is involved. unpdf bundles a serverless PDF.js build, so
 * the uploaded bytes are parsed inside the Vercel function. Attribution is
 * deterministic from the publication's visible MASON REED / WESTY labels.
 */
export async function extractUploadedPdfContinuity(
  bytes: Uint8Array,
  title: string,
): Promise<UploadedPdfContinuity | null> {
  if (bytes.length === 0) return null;

  try {
    const pdf = await withTimeout(
      getDocumentProxy(bytes, { maxImageSize: 16_777_216 }),
      PDF_TIMEOUT_MS,
    );

    if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES) {
      console.warn(`[UploadedPdfContinuity] "${title}" has ${pdf.numPages} pages; allowed range is 1-${MAX_PAGES}.`);
      return null;
    }

    const extracted = await withTimeout(
      extractText(pdf, { mergePages: true }),
      PDF_TIMEOUT_MS,
    );
    const rawText = Array.isArray(extracted.text) ? extracted.text.join('\n') : extracted.text;
    if (!rawText || rawText.trim().length < 100) {
      console.warn(`[UploadedPdfContinuity] "${title}" contains no usable searchable text.`);
      return null;
    }

    const split = splitBySpeaker(rawText, title);
    if (split.masonText.length < 80 || split.westyText.length < 80) {
      console.warn(
        `[UploadedPdfContinuity] "${title}" local attribution incomplete: Mason ${split.masonText.length} chars/${split.masonTurns} turns, Westy ${split.westyText.length} chars/${split.westyTurns} turns.`,
      );
      return null;
    }

    return {
      masonText: split.masonText,
      westyText: split.westyText,
      playerNames: [],
      confidence: 1,
      notes: [
        `Parsed ${pdf.numPages} PDF pages locally.`,
        `Attributed ${split.masonTurns} Mason turns and ${split.westyTurns} Westy turns from visible speaker labels.`,
        'No LLM or external AI API was used.',
      ],
      model: 'local-unpdf',
    };
  } catch (error) {
    console.warn(
      `[UploadedPdfContinuity] Local PDF extraction failed for "${title}":`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

import Anthropic from '@anthropic-ai/sdk';

export interface UploadedPdfContinuity {
  masonText: string;
  westyText: string;
  playerNames: string[];
  confidence: number;
  notes: string[];
  model: string;
}

function cleanJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeText(value: unknown, maxChars = 18_000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars);
}

function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const name = item.replace(/\s+/g, ' ').trim();
    if (name.length < 4 || name.length > 70) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 100) break;
  }
  return out;
}

/**
 * Read a finished externally-authored newsletter PDF and recover the substantive
 * Mason/Westy positions so publish-time editorial memory can treat the uploaded
 * issue the same way as a newsletter generated inside the website.
 *
 * This is deliberately a memory extraction pass, not a rewrite. It produces a
 * compact attribution-preserving record of what each host actually argued.
 */
export async function extractUploadedPdfContinuity(
  bytes: Uint8Array,
  title: string,
): Promise<UploadedPdfContinuity | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || bytes.length === 0) return null;

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  const base64 = Buffer.from(bytes).toString('base64');

  const prompt = `You are extracting continuity memory from a finished East v. West fantasy-football newsletter titled "${title}".

The newsletter is authored by two recurring hosts:
- Mason Reed: entertainer/narrative voice. He may be labeled Mason, Mason Reed, entertainer, staff columnist, or a red-side/byline voice.
- Trent "Westy" Weston: analyst voice. He may be labeled Trent, Weston, Westy, analyst, senior analyst, or a blue-side/byline voice.

Your job is NOT to summarize the whole publication neutrally. Recover what EACH HOST actually believes so future issues can remain consistent.

For each host:
- capture team evaluations, player evaluations, predictions, rankings, championship picks, strategy opinions, admissions of error, changed minds, and direct disagreements;
- preserve concrete claims and reasoning;
- include enough detail that a later writer can say "Mason previously argued X" or "Westy has been skeptical of Y";
- omit generic transitions, factual tables, headings, boilerplate, and neutral league information unless the host used it as part of an argument;
- do not invent attribution. If a passage is neutral or attribution is unclear, omit it;
- paraphrase faithfully rather than reproducing long passages verbatim;
- list player names that materially appear in the hosts' analysis.

Return STRICT JSON only in this shape:
{
  "masonText": "Detailed attribution-preserving memory notes for Mason, separated into short paragraphs or bullets.",
  "westyText": "Detailed attribution-preserving memory notes for Westy, separated into short paragraphs or bullets.",
  "playerNames": ["Player Name"],
  "confidence": 0.0,
  "notes": ["Any attribution limitation worth knowing"]
}

If one host does not appear, return an empty string for that host. Do not make up copy.`;

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 8_000,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    const parsed = JSON.parse(cleanJson(text)) as Record<string, unknown>;
    const masonText = normalizeText(parsed.masonText);
    const westyText = normalizeText(parsed.westyText);
    if (!masonText && !westyText) return null;

    return {
      masonText,
      westyText,
      playerNames: normalizeNames(parsed.playerNames),
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 8)
        : [],
      model,
    };
  } catch (error) {
    console.warn('[UploadedPdfContinuity] PDF continuity extraction failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

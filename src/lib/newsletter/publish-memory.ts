/**
 * Publish-time memory feedback
 *
 * Called after the newsletter is saved and the Discord webhook fires.
 * Diffs the published newsletter JSON against the original staged content,
 * identifies edited sections, and appends an EditorialCorrectionEntry to
 * each bot's memory record.
 *
 * Only sections that actually changed are recorded. Unchanged sections
 * are excluded entirely. No existing memory fields are modified.
 */

import { loadBotMemory, saveBotMemory, loadStagedNewsletter } from '@/server/db/newsletter-queries';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { BotName, EditorialCorrectionEntry } from '@/lib/newsletter/types';

interface SectionContent {
  type: string;
  bot1_text?: string;
  bot2_text?: string;
  [key: string]: unknown;
}

/**
 * Auto-generate a short editorial note describing what changed.
 */
function generateNote(original: string, published: string): string {
  const origLen = original.length;
  const pubLen = published.length;
  const delta = pubLen - origLen;
  const pctChange = origLen > 0 ? Math.abs(delta / origLen) : 1;

  if (pctChange > 0.5) return 'Section substantially rewritten';
  if (delta < -50) return 'Content shortened';
  if (delta > 50) return 'Content expanded';
  return 'Minor editorial correction';
}

/**
 * Diff two section arrays (published vs original) for one bot field.
 * Returns only sections that have meaningful changes.
 */
function diffSections(
  published: SectionContent[],
  original: SectionContent[],
  field: 'bot1_text' | 'bot2_text',
): Array<{ section: string; original: string; published: string; note: string }> {
  const corrections: Array<{ section: string; original: string; published: string; note: string }> = [];

  for (let i = 0; i < published.length; i++) {
    const pub = published[i];
    const orig = original[i];
    if (!pub || !orig) continue;

    const pubText = String(pub[field] ?? '').trim();
    const origText = String(orig[field] ?? '').trim();

    if (!pubText || !origText) continue;
    if (pubText === origText) continue;

    corrections.push({
      section: pub.type ?? `section_${i}`,
      original: origText,
      published: pubText,
      note: generateNote(origText, pubText),
    });
  }

  return corrections;
}

export async function updateBotMemoryFromPublish(
  season: number,
  week: number,
): Promise<void> {
  try {
    // 1. Load the published newsletter JSON
    const db = getDb();
    const rows = await db
      .select()
      .from(newsletters)
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)))
      .limit(1);

    if (!rows.length) {
      console.warn(`[PublishMemory] No newsletter found for s${season}w${week} — skipping`);
      return;
    }

    const publishedContent = rows[0].content as { sections?: SectionContent[] } | null;
    const publishedSections: SectionContent[] = publishedContent?.sections ?? [];

    // 2. Load the original staged content for comparison
    const staged = await loadStagedNewsletter(season, week);
    if (!staged?.generatedContent) {
      console.log(`[PublishMemory] No staged content for s${season}w${week} — skipping diff`);
      return;
    }

    // Reconstruct original sections from staged generatedContent
    // staged.generatedContent keys are step names (e.g. 'Intro', 'Recap_0') while published
    // section types are canonical names (e.g. 'Intro', 'MatchupRecaps'). Build a
    // case-insensitive lookup map to handle any capitalization drift.
    const gcLower = Object.fromEntries(
      Object.entries(staged.generatedContent).map(([k, v]) => [k.toLowerCase(), v])
    );
    const originalSections: SectionContent[] = publishedSections.map(pub => {
      const key = pub.type?.toLowerCase() ?? '';
      const stagedSection = staged.generatedContent[pub.type] ?? gcLower[key];
      if (!stagedSection) {
        console.warn(`[PublishMemory] No staged content for section type "${pub.type}" — treating as unchanged`);
        return pub;
      }
      return {
        ...pub,
        bot1_text: stagedSection.entertainer ?? pub.bot1_text,
        bot2_text: stagedSection.analyst ?? pub.bot2_text,
      };
    });

    // 3. Build corrections per bot
    const botFieldMap: Array<{ bot: BotName; field: 'bot1_text' | 'bot2_text' }> = [
      { bot: 'entertainer', field: 'bot1_text' },
      { bot: 'analyst', field: 'bot2_text' },
    ];

    for (const { bot, field } of botFieldMap) {
      const corrections = diffSections(publishedSections, originalSections, field);
      if (corrections.length === 0) {
        console.log(`[PublishMemory] ${bot}: no changes detected for s${season}w${week}`);
        continue;
      }

      const entry: EditorialCorrectionEntry = {
        season,
        week,
        source: 'editorial_review',
        corrections,
      };

      // 4. Load existing memory and append — do not alter any other fields
      const mem = await loadBotMemory(bot, season);
      if (!mem) {
        console.warn(`[PublishMemory] ${bot}: no memory record for season ${season} — skipping`);
        continue;
      }

      if (!mem.editorialCorrections) mem.editorialCorrections = [];
      // Upsert: replace any existing entry for this season+week rather than appending a duplicate
      const existingIdx = mem.editorialCorrections.findIndex(
        e => e.season === season && e.week === week
      );
      if (existingIdx >= 0) {
        mem.editorialCorrections[existingIdx] = entry;
      } else {
        mem.editorialCorrections.push(entry);
      }

      await saveBotMemory(bot, season, mem);

      console.log(
        `[PublishMemory] ${bot}: appended ${corrections.length} correction(s) for s${season}w${week}`,
      );
    }
  } catch (err) {
    // Non-fatal — log and continue so publish is not blocked
    console.error('[PublishMemory] updateBotMemoryFromPublish failed (non-fatal):', err instanceof Error ? err.message : String(err));
  }
}

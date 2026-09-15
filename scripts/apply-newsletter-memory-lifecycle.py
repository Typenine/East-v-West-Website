from __future__ import annotations

from pathlib import Path

QUERIES = Path('src/server/db/newsletter-queries.ts')
SOURCE_PACK = Path('src/app/api/admin/newsletter/external-export/route-core.ts')

MEMORY_BLOCK_START = '/**\n * Load bot memory from database\n'
MEMORY_BLOCK_END = '// ============ Forecast Records ============'
CROSS_SEASON_START = '// ============ Cross-Season Memory ============'
CROSS_SEASON_END = '// ============ Relationship Memory ============'

NEW_MEMORY_BLOCK = r'''/**
 * Hydrate one persisted memory row without changing its season semantics.
 */
type PersistedBotMemoryRow = {
  updatedAt: Date;
  summaryMood: unknown;
  teams: unknown;
  enhancedData?: unknown;
  editorialCorrections?: unknown;
};

function isMissingEnhancedMemoryColumn(err: unknown): boolean {
  const anyErr = err as { code?: string; message?: string } | undefined;
  const msg = anyErr?.message ?? '';
  const code = anyErr?.code ?? '';
  return code === '42703' ||
    msg.toLowerCase().includes('enhanced_data') ||
    msg.toLowerCase().includes('editorial_corrections');
}

function hydrateBotMemoryRow(bot: BotName, season: number, row: PersistedBotMemoryRow): BotMemory {
  const enhancedData = (row.enhancedData as Record<string, unknown> | undefined) || {};
  const hasEnhancedData = Object.keys(enhancedData).length > 0;

  if (hasEnhancedData) {
    return {
      bot,
      season,
      updated_at: row.updatedAt.toISOString(),
      summaryMood: (enhancedData.summaryMood as BotMemory['summaryMood']) || row.summaryMood as BotMemory['summaryMood'],
      lastGeneratedWeek: (enhancedData.lastGeneratedWeek as number | undefined) ?? 0,
      teams: (row.teams || {}) as BotMemory['teams'],
      personality: enhancedData.personality as BotMemory['personality'],
      emotionalState: enhancedData.emotionalState as BotMemory['emotionalState'],
      speechPatterns: enhancedData.speechPatterns as BotMemory['speechPatterns'],
      personalGrowth: enhancedData.personalGrowth as BotMemory['personalGrowth'],
      deepPlayerRelationships: enhancedData.deepPlayerRelationships as BotMemory['deepPlayerRelationships'],
      deepTeamRelationships: enhancedData.deepTeamRelationships as BotMemory['deepTeamRelationships'],
      partnerDynamics: enhancedData.partnerDynamics as BotMemory['partnerDynamics'],
      narratives: (enhancedData.narratives as BotMemory['narratives']) || [],
      predictions: (enhancedData.predictions as BotMemory['predictions']) || [],
      predictionStats: (enhancedData.predictionStats as BotMemory['predictionStats']) || {
        correct: 0, wrong: 0, winRate: 0, hotStreak: 0, bestStreak: 0, worstStreak: 0,
      },
      hotTakes: (enhancedData.hotTakes as BotMemory['hotTakes']) || [],
      milestones: (enhancedData.milestones as BotMemory['milestones']) || [],
      playerRelationships: (enhancedData.playerRelationships as BotMemory['playerRelationships']) || {},
      favoritePlayers: (enhancedData.favoritePlayers as string[]) || [],
      disappointments: (enhancedData.disappointments as string[]) || [],
      previousPowerRankings: (enhancedData.previousPowerRankings as BotMemory['previousPowerRankings']) || {},
      recentOutputLog: enhancedData.recentOutputLog as BotMemory['recentOutputLog'],
      editorialCorrections: (row.editorialCorrections as BotMemory['editorialCorrections']) || [],
    };
  }

  return {
    bot,
    season,
    updated_at: row.updatedAt.toISOString(),
    summaryMood: row.summaryMood as BotMemory['summaryMood'],
    teams: (row.teams || {}) as BotMemory['teams'],
  };
}

/**
 * Carry only durable identity/history into a new season. Seasonal state resets.
 * This is deterministic and model-free, so long-term memory adds no AI-service cost.
 */
function carryPermanentMemoryIntoSeason(bot: BotName, season: number, previous: BotMemory): BotMemory {
  const fresh = createEnhancedMemory(bot, season);

  const speechPatterns = previous.speechPatterns ? {
    ...previous.speechPatterns,
    emergingPhrases: previous.speechPatterns.emergingPhrases.slice(-12),
    catchphrases: previous.speechPatterns.catchphrases.slice(-12),
    obsessions: previous.speechPatterns.obsessions.slice(-8),
    avoidTopics: previous.speechPatterns.avoidTopics.slice(-8),
    signatureReactions: previous.speechPatterns.signatureReactions.slice(-8),
  } : fresh.speechPatterns;

  const personalGrowth = previous.personalGrowth ? {
    ...previous.personalGrowth,
    hardLessons: previous.personalGrowth.hardLessons.slice(-24),
    recognizedBiases: previous.personalGrowth.recognizedBiases.slice(-12),
    improvements: previous.personalGrowth.improvements.slice(-12),
    blindSpots: previous.personalGrowth.blindSpots.slice(-12),
  } : fresh.personalGrowth;

  const deepPlayerRelationships = Object.fromEntries(
    Object.entries(previous.deepPlayerRelationships ?? {}).map(([key, rel]) => [key, {
      ...rel,
      history: rel.history.slice(-18),
      predictions: rel.predictions.slice(-12),
      nicknames: rel.nicknames.slice(-8),
    }]),
  );

  const deepTeamRelationships = Object.fromEntries(
    Object.entries(previous.deepTeamRelationships ?? {}).map(([key, rel]) => [key, {
      ...rel,
      takeHistory: rel.takeHistory.slice(-30),
    }]),
  );

  const partnerDynamics = previous.partnerDynamics ? {
    ...previous.partnerDynamics,
    recentInteractions: previous.partnerDynamics.recentInteractions.slice(-16),
    lessonsLearned: previous.partnerDynamics.lessonsLearned.slice(-12),
    insideJokes: previous.partnerDynamics.insideJokes.slice(-10),
    // A new season starts with a clean current feud while preserving the relationship history.
    activeFeud: undefined,
  } : undefined;

  return {
    ...fresh,
    personality: previous.personality ?? fresh.personality,
    speechPatterns,
    personalGrowth,
    deepPlayerRelationships,
    deepTeamRelationships,
    partnerDynamics,
    favoritePlayers: [...new Set(previous.favoritePlayers ?? [])].slice(-12),
    disappointments: [...new Set(previous.disappointments ?? [])].slice(-12),
    // Everything below is intentionally season-scoped and starts clean.
    teams: {},
    narratives: [],
    predictions: [],
    predictionStats: { correct: 0, wrong: 0, winRate: 0, hotStreak: 0, bestStreak: 0, worstStreak: 0 },
    hotTakes: [],
    milestones: [],
    playerRelationships: {},
    previousPowerRankings: {},
    recentOutputLog: undefined,
    editorialCorrections: [],
    summaryMood: 'Focused',
    lastGeneratedWeek: 0,
    updated_at: new Date().toISOString(),
  };
}

async function selectMemoryRow(bot: BotName, season: number): Promise<PersistedBotMemoryRow | null> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(botMemory)
      .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
      .limit(1);
    return rows.length ? rows[0] : null;
  } catch (err) {
    if (!isMissingEnhancedMemoryColumn(err)) throw err;
    const rows = await db
      .select({ updatedAt: botMemory.updatedAt, summaryMood: botMemory.summaryMood, teams: botMemory.teams })
      .from(botMemory)
      .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
      .limit(1);
    return rows.length ? rows[0] : null;
  }
}

async function selectLatestPreviousMemoryRow(bot: BotName, season: number): Promise<{ season: number; row: PersistedBotMemoryRow } | null> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(botMemory)
      .where(and(eq(botMemory.bot, bot), lt(botMemory.season, season)))
      .orderBy(desc(botMemory.season))
      .limit(1);
    return rows.length ? { season: rows[0].season, row: rows[0] } : null;
  } catch (err) {
    if (!isMissingEnhancedMemoryColumn(err)) throw err;
    const rows = await db
      .select({ season: botMemory.season, updatedAt: botMemory.updatedAt, summaryMood: botMemory.summaryMood, teams: botMemory.teams })
      .from(botMemory)
      .where(and(eq(botMemory.bot, bot), lt(botMemory.season, season)))
      .orderBy(desc(botMemory.season))
      .limit(1);
    return rows.length ? { season: rows[0].season, row: rows[0] } : null;
  }
}

/**
 * Load bot memory. If the requested season has no row yet, bootstrap an in-memory
 * season from the latest earlier season's durable personality/history. The first
 * normal save persists that carried memory into the new season.
 */
export async function loadBotMemory(bot: BotName, season: number): Promise<BotMemory | null> {
  const exact = await selectMemoryRow(bot, season);
  if (exact) return hydrateBotMemoryRow(bot, season, exact);

  const previous = await selectLatestPreviousMemoryRow(bot, season);
  if (!previous) return null;
  return carryPermanentMemoryIntoSeason(bot, season, hydrateBotMemoryRow(bot, previous.season, previous.row));
}

/**
 * Save bot memory without deleting enhanced-data fields owned by other memory
 * subsystems (notably the published take ledger). Unknown keys are preserved.
 */
export async function saveBotMemory(bot: BotName, season: number, memory: BotMemory): Promise<void> {
  const db = getDb();
  const isEnhanced = 'personality' in memory || 'predictions' in memory || 'partnerDynamics' in memory;

  const existing = await db
    .select({ id: botMemory.id })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);

  let currentEnhancedData: Record<string, unknown> = {};
  if (existing.length) {
    try {
      const rows = await db
        .select({ enhancedData: botMemory.enhancedData })
        .from(botMemory)
        .where(eq(botMemory.id, existing[0].id))
        .limit(1);
      currentEnhancedData = ((rows[0]?.enhancedData as Record<string, unknown> | null) ?? {});
    } catch (err) {
      if (!isMissingEnhancedMemoryColumn(err)) throw err;
    }
  }

  const enhancedData: Record<string, unknown> = { ...currentEnhancedData };
  if (isEnhanced) {
    const enhanced = memory as BotMemory;
    const set = (key: string, value: unknown) => {
      if (value !== undefined) enhancedData[key] = value;
    };
    set('summaryMood', enhanced.summaryMood);
    set('lastGeneratedWeek', enhanced.lastGeneratedWeek);
    set('personality', enhanced.personality);
    set('emotionalState', enhanced.emotionalState);
    set('speechPatterns', enhanced.speechPatterns);
    set('personalGrowth', enhanced.personalGrowth);
    set('deepPlayerRelationships', enhanced.deepPlayerRelationships);
    set('deepTeamRelationships', enhanced.deepTeamRelationships);
    set('partnerDynamics', enhanced.partnerDynamics);
    set('narratives', enhanced.narratives);
    set('predictions', enhanced.predictions);
    set('predictionStats', enhanced.predictionStats);
    set('hotTakes', enhanced.hotTakes);
    set('milestones', enhanced.milestones);
    set('playerRelationships', enhanced.playerRelationships);
    set('favoritePlayers', enhanced.favoritePlayers);
    set('disappointments', enhanced.disappointments);
    set('previousPowerRankings', enhanced.previousPowerRankings);
    set('recentOutputLog', enhanced.recentOutputLog);
  }

  const dbSummaryMood = (['Focused', 'Fired Up', 'Deflated'].includes(memory.summaryMood)
    ? memory.summaryMood
    : 'Focused') as 'Focused' | 'Fired Up' | 'Deflated';

  if (existing.length) {
    try {
      await db
        .update(botMemory)
        .set({
          summaryMood: dbSummaryMood,
          teams: memory.teams,
          enhancedData,
          editorialCorrections: (memory.editorialCorrections ?? []) as unknown as Array<Record<string, unknown>>,
          updatedAt: new Date(),
        })
        .where(eq(botMemory.id, existing[0].id));
    } catch (err) {
      if (!isMissingEnhancedMemoryColumn(err)) throw err;
      await db
        .update(botMemory)
        .set({ summaryMood: dbSummaryMood, teams: memory.teams, updatedAt: new Date() })
        .where(eq(botMemory.id, existing[0].id));
    }
    return;
  }

  try {
    await db.insert(botMemory).values({
      bot,
      season,
      summaryMood: dbSummaryMood,
      teams: memory.teams,
      enhancedData,
      editorialCorrections: (memory.editorialCorrections ?? []) as unknown as Array<Record<string, unknown>>,
    });
  } catch (err) {
    if (!isMissingEnhancedMemoryColumn(err)) throw err;
    await db.insert(botMemory).values({ bot, season, summaryMood: dbSummaryMood, teams: memory.teams });
  }
}

'''

NEW_CROSS_SEASON_BLOCK = r'''// ============ Cross-Season Memory ============

export async function loadPreviousSeasonMemory(
  bot: BotName,
  currentSeason: number
): Promise<BotMemory | null> {
  return loadBotMemory(bot, currentSeason - 1);
}

export async function initializeSeasonMemory(
  bot: BotName,
  season: number,
  previousMemory: BotMemory | null
): Promise<BotMemory> {
  const next = previousMemory
    ? carryPermanentMemoryIntoSeason(bot, season, previousMemory)
    : createEnhancedMemory(bot, season);
  await saveBotMemory(bot, season, next);
  return next;
}

'''


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    start_index = text.find(start)
    end_index = text.find(end)
    if start_index < 0 or end_index < 0 or end_index <= start_index:
        raise RuntimeError(f'Could not locate patch range: {start!r} -> {end!r}')
    return text[:start_index] + replacement + text[end_index:]


def patch_queries() -> None:
    text = QUERIES.read_text(encoding='utf-8')
    text = text.replace("import { eq, and, ne, desc } from 'drizzle-orm';", "import { eq, and, ne, desc, lt } from 'drizzle-orm';")
    import_anchor = "import type { BotMemory, BotName, RelationshipMemory } from '@/lib/newsletter/types';\n"
    import_with_memory = import_anchor + "import { createEnhancedMemory } from '@/lib/newsletter/memory';\n"
    if "createEnhancedMemory } from '@/lib/newsletter/memory'" not in text:
        if import_anchor not in text:
            raise RuntimeError('Bot memory import anchor missing')
        text = text.replace(import_anchor, import_with_memory, 1)

    text = replace_between(text, MEMORY_BLOCK_START, MEMORY_BLOCK_END, NEW_MEMORY_BLOCK)
    text = replace_between(text, CROSS_SEASON_START, CROSS_SEASON_END, NEW_CROSS_SEASON_BLOCK)

    required = [
        "previousPowerRankings: (enhancedData.previousPowerRankings",
        "recentOutputLog: enhancedData.recentOutputLog",
        "const enhancedData: Record<string, unknown> = { ...currentEnhancedData };",
        "published take ledger",
        "carryPermanentMemoryIntoSeason",
        "lt(botMemory.season, season)",
    ]
    for marker in required:
        if marker not in text:
            raise RuntimeError(f'Memory lifecycle patch validation failed: {marker}')
    QUERIES.write_text(text, encoding='utf-8')


def patch_source_pack() -> None:
    text = SOURCE_PACK.read_text(encoding='utf-8')
    old_continuity = "continuity: 'Use publishedContinuity as the primary receipt system for what Mason and Westy previously argued. Preserve each host\\'s individual history. When new evidence changes a take, acknowledge the prior position and explain why it strengthened, weakened, or reversed. Do not force callbacks where they are not relevant.',"
    new_continuity = "continuity: 'Use publishedContinuity as the primary receipt system for what Mason and Westy previously argued. Use botContinuity.currentSeason for each host\\'s evolving personality, learned lessons, team/player relationships, co-host dynamics, and earned recurring bits. Preserve each host\\'s individual history. When new evidence changes a take, acknowledge the prior position and explain why it strengthened, weakened, or reversed. Do not force callbacks where they are not relevant.',"
    if old_continuity in text:
        text = text.replace(old_continuity, new_continuity, 1)
    elif new_continuity not in text:
        raise RuntimeError('Source-pack continuity directive anchor missing')

    anchor = "    botContinuity: {\n      currentSeason: { mason: masonMemory, westy: westyMemory },"
    replacement = "    botContinuity: {\n      memoryPolicy: {\n        cost: 'model-free persistence in the existing database; no paid memory/vector/embedding service',\n        permanent: ['personality evolution', 'personal growth and lessons', 'deep team relationships', 'deep player relationships', 'co-host dynamics', 'earned catchphrases and inside jokes'],\n        seasonScoped: ['weekly team mood/trajectory', 'active narratives', 'prediction record', 'hot takes', 'milestones', 'power-ranking movement', 'recent-output dedupe', 'short-term emotional state'],\n        rollover: 'When a season has no memory row yet, durable identity/history is carried from the latest earlier season while season-scoped state starts clean.',\n        instruction: 'Treat durable memory as accumulated character history, not a mandate to repeat old takes. Let new evidence change opinions while preserving continuity and attribution.',\n      },\n      currentSeason: { mason: masonMemory, westy: westyMemory },"
    if anchor in text:
        text = text.replace(anchor, replacement, 1)
    elif "memoryPolicy: {" not in text:
        raise RuntimeError('Source-pack botContinuity anchor missing')

    SOURCE_PACK.write_text(text, encoding='utf-8')


def main() -> None:
    if not QUERIES.exists() or not SOURCE_PACK.exists():
        raise RuntimeError('Newsletter memory lifecycle patch targets are missing')
    patch_queries()
    patch_source_pack()
    print('[newsletter-memory-lifecycle] Preserved memory ledgers and enabled bounded cross-season personality carryover.')


if __name__ == '__main__':
    main()

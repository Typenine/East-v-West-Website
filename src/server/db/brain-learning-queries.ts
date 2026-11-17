/**
 * Read-only projection of persistent individual character learning.
 * Every invocation starts with the canonical published ledgers and admin
 * approvals; no independent model calls and no writes.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from './client';
import { botMemory } from './schema';
import { loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';
import {
  buildCharacterLearning,
  type LearningAdmin,
  type CharacterLearningProfile,
} from '@/lib/newsletter/brain-learning';

export async function loadLearningProfilesForSeason(season: number): Promise<{
  mason: CharacterLearningProfile;
  westy: CharacterLearningProfile;
}> {
  const db = getDb();
  const [masonLedger, westyLedger, mason, westy] = await Promise.all([
    loadPublishedTakeLedgerState('entertainer', season),
    loadPublishedTakeLedgerState('analyst', season),
    db.select({ enhancedData: botMemory.enhancedData }).from(botMemory)
      .where(and(eq(botMemory.bot,'entertainer'),eq(botMemory.season,season))).limit(1),
    db.select({ enhancedData: botMemory.enhancedData }).from(botMemory)
      .where(and(eq(botMemory.bot,'analyst'),eq(botMemory.season,season))).limit(1),
  ]);
  const adminFor=(rows:typeof mason):LearningAdmin=>{
    const enhanced=(rows[0]?.enhancedData??{}) as Record<string,unknown>;
    const admin=enhanced.brainAdmin;
    return admin && typeof admin==='object' && !Array.isArray(admin)
      ? admin as LearningAdmin : {};
  };
  const masonAdmin=adminFor(mason),westyAdmin=adminFor(westy);
  return {
    mason:buildCharacterLearning('entertainer',masonLedger.entries,westyLedger.entries,masonAdmin,westyAdmin),
    westy:buildCharacterLearning('analyst',westyLedger.entries,masonLedger.entries,westyAdmin,masonAdmin),
  };
}

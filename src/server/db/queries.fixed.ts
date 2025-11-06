import { getDb } from './client';
import { users, suggestions, taxiSquadMembers, taxiSquadEvents, teamPins, taxiObservations, userDocs, tenures, txnCache, taxiSnapshots } from './schema';
import { eq, and, isNull, desc, lt, sql, ne } from 'drizzle-orm';

export type Role = 'admin' | 'user';

export async function createUser(params: { email: string; displayName?: string; role?: Role }) {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ email: params.email, displayName: params.displayName, role: (params.role || 'user') as 'admin' | 'user' })
    .returning();
  return row;
}

export async function prunePriorSeasonsKeepOfficial(currentSeason: number) {
  const db = getDb();
  try {
    // Delete any snapshot for seasons before currentSeason that is not sun_pm_official
    await db
      .delete(taxiSnapshots)
      .where(and(lt(taxiSnapshots.season, currentSeason), ne(taxiSnapshots.runType, 'sun_pm_official')));
    return { ok: true } as const;
  } catch (err) {
    return { ok: false, error: String(err || 'unknown') } as const;
  }
}

export async function listAllUserDocs() {
  const db = getDb();
  const rows = await db.select().from(userDocs);
  return rows;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row || null;
}

export async function createSuggestion(params: { userId?: string | null; text: string; category?: string | null; createdAt?: Date }) {
  const db = getDb();
  const [row] = await db
    .insert(suggestions)
    .values({ userId: params.userId || null, text: params.text, category: params.category || null, createdAt: params.createdAt })
    .returning();
  return row;
}

export async function listSuggestions() {
  const db = getDb();
  const rows = await db.select().from(suggestions).orderBy(desc(suggestions.createdAt));
  return rows;
}

export async function updateSuggestionStatus(id: string, status: 'draft' | 'open' | 'accepted' | 'rejected') {
  const db = getDb();
  const [row] = await db.update(suggestions).set({ status }).where(eq(suggestions.id, id)).returning();
  return row || null;
}

export async function addTaxiMember(teamId: string, playerId: string, activeFrom?: Date) {
  const db = getDb();
  const [row] = await db.insert(taxiSquadMembers).values({ teamId, playerId, activeFrom: activeFrom || new Date() }).returning();
  return row;
}

export async function removeTaxiMember(teamId: string, playerId: string, activeTo?: Date) {
  const db = getDb();
  const [row] = await db
    .update(taxiSquadMembers)
    .set({ activeTo: activeTo || new Date() })
    .where(and(eq(taxiSquadMembers.teamId, teamId), eq(taxiSquadMembers.playerId, playerId), isNull(taxiSquadMembers.activeTo)))
    .returning();
  return row || null;
}

export async function listTaxiMembers(teamId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSquadMembers)
    .where(and(eq(taxiSquadMembers.teamId, teamId), isNull(taxiSquadMembers.activeTo)));
  return rows;
}

export async function logTaxiEvent(params: {
  teamId: string;
  playerId: string;
  eventType: 'add' | 'remove' | 'promote' | 'demote';
  eventAt?: Date;
  meta?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(taxiSquadEvents)
    .values({ teamId: params.teamId, playerId: params.playerId, eventType: params.eventType, eventAt: params.eventAt || new Date(), meta: params.meta || null })
    .returning();
  return row;
}

export async function listTaxiEvents(teamId: string, limit = 100) {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSquadEvents)
    .where(eq(taxiSquadEvents.teamId, teamId))
    .orderBy(desc(taxiSquadEvents.eventAt));
  return rows.slice(0, limit);
}

export async function getTeamPinBySlug(teamSlug: string) {
  const db = getDb();
  const [row] = await db.select().from(teamPins).where(eq(teamPins.teamSlug, teamSlug)).limit(1);
  return row || null;
}

export async function setTeamPin(teamSlug: string, value: { hash: string; salt: string; pinVersion: number; updatedAt?: Date }) {
  const db = getDb();
  const [row] = await db
    .insert(teamPins)
    .values({ teamSlug, hash: value.hash, salt: value.salt, pinVersion: value.pinVersion, updatedAt: value.updatedAt || new Date() })
    .onConflictDoUpdate({ target: teamPins.teamSlug, set: { hash: value.hash, salt: value.salt, pinVersion: value.pinVersion, updatedAt: value.updatedAt || new Date() } })
    .returning();
  return row;
}

export async function getTaxiObservation(team: string) {
  const db = getDb();
  const [row] = await db.select().from(taxiObservations).where(eq(taxiObservations.team, team)).limit(1);
  return row || null;
}

export async function setTaxiObservation(
  team: string,
  payload: { updatedAt: Date; players: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> }
) {
  const db = getDb();
  const [row] = await db
    .insert(taxiObservations)
    .values({ team, updatedAt: payload.updatedAt, players: payload.players })
    .onConflictDoUpdate({ target: taxiObservations.team, set: { updatedAt: payload.updatedAt, players: payload.players } })
    .returning();
  return row;
}

// ===== Taxi Auditor: Tenures / Txn Cache / Snapshots =====

export type AcqVia = 'free_agent' | 'waiver' | 'trade' | 'draft' | 'other';

export async function upsertTenure(params: { teamId: string; playerId: string; acquiredAt: Date; acquiredVia: AcqVia }) {
  const db = getDb();
  const [row] = await db
    .insert(tenures)
    .values({
      teamId: params.teamId,
      playerId: params.playerId,
      acquiredAt: params.acquiredAt,
      acquiredVia: params.acquiredVia,
      activeSeen: 0,
      lastActiveAt: null,
    })
    .onConflictDoUpdate({
      target: [tenures.teamId, tenures.playerId],
      set: { acquiredAt: params.acquiredAt, acquiredVia: params.acquiredVia, activeSeen: 0, lastActiveAt: null },
    })
    .returning();
  return row;
}

export async function markTenureActive(params: { teamId: string; playerId: string; at?: Date }) {
  const db = getDb();
  const [row] = await db
    .update(tenures)
    .set({ activeSeen: 1, lastActiveAt: params.at || new Date() })
    .where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)))
    .returning();
  return row || null;
}

export async function deleteTenure(params: { teamId: string; playerId: string }) {
  const db = getDb();
  // Drizzle neon-http lacks delete returning in some versions; use update to null activeSeen as soft-delete if needed.
  const [row] = await db
    .update(tenures)
    .set({ activeSeen: 1, lastActiveAt: new Date() })
    .where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)))
    .returning();
  return row || null;
}

export async function bulkInsertTxnCacheWithPrune(rows: Array<{ week: number; teamId: string; playerId: string; type: string; direction: string; ts: Date }>) {
  if (!rows || rows.length === 0) return 0;
  const db = getDb();
  await db.insert(txnCache).values(rows).catch(() => undefined);
  // prune older than ~120 days
  const now = Date.now();
  const cutoff = new Date(now - 120 * 24 * 60 * 60 * 1000);
  try {
    await db.delete(txnCache).where(lt(txnCache.ts, cutoff));
  } catch {}
  return rows.length;
}

export async function writeTaxiSnapshot(params: {
  season: number; week: number; runType: 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun';
  runTs: Date; teamId: string; taxiIds: string[]; compliant: boolean; violations: Array<{ code: string; detail?: string; players?: string[] }>; degraded?: boolean;
}) {
  const db = getDb();
  const [row] = await db
    .insert(taxiSnapshots)
    .values({
      season: params.season,
      week: params.week,
      runType: params.runType,
      runTs: params.runTs,
      teamId: params.teamId,
      taxiIds: params.taxiIds as unknown as string[],
      compliant: params.compliant ? 1 : 0,
      violations: params.violations,
      degraded: params.degraded ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [taxiSnapshots.season, taxiSnapshots.week, taxiSnapshots.runType, taxiSnapshots.teamId],
      set: {
        runTs: params.runTs,
        taxiIds: params.taxiIds as unknown as string[],
        compliant: params.compliant ? 1 : 0,
        violations: params.violations,
        degraded: params.degraded ? 1 : 0,
      },
    })
    .returning();
  return row;
}

export async function getLatestTaxiRunMeta() {
  const db = getDb();
  const rows = await db.select().from(taxiSnapshots).orderBy(desc(taxiSnapshots.runTs)).limit(1);
  const latest = rows[0];
  if (!latest) return null as null | { season: number; week: number; runType: string; runTs: Date };
  return { season: latest.season, week: latest.week, runType: latest.runType, runTs: latest.runTs } as { season: number; week: number; runType: string; runTs: Date };
}

export async function getLatestAdminRerunMeta() {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSnapshots)
    .where(eq(taxiSnapshots.runType, 'admin_rerun'))
    .orderBy(desc(taxiSnapshots.runTs))
    .limit(1);
  const latest = rows[0];
  if (!latest) return null as null | { season: number; week: number; runType: 'admin_rerun'; runTs: Date };
  return { season: latest.season, week: latest.week, runType: 'admin_rerun', runTs: latest.runTs } as { season: number; week: number; runType: 'admin_rerun'; runTs: Date };
}

export async function getTaxiSnapshotsForRun(params: { season: number; week: number; runType: 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun' }) {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSnapshots)
    .where(and(eq(taxiSnapshots.season, params.season), eq(taxiSnapshots.week, params.week), eq(taxiSnapshots.runType, params.runType)));
  return rows;
}

export async function getFirstTaxiSeenForPlayer(params: { season: number; teamId: string; playerId: string }) {
  const db = getDb();
  const rows = await db
    .select({ season: taxiSnapshots.season, week: taxiSnapshots.week, runTs: taxiSnapshots.runTs, runType: taxiSnapshots.runType })
    .from(taxiSnapshots)
    .where(and(
      eq(taxiSnapshots.season, params.season),
      eq(taxiSnapshots.teamId, params.teamId),
      sql`${params.playerId} = ANY(${taxiSnapshots.taxiIds})`
    ))
    .orderBy(taxiSnapshots.runTs)
    .limit(1);
  return rows[0] || null as null | { season: number; week: number; runTs: Date; runType: string };
}

export async function getUserDoc(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(userDocs).where(eq(userDocs.userId, userId)).limit(1);
  return row || null;
}

export async function setUserDoc(doc: {
  userId: string;
  team: string;
  version: number;
  updatedAt: Date;
  votes?: Record<string, Record<string, number>> | null;
  tradeBlock?: Array<Record<string, unknown>> | null;
  tradeWants?: { text?: string; positions?: string[] } | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(userDocs)
    .values({
      userId: doc.userId,
      team: doc.team,
      version: doc.version,
      updatedAt: doc.updatedAt,
      votes: doc.votes ?? null,
      tradeBlock: doc.tradeBlock ?? null,
      tradeWants: doc.tradeWants ?? null,
    })
    .onConflictDoUpdate({
      target: userDocs.userId,
      set: {
        team: doc.team,
        version: doc.version,
        updatedAt: doc.updatedAt,
        votes: doc.votes ?? null,
        tradeBlock: doc.tradeBlock ?? null,
        tradeWants: doc.tradeWants ?? null,
      },
    })
    .returning();
  return row;
}

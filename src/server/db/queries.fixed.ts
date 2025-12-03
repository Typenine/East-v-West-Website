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
  type SuggestionInsert = typeof suggestions.$inferInsert;
  const set: Partial<SuggestionInsert> = { status } as Partial<SuggestionInsert>;
  if (status === 'accepted' || status === 'rejected') {
    set.resolvedAt = new Date();
  } else {
    set.resolvedAt = null;
  }
  const [row] = await db.update(suggestions).set(set).where(eq(suggestions.id, id)).returning();
  return row || null;
}

export async function deleteSuggestion(id: string) {
  const db = getDb();
  const rows = await db.delete(suggestions).where(eq(suggestions.id, id)).returning();
  return Array.isArray(rows) ? rows.length > 0 : false;
}

// --- Suggestion sponsors (persist "endorse as team") ---
export async function ensureSuggestionSponsorColumn() {
  try {
    const db = getDb();
    // Best-effort: add column if missing. Safe in Postgres 9.6+.
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS sponsor_team varchar(255)`);
  } catch {}
}

export async function setSuggestionSponsor(id: string, team: string | null) {
  try {
    await ensureSuggestionSponsorColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET sponsor_team = ${team} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionSponsorsMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await ensureSuggestionSponsorColumn();
    const db = getDb();
    // Return id::text for stable mapping across drivers
    const res = await db.execute(sql`SELECT id::text AS id, sponsor_team FROM suggestions WHERE sponsor_team IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; sponsor_team: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const team = typeof r.sponsor_team === 'string' ? r.sponsor_team : '';
      if (id && team) out[id] = team;
    }
  } catch {}
  return out;
}

// --- Suggestion proposer (who submitted publicly when also endorsing) ---
export async function ensureSuggestionProposerColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS proposer_team varchar(255)`);
  } catch {}
}

export async function setSuggestionProposer(id: string, team: string | null) {
  try {
    await ensureSuggestionProposerColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET proposer_team = ${team} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionProposersMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await ensureSuggestionProposerColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, proposer_team FROM suggestions WHERE proposer_team IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; proposer_team: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const team = typeof r.proposer_team === 'string' ? r.proposer_team : '';
      if (id && team) out[id] = team;
    }
  } catch {}
  return out;
}

// --- Suggestion VAGUE flag ---
export async function ensureSuggestionVagueColumn() {
  try {
    const db = getDb();
    // use integer 0/1 for compatibility
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS vague integer DEFAULT 0 NOT NULL`);
  } catch {}
}

export async function setSuggestionVague(id: string, vague: boolean) {
  try {
    await ensureSuggestionVagueColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET vague = ${vague ? 1 : 0} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionVagueMap(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  try {
    await ensureSuggestionVagueColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, vague FROM suggestions`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; vague: number | string }> }).rows || [];
    type Row = { id: string; vague: number | string };
    for (const r of rawRows as Row[]) {
      const id = typeof r.id === 'string' ? r.id : '';
      const vRaw = r.vague;
      const vNum = typeof vRaw === 'number' ? vRaw : Number(vRaw ?? 0);
      if (id) out[id] = vNum === 1;
    }
  } catch {}
  return out;
}

// --- Suggestion endorsements (multiple teams) ---
export async function ensureSuggestionEndorsementsTable() {
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS suggestion_endorsements (
        suggestion_id uuid NOT NULL,
        team varchar(255) NOT NULL,
        endorsed_at timestamp DEFAULT now() NOT NULL,
        PRIMARY KEY (suggestion_id, team)
      )
    `);
  } catch {}
}

export async function addSuggestionEndorsement(suggestionId: string, team: string) {
  try {
    await ensureSuggestionEndorsementsTable();
    const db = getDb();
    await db.execute(sql`INSERT INTO suggestion_endorsements (suggestion_id, team) VALUES (${suggestionId}::uuid, ${team}) ON CONFLICT DO NOTHING`);
    return true;
  } catch {
    return false;
  }
}

export async function removeSuggestionEndorsement(suggestionId: string, team: string) {
  try {
    await ensureSuggestionEndorsementsTable();
    const db = getDb();
    await db.execute(sql`DELETE FROM suggestion_endorsements WHERE suggestion_id = ${suggestionId}::uuid AND team = ${team}`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionEndorsementsMap(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  try {
    await ensureSuggestionEndorsementsTable();
    const db = getDb();
    const res = await db.execute(sql`SELECT suggestion_id::text AS suggestion_id, team FROM suggestion_endorsements`);
    const rawRows = (res as unknown as { rows?: Array<{ suggestion_id: string; team: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.suggestion_id === 'string' ? r.suggestion_id : '';
      const team = typeof r.team === 'string' ? r.team : '';
      if (!id || !team) continue;
      if (!out[id]) out[id] = [];
      out[id].push(team);
    }
    // sort for stable UI
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.localeCompare(b));
  } catch {}
  return out;
}

// --- Suggestion vote tags (Voted On / Vote Passed / Vote Failed) ---
export async function ensureSuggestionVoteTagColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS vote_tag varchar(32)`);
  } catch {}
}

export type VoteTag = 'voted_on' | 'vote_passed' | 'vote_failed';

export async function setSuggestionVoteTag(id: string, tag: VoteTag | null) {
  try {
    await ensureSuggestionVoteTagColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET vote_tag = ${tag} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionVoteTagsMap(): Promise<Record<string, VoteTag>> {
  const out: Record<string, VoteTag> = {};
  try {
    await ensureSuggestionVoteTagColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, vote_tag FROM suggestions WHERE vote_tag IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; vote_tag: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const tag = typeof r.vote_tag === 'string' ? (r.vote_tag as VoteTag) : undefined;
      if (id && tag) out[id] = tag;
    }
  } catch {}
  return out;
}

// --- Suggestion grouping (multi-suggestion submissions) ---
export async function ensureSuggestionGroupColumns() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS group_id varchar(64)`);
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS group_pos integer DEFAULT 1 NOT NULL`);
  } catch {}
}

export async function setSuggestionGroup(id: string, groupId: string | null, groupPos?: number | null) {
  try {
    await ensureSuggestionGroupColumns();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET group_id = ${groupId}, group_pos = ${groupPos ?? 1} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionGroupsMap(): Promise<Record<string, { groupId: string; groupPos: number }>> {
  const out: Record<string, { groupId: string; groupPos: number }> = {};
  try {
    await ensureSuggestionGroupColumns();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, group_id, group_pos FROM suggestions WHERE group_id IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; group_id: string; group_pos: number | string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const gid = typeof r.group_id === 'string' ? r.group_id : '';
      const posRaw = r.group_pos;
      const pos = typeof posRaw === 'number' ? posRaw : Number(posRaw ?? 1);
      if (id && gid) out[id] = { groupId: gid, groupPos: pos > 0 ? pos : 1 };
    }
  } catch {}
  return out;
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

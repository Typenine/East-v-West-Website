import { getDb } from './client';
import { users, suggestions, taxiSquadMembers, taxiSquadEvents } from './schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

export type Role = 'admin' | 'user';

export async function createUser(params: { email: string; displayName?: string; role?: Role }) {
  const db = getDb();
  const [row] = await db.insert(users).values({ email: params.email, displayName: params.displayName, role: (params.role || 'user') as any }).returning();
  return row;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row || null;
}

export async function createSuggestion(params: { userId?: string | null; text: string; category?: string | null }) {
  const db = getDb();
  const [row] = await db.insert(suggestions).values({ userId: params.userId || null, text: params.text, category: params.category || null }).returning();
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
  const [row] = await db.update(taxiSquadMembers).set({ activeTo: activeTo || new Date() }).where(and(eq(taxiSquadMembers.teamId, teamId), eq(taxiSquadMembers.playerId, playerId), isNull(taxiSquadMembers.activeTo))).returning();
  return row || null;
}

export async function listTaxiMembers(teamId: string) {
  const db = getDb();
  const rows = await db.select().from(taxiSquadMembers).where(and(eq(taxiSquadMembers.teamId, teamId), isNull(taxiSquadMembers.activeTo)));
  return rows;
}

export async function logTaxiEvent(params: { teamId: string; playerId: string; eventType: 'add' | 'remove' | 'promote' | 'demote'; eventAt?: Date; meta?: Record<string, unknown> | null }) {
  const db = getDb();
  const [row] = await db.insert(taxiSquadEvents).values({ teamId: params.teamId, playerId: params.playerId, eventType: params.eventType as any, eventAt: params.eventAt || new Date(), meta: params.meta || null }).returning();
  return row;
}

export async function listTaxiEvents(teamId: string, limit = 100) {
  const db = getDb();
  const rows = await db.select().from(taxiSquadEvents).where(eq(taxiSquadEvents.teamId, teamId)).orderBy(desc(taxiSquadEvents.eventAt));
  return rows.slice(0, limit);
}

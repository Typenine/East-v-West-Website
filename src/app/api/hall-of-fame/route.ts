import { NextRequest } from 'next/server';
import { getHallOfFameActor, canManageFranchise } from '@/lib/hall-of-fame/auth';
import { getFranchisePlayerHistory, getHallOfFameIndex } from '@/lib/hall-of-fame/service';
import {
  getHallOfFameEntryById,
  softRemoveHallOfFameEntry,
  updateHallOfFameEntry,
  upsertHallOfFameEntry,
} from '@/server/db/hall-of-fame-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseInductionYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function parseBio(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const bio = value.trim();
  if (bio.length < 20 || bio.length > 2000) return null;
  return bio;
}

export async function GET() {
  const data = await getHallOfFameIndex();
  return Response.json(data);
}

export async function POST(req: NextRequest) {
  const actor = await getHallOfFameActor();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const franchiseId = typeof body.franchiseId === 'string' ? body.franchiseId : '';
  const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
  const inductionYear = parseInductionYear(body.inductionYear);
  const bio = parseBio(body.bio);

  if (!franchiseId || !playerId || inductionYear == null || bio == null) {
    return Response.json({ error: 'Player, franchise, induction class, and a 20–2000 character biography are required.' }, { status: 400 });
  }
  if (!canManageFranchise(actor, franchiseId)) {
    return Response.json({ error: actor.sessionValid ? 'You can only manage your own franchise Hall of Fame.' : 'Please sign in again.' }, { status: 403 });
  }

  const history = await getFranchisePlayerHistory(franchiseId);
  const candidate = history.find((row) => row.playerId === playerId);
  if (!candidate) {
    return Response.json({ error: 'That player does not have verifiable East v. West history with this franchise.' }, { status: 400 });
  }
  if (candidate.currentlyOnFranchise) {
    return Response.json({ error: 'A player must be off this franchise’s current roster before induction.' }, { status: 400 });
  }

  const entry = await upsertHallOfFameEntry({
    franchiseId,
    playerId,
    inductionYear,
    bio,
    createdBy: actor.isAdmin ? 'commissioner' : actor.teamName ?? franchiseId,
  });
  if (!entry) return Response.json({ error: 'Could not save Hall of Fame induction.' }, { status: 500 });
  return Response.json({ ok: true, id: entry.id });
}

export async function PATCH(req: NextRequest) {
  const actor = await getHallOfFameActor();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body.id === 'string' ? body.id : String(body.id ?? '');
  const inductionYear = parseInductionYear(body.inductionYear);
  const bio = parseBio(body.bio);
  if (!id || inductionYear == null || bio == null) {
    return Response.json({ error: 'Entry, induction class, and a 20–2000 character biography are required.' }, { status: 400 });
  }

  const existing = await getHallOfFameEntryById(id);
  if (!existing || existing.removedAt) return Response.json({ error: 'Hall of Fame entry not found.' }, { status: 404 });
  if (!canManageFranchise(actor, existing.franchiseId)) {
    return Response.json({ error: actor.sessionValid ? 'You can only edit your own franchise Hall of Fame.' : 'Please sign in again.' }, { status: 403 });
  }

  const updated = await updateHallOfFameEntry({ id, inductionYear, bio });
  if (!updated) return Response.json({ error: 'Could not update Hall of Fame entry.' }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const actor = await getHallOfFameActor();
  if (!actor.isAdmin) return Response.json({ error: 'Commissioner access required.' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body.id === 'string' ? body.id : String(body.id ?? '');
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;
  if (!id) return Response.json({ error: 'Hall of Fame entry is required.' }, { status: 400 });

  const existing = await getHallOfFameEntryById(id);
  if (!existing || existing.removedAt) return Response.json({ error: 'Hall of Fame entry not found.' }, { status: 404 });
  const ok = await softRemoveHallOfFameEntry({ id, removedBy: 'commissioner', reason });
  if (!ok) return Response.json({ error: 'Could not remove Hall of Fame entry.' }, { status: 500 });
  return Response.json({ ok: true });
}

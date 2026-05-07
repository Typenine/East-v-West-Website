import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { requireTeamUser } from '@/lib/server/session';
import { canonicalizeTeamName } from '@/lib/server/user-identity';

async function ensureTeamProspectDraftboardTable() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_prospect_draftboard_state (
      user_id varchar(64) PRIMARY KEY,
      team varchar(255) NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_team_prospect_draftboard_team ON team_prospect_draftboard_state(team)`).catch(() => {});
}

export async function GET() {
  try {
    const ident = await requireTeamUser();
    if (!ident) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureTeamProspectDraftboardTable();
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT data, updated_at
      FROM team_prospect_draftboard_state
      WHERE user_id = ${ident.userId}
      LIMIT 1
    `);
    const row = (rows as unknown as Array<{ data: unknown; updated_at: string }>)[0];
    return NextResponse.json({
      data: row?.data || {},
      updatedAt: row?.updated_at || null,
      team: canonicalizeTeamName(ident.team),
    });
  } catch (error) {
    console.error('team-prospect-draftboard GET failed', error);
    return NextResponse.json({ error: 'Failed to load board state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ident = await requireTeamUser();
    if (!ident) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return NextResponse.json({ error: 'Request body must include a JSON object "data" field.' }, { status: 400 });
    }

    await ensureTeamProspectDraftboardTable();
    const db = getDb();
    const rows = await db.execute(sql`
      INSERT INTO team_prospect_draftboard_state (user_id, team, data, updated_at)
      VALUES (${ident.userId}, ${canonicalizeTeamName(ident.team)}, ${JSON.stringify(body.data)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE
      SET team = EXCLUDED.team,
          data = EXCLUDED.data,
          updated_at = now()
      RETURNING data, updated_at
    `);

    const row = (rows as unknown as Array<{ data: unknown; updated_at: string }>)[0];
    return NextResponse.json({
      data: row?.data || body.data,
      updatedAt: row?.updated_at || null,
      team: canonicalizeTeamName(ident.team),
    });
  } catch (error) {
    console.error('team-prospect-draftboard POST failed', error);
    return NextResponse.json({ error: 'Failed to save board state' }, { status: 500 });
  }
}

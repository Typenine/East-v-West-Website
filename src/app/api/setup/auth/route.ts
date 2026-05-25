import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

// GET - Load teams with invite codes
export async function GET() {
  try {
    const db = getDb();

    const leagueRes = await db.execute(sql`
      SELECT id FROM leagues WHERE setup_completed = false ORDER BY created_at DESC LIMIT 1
    `);
    
    const leagueRow = (leagueRes as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    
    if (!leagueRow) {
      return NextResponse.json({ teams: [] });
    }

    const invitesRes = await db.execute(sql`
      SELECT team_name, invite_code FROM league_invites WHERE league_id = ${leagueRow.id}::uuid
    `);

    const teams = ((invitesRes as { rows?: Array<Record<string, unknown>> }).rows || []).map(row => ({
      teamName: row.team_name,
      inviteCode: row.invite_code,
    }));

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('[setup/auth GET] Error:', error);
    return NextResponse.json({ teams: [] });
  }
}

// POST - Save auth settings and complete setup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authMethod, defaultPin } = body;

    const db = getDb();

    const leagueRes = await db.execute(sql`
      SELECT id FROM leagues WHERE setup_completed = false ORDER BY created_at DESC LIMIT 1
    `);
    
    const leagueRow = (leagueRes as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    
    if (!leagueRow) {
      return NextResponse.json(
        { error: 'No league found. Please start setup from the beginning.' },
        { status: 400 }
      );
    }

    const leagueId = leagueRow.id;

    // If using default PIN, update all invites
    if (authMethod === 'pin' && defaultPin) {
      await db.execute(sql`
        UPDATE league_invites SET default_pin = ${defaultPin} WHERE league_id = ${leagueId}::uuid
      `);
    }

    // Update league config and mark setup as complete
    await db.execute(sql`
      UPDATE leagues SET
        setup_completed = true,
        config = jsonb_set(
          jsonb_set(
            COALESCE(config, '{}'),
            '{completedSetupSteps}',
            (
              SELECT COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["auth"]'::jsonb
              FROM leagues WHERE id = ${leagueId}::uuid
            )
          ),
          '{authMethod}',
          ${JSON.stringify(authMethod)}::jsonb
        ),
        updated_at = now()
      WHERE id = ${leagueId}::uuid
    `);

    return NextResponse.json({ success: true, leagueId });
  } catch (error) {
    console.error('[setup/auth POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save auth settings' },
      { status: 500 }
    );
  }
}

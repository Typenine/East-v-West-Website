import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

// GET - Load teams from league config
export async function GET() {
  try {
    const db = getDb();

    const leagueRes = await db.execute(sql`
      SELECT config FROM leagues WHERE setup_completed = false ORDER BY created_at DESC LIMIT 1
    `);
    
    const leagueRow = (leagueRes as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    
    if (!leagueRow) {
      return NextResponse.json({ teams: [] });
    }

    const config = (leagueRow.config as Record<string, unknown>) || {};
    const teams = (config.teams as Array<{ rosterId: number; teamName: string; ownerName: string }>) || [];

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('[setup/teams GET] Error:', error);
    return NextResponse.json({ teams: [] });
  }
}

// POST - Save team colors
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamColors } = body;

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

    await db.execute(sql`
      UPDATE leagues SET
        team_colors = ${JSON.stringify(teamColors || {})}::jsonb,
        config = jsonb_set(
          COALESCE(config, '{}'),
          '{completedSetupSteps}',
          (
            SELECT COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["teams"]'::jsonb
            FROM leagues WHERE id = ${leagueId}::uuid
          )
        ),
        updated_at = now()
      WHERE id = ${leagueId}::uuid
    `);

    return NextResponse.json({ success: true, leagueId });
  } catch (error) {
    console.error('[setup/teams POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save team colors' },
      { status: 500 }
    );
  }
}

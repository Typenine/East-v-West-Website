import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sleeperLeagueId, sleeperLeagueIds, teams } = body;

    if (!sleeperLeagueId) {
      return NextResponse.json(
        { error: 'Sleeper League ID is required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get the league being set up (most recent incomplete one)
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

    // Update league with Sleeper info
    await db.execute(sql`
      UPDATE leagues SET
        sleeper_league_id = ${sleeperLeagueId},
        sleeper_league_ids = ${JSON.stringify(sleeperLeagueIds)}::jsonb,
        config = jsonb_set(
          jsonb_set(
            COALESCE(config, '{}'),
            '{completedSetupSteps}',
            (
              SELECT COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["sleeper"]'::jsonb
              FROM leagues WHERE id = ${leagueId}::uuid
            )
          ),
          '{teams}',
          ${JSON.stringify(teams)}::jsonb
        ),
        updated_at = now()
      WHERE id = ${leagueId}::uuid
    `);

    // Create league invites for each team
    if (teams && Array.isArray(teams)) {
      for (const team of teams) {
        // Generate a random invite code
        const inviteCode = generateInviteCode();
        
        await db.execute(sql`
          INSERT INTO league_invites (league_id, team_name, roster_id, invite_code)
          VALUES (${leagueId}::uuid, ${team.teamName}, ${team.rosterId}, ${inviteCode})
          ON CONFLICT DO NOTHING
        `);
      }
    }

    return NextResponse.json({
      success: true,
      leagueId,
    });
  } catch (error) {
    console.error('[setup/sleeper] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save Sleeper settings' },
      { status: 500 }
    );
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, pin, displayName } = body;

    if (!email || !pin) {
      return NextResponse.json(
        { error: 'Email and PIN are required' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 6 digits' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get the league being set up
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

    // Check if email already exists
    const existingUser = await db.execute(sql`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    `);

    if ((existingUser as { rows?: Array<Record<string, unknown>> }).rows?.length) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Create admin user with PIN (stored as password_hash for simplicity)
    const userRes = await db.execute(sql`
      INSERT INTO users (email, display_name, password_hash, role, league_id)
      VALUES (${email}, ${displayName || null}, ${pin}, 'admin', ${leagueId}::uuid)
      RETURNING id
    `);

    const userId = (userRes as { rows?: Array<Record<string, unknown>> }).rows?.[0]?.id;

    // Update league config
    await db.execute(sql`
      UPDATE leagues SET
        config = jsonb_set(
          jsonb_set(
            COALESCE(config, '{}'),
            '{completedSetupSteps}',
            (
              SELECT COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["admin"]'::jsonb
              FROM leagues WHERE id = ${leagueId}::uuid
            )
          ),
          '{adminUserId}',
          ${JSON.stringify(userId)}::jsonb
        ),
        updated_at = now()
      WHERE id = ${leagueId}::uuid
    `);

    return NextResponse.json({
      success: true,
      userId,
      leagueId,
    });
  } catch (error) {
    console.error('[setup/admin] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create admin account' },
      { status: 500 }
    );
  }
}

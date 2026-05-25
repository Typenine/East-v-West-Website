import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { primaryColor, secondaryColor, logoUrl } = body;

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

    // Update league with branding
    await db.execute(sql`
      UPDATE leagues SET
        primary_color = ${primaryColor || null},
        secondary_color = ${secondaryColor || null},
        logo_url = ${logoUrl || null},
        config = jsonb_set(
          COALESCE(config, '{}'),
          '{completedSetupSteps}',
          (
            SELECT COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["branding"]'::jsonb
            FROM leagues WHERE id = ${leagueId}::uuid
          )
        ),
        updated_at = now()
      WHERE id = ${leagueId}::uuid
    `);

    return NextResponse.json({
      success: true,
      leagueId,
    });
  } catch (error) {
    console.error('[setup/branding] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save branding' },
      { status: 500 }
    );
  }
}

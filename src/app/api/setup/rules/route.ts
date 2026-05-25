import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rulesContent, rulesFileKey } = body;

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
        rules_content = ${rulesContent || null},
        rules_file_key = ${rulesFileKey || null},
        config = jsonb_set(
          COALESCE(config, '{}'),
          '{completedSetupSteps}',
          (
            SELECT COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["rules"]'::jsonb
            FROM leagues WHERE id = ${leagueId}::uuid
          )
        ),
        updated_at = now()
      WHERE id = ${leagueId}::uuid
    `);

    return NextResponse.json({ success: true, leagueId });
  } catch (error) {
    console.error('[setup/rules] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save rules' },
      { status: 500 }
    );
  }
}

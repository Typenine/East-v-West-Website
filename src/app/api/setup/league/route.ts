import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, slug, shortName, foundedYear } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Name and slug are required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if slug is already taken
    const existing = await db.execute(sql`
      SELECT id FROM leagues WHERE slug = ${slug} LIMIT 1
    `);
    
    const existingRow = (existing as { rows?: Array<Record<string, unknown>> }).rows?.[0];

    if (existingRow) {
      // Update existing league
      await db.execute(sql`
        UPDATE leagues SET
          name = ${name},
          short_name = ${shortName || null},
          founded_year = ${foundedYear || null},
          config = jsonb_set(
            COALESCE(config, '{}'),
            '{completedSetupSteps}',
            COALESCE(config->'completedSetupSteps', '[]'::jsonb) || '["league"]'::jsonb
          ),
          updated_at = now()
        WHERE slug = ${slug}
      `);

      return NextResponse.json({
        success: true,
        leagueId: existingRow.id,
        updated: true,
      });
    }

    // Create new league
    const result = await db.execute(sql`
      INSERT INTO leagues (slug, name, short_name, founded_year, config)
      VALUES (
        ${slug},
        ${name},
        ${shortName || null},
        ${foundedYear || null},
        '{"completedSetupSteps": ["league"]}'::jsonb
      )
      RETURNING id
    `);

    const newRow = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0];

    return NextResponse.json({
      success: true,
      leagueId: newRow?.id,
      created: true,
    });
  } catch (error) {
    console.error('[setup/league] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save league' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const db = getDb();
    
    // Check if any league exists and is setup completed
    const res = await db.execute(sql`
      SELECT id, setup_completed, config FROM leagues LIMIT 1
    `);
    
    const row = (res as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    
    if (!row) {
      // No league exists yet - need full setup
      return NextResponse.json({
        setupCompleted: false,
        completedSteps: [],
      });
    }
    
    if (row.setup_completed) {
      return NextResponse.json({
        setupCompleted: true,
        leagueId: row.id,
      });
    }
    
    // Get completed steps from config
    const config = (row.config as Record<string, unknown>) || {};
    const completedSteps = (config.completedSetupSteps as string[]) || [];
    
    return NextResponse.json({
      setupCompleted: false,
      leagueId: row.id,
      completedSteps,
    });
  } catch (error) {
    // DB not ready or table doesn't exist
    console.error('[setup/status] Error:', error);
    return NextResponse.json({
      setupCompleted: false,
      completedSteps: [],
      error: 'Database not ready',
    });
  }
}

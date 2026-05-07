import { NextResponse } from 'next/server';
import scoutingReports from '../../../../../prospect-draftboard/public/scouting-reports.json';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(scoutingReports, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to load scouting reports json', error);
    return NextResponse.json({ error: 'Scouting reports file not found' }, { status: 404 });
  }
}

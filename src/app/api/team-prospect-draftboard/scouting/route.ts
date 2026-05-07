import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const scoutingPath = path.join(process.cwd(), 'public', 'scouting-reports.json');
    const raw = await fs.readFile(scoutingPath, 'utf8');
    return new NextResponse(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to load scouting reports json', error);
    return NextResponse.json({ error: 'Scouting reports file not found' }, { status: 404 });
  }
}

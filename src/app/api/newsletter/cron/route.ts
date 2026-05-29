/**
 * Newsletter Cron Route — DISABLED
 *
 * This route was a legacy staged-generation system that was never finished.
 * It had several critical bugs:
 *  - Referenced `derived.scored_events` (correct field: `events_scored`)
 *  - Token caps of 100–500 produced unusable output
 *  - Used a simplified context builder that ignored enhanced context, memory, and personality
 *  - Section data was stored as flat { entertainer, analyst } strings, not typed section data
 *
 * The functionality has been replaced by:
 *  - POST /api/newsletter                   — starts a staged job (mode: 'start') or runs sync
 *  - POST /api/newsletter/generate-step     — advances one section per request (Vercel-safe)
 *  - GET  /api/newsletter/generate-step     — returns step progress
 *
 * If you need scheduled newsletter generation, use the GitHub Actions workflow:
 * .github/workflows/newsletter-scheduler.yml
 */

import { NextRequest, NextResponse } from 'next/server';

const DISABLED_MESSAGE = {
  disabled: true,
  reason: 'This legacy cron endpoint has been replaced by the staged generation system.',
  alternatives: {
    start_job:       'POST /api/newsletter { mode: "start", episodeType, week, season }',
    advance_step:    'POST /api/newsletter/generate-step { season, week }',
    check_progress:  'GET  /api/newsletter/generate-step?season=X&week=Y',
    github_actions:  '.github/workflows/newsletter-scheduler.yml',
  },
};

export async function POST(_request: NextRequest) {
  return NextResponse.json(DISABLED_MESSAGE, { status: 410 }); // 410 Gone
}

export async function GET(_request: NextRequest) {
  return NextResponse.json(DISABLED_MESSAGE, { status: 410 });
}

/**
 * East v. West Draft System — End-to-End Rehearsal Test
 *
 * Prerequisites:
 *   - DATABASE_URL in environment (Neon PostgreSQL)
 *   - ADMIN_SECRET in environment (value of the evw_admin cookie)
 *   - Dev server running at http://localhost:3000
 *   - Playwright Chromium installed: `npx playwright install chromium`
 *
 * Run:
 *   npx playwright test tests/e2e/draft-rehearsal.spec.ts --headed
 *
 * This test uses direct API calls (no full browser UI interaction) for speed
 * and reliability. Browser interaction is used only where the API contract
 * would not catch a bug (e.g., team room pick submission via team cookie).
 *
 * A shortened test draft (2 rounds × 2 teams = 4 slots) is used for most
 * scenarios. A separate assertion validates the 48-slot generation for the
 * full 12-team × 4-round East v. West configuration.
 */

import { test, expect, request as playwrightRequest } from 'playwright/test';
import { createHmac } from 'crypto';
import { TEAM_NAMES } from '../../src/lib/constants/league';

// ── Config ───────────────────────────────────────────────────────────────────

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
// Must match the EVW_ADMIN_SECRET set in .env.local (falls back to default '002023').
const ADMIN_SECRET = process.env.EVW_ADMIN_SECRET || process.env.ADMIN_SECRET || '002023';
const ADMIN_COOKIE = `evw_admin=${ADMIN_SECRET}`;

// Generates a signed evw_session cookie identical to the one signSession() produces.
// AUTH_SECRET must match what the dev/test server uses.
function makeTeamSessionCookie(team: string): string {
  const secret = process.env.AUTH_SECRET || 'evw-default-auth-secret-change-me';
  const payload = { team, sub: team, exp: Date.now() + 86_400_000 };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `evw_session=${data}.${sig}`;
}

// Short test draft: 2 rounds, 2 teams, 4 slots total
const TEST_TEAMS = ['Belltown Raptors', 'Detroit Dawgs'];
const TEST_ROUNDS = 2;
const EXPECTED_SLOTS = TEST_TEAMS.length * TEST_ROUNDS; // 4

// A real player ID from Sleeper (adjust if the player pool changes):
const PLAYER_1 = { id: '4017', name: 'Dalvin Cook', pos: 'RB', nfl: 'NYJ' };
const PLAYER_2 = { id: '4984', name: 'Aaron Jones', pos: 'RB', nfl: 'GB' };

let draftId: string;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function adminPost(ctx: Awaited<ReturnType<typeof playwrightRequest.newContext>>, body: object) {
  return ctx.post(`${BASE}/api/draft`, {
    headers: { 'content-type': 'application/json', cookie: ADMIN_COOKIE },
    data: body,
  });
}

async function teamPost(
  ctx: Awaited<ReturnType<typeof playwrightRequest.newContext>>,
  teamCookie: string,
  body: object,
) {
  return ctx.post(`${BASE}/api/draft`, {
    headers: { 'content-type': 'application/json', cookie: teamCookie },
    data: body,
  });
}

async function adminGet(ctx: Awaited<ReturnType<typeof playwrightRequest.newContext>>, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return ctx.get(`${BASE}/api/draft${qs ? `?${qs}` : ''}`, {
    headers: { cookie: ADMIN_COOKIE },
  });
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Allow skipping with either env var name for backwards compatibility.
  test.skip(
    !process.env.EVW_ADMIN_SECRET && !process.env.ADMIN_SECRET,
    'EVW_ADMIN_SECRET not set — skipping e2e rehearsal (set EVW_ADMIN_SECRET to run)'
  );
});

test.afterAll(async () => {
  if (!draftId) return;
  const ctx = await playwrightRequest.newContext();
  await adminPost(ctx, { action: 'delete', id: draftId });
  await ctx.dispose();
});

// ── Test suite ────────────────────────────────────────────────────────────────

test('48-slot generation for standard East v. West configuration', async () => {
  const ctx = await playwrightRequest.newContext();
  const res = await adminPost(ctx, {
    action: 'create',
    year: 2099,
    rounds: 4,
    teams: TEAM_NAMES,
    clockSeconds: 60,
  });
  const json = await res.json();
  expect(json.id).toBeTruthy();

  // Fetch the draft overview and count slots
  const overview = await adminGet(ctx, { id: json.id });
  const ovJson = await overview.json();
  expect(ovJson.draft.allSlots).toHaveLength(48);

  // Clean up this draft (not the main test draft)
  await adminPost(ctx, { action: 'delete', id: json.id });
  await ctx.dispose();
});

test.describe('full draft rehearsal (4-slot, 2-team)', () => {
  let ctx: Awaited<ReturnType<typeof playwrightRequest.newContext>>;
  // Signed evw_session cookies so the API's requireTeamUser() resolves to the correct team.
  const team1Cookie = makeTeamSessionCookie('Belltown Raptors');
  const team2Cookie = makeTeamSessionCookie('Detroit Dawgs');

  test.beforeAll(async () => {
    ctx = await playwrightRequest.newContext();

    // Create a short 2-round, 2-team draft
    const res = await adminPost(ctx, {
      action: 'create',
      year: 2099,
      rounds: TEST_ROUNDS,
      teams: TEST_TEAMS,
      clockSeconds: 90,
    });
    const json = await res.json();
    expect(json.id).toBeTruthy();
    draftId = json.id;
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  test('draft starts in NOT_STARTED state with correct slot count', async () => {
    const res = await adminGet(ctx, { id: draftId });
    const json = await res.json();
    expect(json.draft.status).toBe('NOT_STARTED');
    expect(json.draft.allSlots).toHaveLength(EXPECTED_SLOTS);
  });

  test('cannot start draft when another is already LIVE (multiple active guard)', async () => {
    // This test is only meaningful if there's actually a live draft in the DB.
    // We skip if we can't confirm that state — it's validated in unit tests.
    test.skip(true, 'multi-active guard tested in unit tests');
  });

  test('admin starts the draft', async () => {
    const res = await adminPost(ctx, { action: 'start', id: draftId });
    const json = await res.json();
    expect(json.ok).toBe(true);

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('LIVE');
    expect(ovJson.draft.curOverall).toBe(1);
    expect(ovJson.draft.onClockTeam).toBe('Belltown Raptors');
  });

  test('multiple team-room clients can poll simultaneously', async () => {
    // Simulate 3 simultaneous GET polls (overlay + 2 team rooms)
    const [r1, r2, r3] = await Promise.all([
      adminGet(ctx, { id: draftId }),
      ctx.get(`${BASE}/api/draft?id=${draftId}`, { headers: { cookie: team1Cookie } }),
      ctx.get(`${BASE}/api/draft?id=${draftId}`, { headers: { cookie: team2Cookie } }),
    ]);
    const [j1, j2, j3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
    for (const j of [j1, j2, j3]) {
      expect(j.draft.status).toBe('LIVE');
      expect(j.draft.curOverall).toBe(1);
    }
  });

  test('wrong team cannot submit a pick', async () => {
    // Detroit Dawgs tries to pick when Belltown Raptors is on the clock
    const res = await teamPost(ctx, team2Cookie, {
      action: 'pick',
      id: draftId,
      playerId: PLAYER_1.id,
      playerName: PLAYER_1.name,
      playerPos: PLAYER_1.pos,
      playerNfl: PLAYER_1.nfl,
    });
    const json = await res.json();
    expect(json.error).toBe('not_your_turn');
  });

  test('correct team (Belltown Raptors) submits pick 1', async () => {
    const res = await teamPost(ctx, team1Cookie, {
      action: 'pick',
      id: draftId,
      playerId: PLAYER_1.id,
      playerName: PLAYER_1.name,
      playerPos: PLAYER_1.pos,
      playerNfl: PLAYER_1.nfl,
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.pending).toBe(true);

    // Draft should now be paused (pending pick)
    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('PAUSED');
    expect(ovJson.draft.pauseReason).toBe('pending_pick');
  });

  test('admin sees the pending pick', async () => {
    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.pendingPick).toBeTruthy();
    expect(ovJson.pendingPick.playerId).toBe(PLAYER_1.id);
    expect(ovJson.pendingPick.team).toBe('Belltown Raptors');
  });

  test('duplicate submission of same player returns ok with duplicate:true', async () => {
    // Re-submitting the exact same player while it is pending must be idempotent.
    // The new logic: if alreadyPending.playerId === playerId, return ok+duplicate:true.
    const res = await teamPost(ctx, team1Cookie, {
      action: 'pick',
      id: draftId,
      playerId: PLAYER_1.id,
      playerName: PLAYER_1.name,
      playerPos: PLAYER_1.pos,
      playerNfl: PLAYER_1.nfl,
    });
    const json = await res.json();
    // Exact duplicate — should succeed idempotently (no error)
    expect(json.ok).toBe(true);
    expect(json.duplicate).toBe(true);
  });

  test('admin approves pick 1 — animation pause starts', async () => {
    const res = await adminPost(ctx, { action: 'approve_pick', id: draftId });
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Draft should be in animation pause
    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('PAUSED');
    expect(ovJson.draft.pauseReason).toBe('pick_animation');
    expect(ovJson.draft.allPicks).toHaveLength(1);
    expect(ovJson.draft.allPicks[0].playerId).toBe(PLAYER_1.id);
  });

  test('anim_clock_start resumes the clock for the next team', async () => {
    // Any authenticated user can call this
    const res = await teamPost(ctx, team1Cookie, {
      action: 'anim_clock_start',
      id: draftId,
    });
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Draft should now be LIVE with Detroit Dawgs on the clock
    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('LIVE');
    expect(ovJson.draft.onClockTeam).toBe('Detroit Dawgs');
    expect(ovJson.draft.curOverall).toBe(2);
  });

  test('commissioner can reassign a future slot', async () => {
    // Slot 3 (overall=3) is in round 2 — reassign it to Belltown Raptors
    const res = await adminPost(ctx, {
      action: 'update_slot',
      id: draftId,
      overall: 3,
      team: 'Belltown Raptors',
    });
    const json = await res.json();
    expect(json.ok).toBe(true);

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    const slot3 = (ovJson.draft.allSlots as Array<{ overall: number; team: string }>).find((s) => s.overall === 3);
    expect(slot3?.team).toBe('Belltown Raptors');

    // Restore original assignment
    await adminPost(ctx, {
      action: 'update_slot',
      id: draftId,
      overall: 3,
      team: 'Belltown Raptors', // snake would be Belltown Raptors in R2
    });
  });

  test('Detroit Dawgs picks player 2 (overall=2)', async () => {
    const res = await teamPost(ctx, team2Cookie, {
      action: 'pick',
      id: draftId,
      playerId: PLAYER_2.id,
      playerName: PLAYER_2.name,
      playerPos: PLAYER_2.pos,
      playerNfl: PLAYER_2.nfl,
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  test('admin approves pick 2 → end of round 1 enters round-end pause', async () => {
    await adminPost(ctx, { action: 'approve_pick', id: draftId });
    // Signal animation done
    await teamPost(ctx, team1Cookie, { action: 'anim_clock_start', id: draftId });

    // After pick 2 of 2 in round 1, the draft enters round_end pause
    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.roundEndPause).toBe(true);
    expect(ovJson.draft.pauseReason).toBe('round_end');
  });

  test('admin starts round 2 by resuming', async () => {
    const res = await adminPost(ctx, { action: 'resume', id: draftId });
    const json = await res.json();
    expect(json.ok).toBe(true);

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('LIVE');
    // Round 2 pick 1 (overall=3)
    expect(ovJson.draft.curOverall).toBe(3);
  });

  test('undo restores pick correctly', async () => {
    // We have 2 picks so far. Undo the last one (overall=2, Detroit Dawgs / PLAYER_2).
    const res = await adminPost(ctx, { action: 'undo', id: draftId });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.overall).toBe(2); // cursor returned to slot 2

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.allPicks).toHaveLength(1); // only pick 1 remains
    expect(ovJson.draft.curOverall).toBe(2);
    expect(ovJson.draft.status).toBe('PAUSED');
  });

  test('skip_pick advances correctly (skips slot 2)', async () => {
    const res = await adminPost(ctx, { action: 'skip_pick', id: draftId });
    const json = await res.json();
    expect(json.ok).toBe(true);

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    // After skipping slot 2 (round 1 last pick), next is slot 3 (round 2)
    // — triggers round-end pause
    expect(ovJson.draft.curOverall).toBe(3);
  });

  test('final pick completes the draft', async () => {
    // Resume into round 2
    await adminPost(ctx, { action: 'resume', id: draftId });

    // Pick slot 3 (Belltown Raptors, reassigned above)
    await teamPost(ctx, team1Cookie, {
      action: 'pick', id: draftId, playerId: 'p3', playerName: 'Test P3', playerPos: 'QB', playerNfl: 'SEA',
    });
    await adminPost(ctx, { action: 'approve_pick', id: draftId });
    await teamPost(ctx, team1Cookie, { action: 'anim_clock_start', id: draftId });

    // Pick slot 4 (Detroit Dawgs, round 2 pick 2)
    await teamPost(ctx, team2Cookie, {
      action: 'pick', id: draftId, playerId: 'p4', playerName: 'Test P4', playerPos: 'RB', playerNfl: 'KC',
    });
    await adminPost(ctx, { action: 'approve_pick', id: draftId });
    await teamPost(ctx, team1Cookie, { action: 'anim_clock_start', id: draftId });

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('COMPLETED');
    expect(ovJson.draft.allPicks).toHaveLength(3); // slots 1, 3, 4 (slot 2 was skipped)
  });

  test('completed draft cannot be resumed', async () => {
    const res = await adminPost(ctx, { action: 'resume', id: draftId });
    const json = await res.json();
    expect(json.error).toBe('draft_completed');
  });

  test('reset returns draft to clean NOT_STARTED state', async () => {
    const res = await adminPost(ctx, { action: 'reset', id: draftId });
    const json = await res.json();
    expect(json.ok).toBe(true);

    const overview = await adminGet(ctx, { id: draftId });
    const ovJson = await overview.json();
    expect(ovJson.draft.status).toBe('NOT_STARTED');
    expect(ovJson.draft.allPicks).toHaveLength(0);
    expect(ovJson.draft.curOverall).toBe(1);
    expect(ovJson.draft.roundEndPause).toBeFalsy();
    expect(ovJson.draft.pauseReason).toBeNull();
    expect(ovJson.draft.completedAt).toBeNull();
  });
});

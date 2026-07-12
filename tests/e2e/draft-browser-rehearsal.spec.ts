/**
 * Browser-level draft room smoke rehearsal.
 *
 * This complements draft-rehearsal.spec.ts, which exercises the real API and
 * state machine. Network fixtures keep this browser test non-destructive while
 * verifying the rendered team-room experience and native instant-submit flow.
 */

import { expect, test } from 'playwright/test';
import { createHmac } from 'node:crypto';
import { DRAFT_TRADE_ALERT_AUDIO_SRC } from '../../src/components/draft-overlay/draft-display-utils';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEAM = 'Belleview Badgers';
const QUEUED_PLAYER = { id: 'rookie-1', name: 'Queue Leader', pos: 'WR', nfl: 'SEA' };

function makeTeamSessionToken(team: string): string {
  const secret = process.env.AUTH_SECRET || 'evw-default-auth-secret-change-me';
  const payload = { team, sub: team, exp: Date.now() + 86_400_000 };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

test('team room renders native instant submit and sends one queued pick', async ({ context, page }) => {
  await context.addCookies([{
    name: 'evw_session',
    value: makeTeamSessionToken(TEAM),
    url: BASE,
  }]);
  await page.addInitScript(({ team }) => {
    localStorage.setItem(`evw_draft_autopick_${team}`, 'true');
  }, { team: TEAM });

  const pickBodies: Array<Record<string, unknown>> = [];
  let pendingPick: Record<string, unknown> | null = null;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (url.pathname === '/api/auth/me') {
      return respond({ authenticated: true, isAdmin: false, claims: { team: TEAM } });
    }
    if (url.pathname === '/api/draft/player-videos') return respond({ videos: [] });
    if (url.pathname === '/api/team-prospect-draftboard') return respond({ data: { orderIds: [] } });
    if (url.pathname === '/api/draft/team-roster') return respond({ players: [], fromSnapshot: true });
    if (url.pathname === '/api/draft/trade') return respond({ trades: [] });

    if (url.pathname === '/api/draft') {
      if (request.method() === 'GET') {
        return respond({
          draft: {
            id: 'browser-rehearsal',
            year: 2026,
            rounds: 1,
            clockSeconds: 60,
            status: pendingPick ? 'PAUSED' : 'LIVE',
            curOverall: 1,
            onClockTeam: pendingPick ? null : TEAM,
            deadlineTs: new Date(Date.now() + 60_000).toISOString(),
            recentPicks: [],
            allPicks: [],
            upcoming: [{ overall: 1, round: 1, team: TEAM }],
            allSlots: [{ overall: 1, round: 1, team: TEAM }],
            roundEndPause: false,
            pendingTradeAnimation: null,
          },
          pendingPick,
          remainingSec: pendingPick ? 60 : 59,
          available: [QUEUED_PLAYER],
          usingCustom: true,
          activeViewers: [TEAM],
        });
      }

      const body = (request.postDataJSON() || {}) as Record<string, unknown>;
      if (body.action === 'queue_get') return respond({ ok: true, queue: [QUEUED_PLAYER] });
      if (body.action === 'available') return respond({ available: [QUEUED_PLAYER], usingCustom: true });
      if (body.action === 'presence') return respond({ ok: true, activeViewers: [TEAM] });
      if (body.action === 'pick') {
        pickBodies.push(body);
        pendingPick = {
          id: 'pending-browser-pick',
          overall: 1,
          team: TEAM,
          playerId: body.playerId,
          playerName: body.playerName,
          playerPos: body.playerPos,
          playerNfl: body.playerNfl,
        };
        return respond({ ok: true, pending: true });
      }
      return respond({ ok: true });
    }

    return respond({});
  });

  await page.goto('/draft/room/team');
  await page.getByRole('button', { name: 'Queue' }).first().click();

  await expect(page.getByText('Instant submit', { exact: true })).toBeVisible();
  await expect(page.getByText('Top queued player submits immediately when you are on the clock.')).toBeVisible();
  await expect.poll(() => pickBodies.length).toBe(1);
  expect(pickBodies[0]).toMatchObject({
    action: 'pick',
    playerId: QUEUED_PLAYER.id,
    playerName: QUEUED_PLAYER.name,
  });
});

test('trade alert media is served from the same project audio directory', async ({ request }) => {
  const response = await request.get(DRAFT_TRADE_ALERT_AUDIO_SRC);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('video/mp4');
  expect((await response.body()).byteLength).toBeGreaterThan(1_000);
});

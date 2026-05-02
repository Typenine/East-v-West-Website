import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNFLState: vi.fn(),
  getTeamsData: vi.fn(),
  getLeagueRosters: vi.fn(),
  getAllPlayersCached: vi.fn(),
  validateTaxiForRoster: vi.fn(),
  getTaxiObservation: vi.fn(),
  setTaxiObservation: vi.fn(),
  writeTaxiSnapshot: vi.fn(),
}));

vi.mock('@/lib/utils/sleeper-api', () => ({
  getNFLState: mocks.getNFLState,
  getTeamsData: mocks.getTeamsData,
  getLeagueRosters: mocks.getLeagueRosters,
  getAllPlayersCached: mocks.getAllPlayersCached,
}));

vi.mock('@/lib/constants/league', () => ({
  LEAGUE_IDS: {
    CURRENT: 'test-current-league',
    PREVIOUS: {},
  },
  TEAM_NAMES: ['Fallback Team'],
}));

vi.mock('@/lib/server/taxi-validator', () => ({
  validateTaxiForRoster: mocks.validateTaxiForRoster,
}));

vi.mock('@/server/db/queries.fixed', () => ({
  getTaxiObservation: mocks.getTaxiObservation,
  setTaxiObservation: mocks.setTaxiObservation,
  writeTaxiSnapshot: mocks.writeTaxiSnapshot,
}));

describe('taxi cron route', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalTaxiCronSecret = process.env.TAXI_CRON_SECRET;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T08:16:00Z'));
    vi.resetAllMocks();
    mocks.setTaxiObservation.mockResolvedValue(null);
    process.env.CRON_SECRET = 'shared-secret';
    delete process.env.TAXI_CRON_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalTaxiCronSecret === undefined) delete process.env.TAXI_CRON_SECRET;
    else process.env.TAXI_CRON_SECRET = originalTaxiCronSecret;
  });

  it('rejects requests without a matching cron secret', async () => {
    const { POST } = await import('@/app/api/taxi/cron/route');

    const response = await POST(new Request('https://example.test/api/taxi/cron', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong-secret' },
    }));

    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(response.status).toBe(401);
    expect(mocks.getTeamsData).not.toHaveBeenCalled();
  });

  it('tracks taxi squad movement on off-window hourly runs without writing compliance snapshots', async () => {
    mocks.getNFLState.mockResolvedValue({ season: 2026, week: 0 });
    mocks.getTeamsData.mockResolvedValue([{ teamName: 'Belltown Raptors', rosterId: 1 }]);
    mocks.getLeagueRosters.mockResolvedValue([{ roster_id: 1, taxi: ['101', '202'] }]);
    mocks.getAllPlayersCached.mockResolvedValue({ '101': { position: 'RB' }, '202': { position: 'QB' } });
    mocks.getTaxiObservation.mockResolvedValue({ players: { '101': { firstSeen: '2026-05-01T00:00:00.000Z', lastSeen: '2026-05-01T00:00:00.000Z', seenCount: 1 } } });
    mocks.setTaxiObservation.mockResolvedValue(null);
    const { POST } = await import('@/app/api/taxi/cron/route');

    const response = await POST(new Request('https://example.test/api/taxi/cron', {
      method: 'POST',
      headers: { Authorization: 'Bearer shared-secret' },
    }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      runType: 'admin_rerun',
      trackingOnly: true,
      processed: 1,
      teamsWithViolations: 0,
    });
    expect(response.status).toBe(200);
    expect(mocks.setTaxiObservation).toHaveBeenCalledWith('Belltown Raptors', {
      updatedAt: new Date('2026-05-02T08:16:00Z'),
      players: {
        '101': { firstSeen: '2026-05-01T00:00:00.000Z', lastSeen: '2026-05-02T08:16:00.000Z', seenCount: 2 },
        '202': { firstSeen: '2026-05-02T08:16:00.000Z', lastSeen: '2026-05-02T08:16:00.000Z', seenCount: 1 },
      },
    });
    expect(mocks.writeTaxiSnapshot).not.toHaveBeenCalled();
    expect(mocks.validateTaxiForRoster).not.toHaveBeenCalled();
  });
});
